import { createServerClient } from "@supabase/ssr";
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
const PUBLIC_PATHS = ["/login", "/auth", "/privacy", "/terms", "/api/health", "/f/", "/api/public", "/api/client-error", "/api/v1/", "/api/cron/", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

// เส้นทางที่ไม่ใช้ session ผู้ใช้เลย (ตรวจ API key / secret เอง หรือเป็นไฟล์) — ข้ามการเช็ก login ทั้งหมด
const NO_SESSION_PATHS = ["/api/health", "/api/public", "/api/client-error", "/api/v1/", "/api/cron/", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

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

  if (NO_SESSION_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return next();

  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims: ต่ออายุ token ที่หมดอายุ + ตรวจลายเซ็น JWT ในเครื่อง (HS256 เดิม = fallback ไป getUser ให้เอง)
  const { data: claimData } = await supabase.auth.getClaims();
  const user = claimData?.claims?.sub ? claimData.claims : null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // ค้างขั้นกรอกรหัส 2FA (/login?mfa=1) → อยู่หน้า login ได้ ไม่เด้งเข้าแดชบอร์ด (กันวนรอบ)
  if (user && path === "/login" && !request.nextUrl.searchParams.has("mfa")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
