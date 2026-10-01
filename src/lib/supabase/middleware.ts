import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน:
// - /login, /auth: หน้าเข้าสู่ระบบ
// - /api/health: health check ของ ALB/ECS
// - /f: หน้ากรอกฟอร์มสาธารณะ (QR / ลิงก์แชร์) — กรอก+ส่งได้โดยไม่ต้องล็อกอิน
// - /api/public: API รับการส่งฟอร์มสาธารณะ (ตรวจสิทธิ์ฟอร์ม public ในตัว)
// - /api/v1: API สำหรับระบบภายนอก (ตรวจ API key ในตัว เช่น push ข้อมูลเข้า dataset)
// - /api/cron: งานตั้งเวลา (ตรวจ CRON_SECRET ในตัว)
// - /api/billing/callback: ผลการชำระจาก Payment Gateway (ตรวจลายเซ็นในตัว)
// - /sw.js, /offline, /manifest: ไฟล์ PWA/ออฟไลน์
const PUBLIC_PATHS = ["/login", "/auth", "/api/health", "/f/", "/api/public", "/api/v1/", "/api/cron/", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

// เส้นทางที่ไม่ใช้ session ผู้ใช้เลย (ตรวจ API key / secret เอง หรือเป็นไฟล์) — ข้ามการเช็ก login ทั้งหมด
const NO_SESSION_PATHS = ["/api/health", "/api/public", "/api/v1/", "/api/cron/", "/api/billing/callback", "/sw.js", "/offline", "/manifest"];

export async function updateSession(request: NextRequest) {
  if (NO_SESSION_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
