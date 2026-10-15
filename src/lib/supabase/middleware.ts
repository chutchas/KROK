import { createServerClient, combineChunks, stringFromBase64URL, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

// เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน:
// - /login, /auth: หน้าเข้าสู่ระบบ
// - /api/health: health check ของ ALB/ECS
// - /f: หน้ากรอกฟอร์มสาธารณะ (QR / ลิงก์แชร์) — กรอก+ส่งได้โดยไม่ต้องล็อกอิน
// - /api/public: API รับการส่งฟอร์มสาธารณะ (ตรวจสิทธิ์ฟอร์ม public ในตัว)
// - /api/v1: API สำหรับระบบภายนอก (ตรวจ API key ในตัว เช่น push ข้อมูลเข้า dataset)
// - /api/cron: งานตั้งเวลา (ตรวจ CRON_SECRET ในตัว)
// - /api/billing/callback: ผลการชำระจาก Payment Gateway (ตรวจลายเซ็นในตัว)
// - /sw.js, /offline, /manifest: ไฟล์ PWA/ออฟไลน์
const PUBLIC_PATHS = ["/login", "/auth", "/privacy", "/terms", "/contact", "/api/health", "/f/", "/api/public", "/api/client-error", "/api/v1/", "/api/cron/", "/api/push/dispatch", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

// เส้นทางที่ไม่ใช้ session ผู้ใช้เลย (ตรวจ API key / secret เอง หรือเป็นไฟล์) — ข้ามการเช็ก login ทั้งหมด
const NO_SESSION_PATHS = ["/api/health", "/api/public", "/api/client-error", "/api/v1/", "/api/cron/", "/api/push/dispatch", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

/** ตรงเส้นทาง: รายการที่ลงท้าย "/" = ขึ้นต้นด้วย · ไม่ลงท้าย = ตรงทั้งตัว หรือมี "/" "." ต่อ (กัน "/contactX" กลายเป็นหน้าสาธารณะ) */
const matches = (path: string, p: string) =>
  p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/") || path.startsWith(p + ".");

// ---- กัน session หลุดจากการต่ออายุ token พร้อมกันหลายคำขอ ----
// เดิม: token หมดอายุ → ทุกคำขอ (รวม prefetch ของลิงก์ที่เข้าจอพร้อมกันหลายตัว) ยิง refresh พร้อมกัน
// → Supabase ตอบ 429 → auth-js ถือว่า session ตาย (429 ไม่ใช่ retryable) แล้วลบ cookie = ผู้ใช้หลุด

/** คำขอ prefetch ของ Next (Link เข้าจอ) — ไม่ใช่การเปิดหน้าจริง */
const isPrefetch = (r: NextRequest) =>
  r.headers.get("next-router-prefetch") === "1" || r.headers.get("purpose") === "prefetch" || r.headers.get("sec-purpose")?.includes("prefetch") === true;

/** คำขอ RSC (ข้อมูลหน้า ไม่ใช่เอกสาร HTML) */
const isRsc = (r: NextRequest) => r.headers.get("rsc") === "1" || r.nextUrl.searchParams.has("_rsc");

const AUTH_COOKIE = (() => {
  try { return `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`; } catch { return ""; }
})();

/**
 * access token ใน cookie หมดอายุ (หรือใกล้หมด ≤ 90 วิ) ไหม — อ่านจาก cookie เอง ไม่เรียกเครือข่าย
 * อ่านไม่ได้/ไม่มี session = null (ไม่รู้)
 */
async function accessTokenExpired(r: NextRequest): Promise<boolean | null> {
  if (!AUTH_COOKIE) return null;
  try {
    const raw = await combineChunks(AUTH_COOKIE, (name) => r.cookies.get(name)?.value);
    if (!raw) return null;
    const json = raw.startsWith("base64-") ? stringFromBase64URL(raw.slice(7)) : raw;
    const exp = Number((JSON.parse(json) as { expires_at?: number }).expires_at);
    if (!Number.isFinite(exp)) return null;
    // 90 วิ = เกณฑ์เดียวกับ auth-js (EXPIRY_MARGIN_MS) ที่เริ่มต่ออายุ — ต่ำกว่านี้ prefetch ยังยิง refresh ได้
    return exp * 1000 - Date.now() <= 90_000;
  } catch {
    return null;
  }
}

/** Supabase ขัดข้องชั่วคราว (ขอถี่เกิน / ล่ม) — ไม่ใช่ session ตายจริง */
const isTransientAuthError = (e: unknown) => {
  const st = (e as { status?: number } | null)?.status;
  const name = (e as { name?: string } | null)?.name;
  return st === 429 || (typeof st === "number" && st >= 500) || name === "AuthRetryableFetchError";
};

/**
 * Supabase ขัดข้อง — เก็บ session ไว้ ให้ลองใหม่ (ไม่มีสคริปต์ จึงไม่ต้องใช้ nonce)
 * หน้าเอกสาร: รอ 3 → 6 → 12 → 24 วิ (นับรอบด้วย ?_ar=) ครบแล้วหยุด ให้กดลองใหม่เอง
 * header x-krok-auth-retry = 503 จาก proxy นี้ (แยกจาก 503 ของ Vercel ใน log)
 */
const RETRY_STEPS = [3, 6, 12, 24];
function retryResponse(r: NextRequest) {
  const base = { "Cache-Control": "no-store", "x-krok-auth-retry": "1" };
  if (isRsc(r) || isPrefetch(r)) return new NextResponse(null, { status: 503, headers: { ...base, "Retry-After": "3" } });
  const n = Math.max(0, Math.min(RETRY_STEPS.length, Number(r.nextUrl.searchParams.get("_ar")) || 0));
  const wait = RETRY_STEPS[n];
  const nextUrl = r.nextUrl.clone();
  nextUrl.searchParams.set("_ar", String(n + 1));
  const retryUrl = r.nextUrl.clone();
  retryUrl.searchParams.delete("_ar");
  const esc = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const target = esc(`${nextUrl.pathname}${nextUrl.search}`);
  const again = esc(`${retryUrl.pathname}${retryUrl.search}`);
  const auto = wait != null;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${auto ? `<meta http-equiv="refresh" content="${wait};url=${target}">` : ""}<title>กำลังเชื่อมต่อใหม่</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#0f1d2e;background:#f6f9fb"><main style="text-align:center;line-height:1.6;padding:16px">${auto
    ? `<p>กำลังเชื่อมต่อใหม่…<br><small style="color:#4a5b6e">ระบบยืนยันตัวตนตอบช้าชั่วคราว จะลองใหม่เองใน ${wait} วินาที</small></p>`
    : `<p>ยังเชื่อมต่อระบบยืนยันตัวตนไม่ได้<br><small style="color:#4a5b6e">ข้อมูลการเข้าสู่ระบบของคุณยังอยู่ ลองใหม่อีกครั้งในอีกสักครู่</small></p><p><a href="${again}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2f6fe0;color:#fff;text-decoration:none;font-weight:600">ลองใหม่</a> <a href="/login" style="display:inline-block;padding:12px 16px;color:#2559c4">ไปหน้าเข้าสู่ระบบ</a></p>`}</main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { ...base, "Retry-After": String(wait ?? 30), "Content-Type": "text/html; charset=utf-8" } });
}

