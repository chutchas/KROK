// ============================================================
// KROK · รับลิงก์จากอีเมลของ Supabase Auth (ยืนยันการสมัคร / ลิงก์เข้าสู่ระบบ / รีเซ็ตรหัสผ่าน)
//
// รองรับ 2 แบบ:
//   ?code=...                      (ค่าเริ่มต้นของ template Supabase + signUp แบบ PKCE)
//   ?token_hash=...&type=signup    (ถ้าแก้ template เป็น {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email)
// สำเร็จ → เข้าแอป (next) · เปิดลิงก์คนละเครื่องกับที่สมัคร (PKCE แลก code ไม่ได้ แต่ Supabase ยืนยันอีเมลไปแล้ว)
//   → กลับหน้า login พร้อมข้อความ "ยืนยันอีเมลแล้ว เข้าสู่ระบบได้เลย"
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** กันเปิด redirect ไปเว็บอื่น: รับเฉพาะ path ภายใน */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  if (ok) return NextResponse.redirect(new URL(next, url.origin));

  // Supabase ส่ง error มากับลิงก์ (เช่น ลิงก์หมดอายุ) หรือแลก code ไม่ได้
  const desc = url.searchParams.get("error_description") || url.searchParams.get("error");
  const back = new URL("/login", url.origin);
  if (next.startsWith("/reset-password")) back.searchParams.set("auth_error", "reset"); // ลิงก์รีเซ็ตใช้ไม่ได้/เปิดคนละเบราว์เซอร์ → ขอใหม่
  else if (code && !desc) back.searchParams.set("confirmed", "1"); // ยืนยันแล้ว แต่ต้องล็อกอินเอง (เปิดคนละเครื่อง)
  else back.searchParams.set("auth_error", desc ? desc.slice(0, 200) : "1");
  return NextResponse.redirect(back);
}