export async function updateSession(request: NextRequest) {
  // CSP + nonce ใหม่ทุกคำขอ — Next แปะ nonce ให้สคริปต์ของตัวเองอัตโนมัติจาก header นี้ (หน้าต้อง render แบบ dynamic)
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  // สร้าง response ที่ส่ง header ของคำขอ (รวม cookie ที่เพิ่งต่ออายุ) + nonce ต่อให้หน้า
  const next = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("content-security-policy", csp);
    const r = NextResponse.next({ request: { headers: h } });
    r.headers.set("Content-Security-Policy", csp);
    return r;
  };

  if (NO_SESSION_PATHS.some((p) => matches(request.nextUrl.pathname, p))) return next();

  // prefetch + token หมดอายุ → ไม่ต่ออายุตรงนี้ (กันยิง refresh เป็นชุด) · เปิดหน้าจริงค่อยต่อ
  if (isPrefetch(request) && (await accessTokenExpired(request)) === true) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  let response = next();
  // เก็บ cookie ที่ไลบรารีอยากเขียนไว้ก่อน — ตัดสินใจหลังรู้ผล (ขัดข้องชั่วคราว = ไม่ลบ session)
  const pending: { list: { name: string; value: string; options: CookieOptions }[] | null } = { list: null };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pending.list = cookiesToSet;
        },
      },
    }
  );

  // getClaims: ต่ออายุ token ที่หมดอายุ + ตรวจลายเซ็น JWT ในเครื่อง (HS256 เดิม = fallback ไป getUser ให้เอง)
  const { data: claimData, error: claimErr } = await supabase.auth.getClaims();
  const user = claimData?.claims?.sub ? claimData.claims : null;

  // ต่ออายุไม่สำเร็จเพราะ Supabase ขัดข้องชั่วคราว → ไม่เขียน cookie (ไม่ลบ session) และให้ลองใหม่
  if (!user && claimErr && isTransientAuthError(claimErr)) return retryResponse(request);

  const toSet = pending.list;
  if (toSet) {
    toSet.forEach(({ name, value }) => request.cookies.set(name, value));
    response = next();
    toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => matches(path, p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // หน้าแรก "/" = คนทั่วไปเข้าเว็บ → ไปหน้า landing เฉย ๆ (มี next = หน้า landing เปิดกล่องเข้าสู่ระบบทับทันที)
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // ค้างขั้นกรอกรหัส 2FA (/login?mfa=1) → อยู่หน้า login ได้ ไม่เด้งเข้าแดชบอร์ด (กันวนรอบ)
  // มีข้อความจากลิงก์อีเมล (?auth_error=) → แสดงหน้า login ให้เห็นข้อความ ไม่เด้งเข้าแอปด้วยบัญชีที่ค้างอยู่
  if (user && path === "/login" && !request.nextUrl.searchParams.has("mfa") && !request.nextUrl.searchParams.has("auth_error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
