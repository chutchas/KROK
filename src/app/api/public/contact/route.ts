import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/client-ip";
import { rateLimited } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-origin";
import { sm } from "@/lib/server-msg";
import { cleanContact, contactEmail, contactErrors, CONTACT_MIN_MS } from "@/lib/contact";

// ============================================================
// ฟอร์ม "ติดต่อเรา" (/contact) — ไม่ต้องล็อกอิน
// กันบอท: ช่องลับ (website) · ส่งเร็วผิดปกติ · จำกัด 5 ครั้ง/ชม./IP และ 200 ครั้ง/วันทั้งระบบ
// เก็บลง contact_requests (0068) แล้วส่งอีเมลถึงทีมขาย (Reply-To = ลูกค้า)
// ============================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TO = () => process.env.CONTACT_EMAIL?.trim() || "innolistic@scgjwd.com";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ว่าง */ }

  // บอท: กรอกช่องลับ หรือส่งเร็วเกิน → ตอบเหมือนสำเร็จ (ไม่บอกว่าโดนกัน) แต่ไม่ทำอะไร
  const elapsed = Number(body.elapsed);
  if ((typeof body.website === "string" && body.website.trim()) || !Number.isFinite(elapsed) || elapsed < CONTACT_MIN_MS) {
    return NextResponse.json({ ok: true });
  }

  const c = cleanContact(body);
  const bad = contactErrors(c);
  if (bad.length) return NextResponse.json({ error: await sm("กรุณากรอกข้อมูลให้ครบและถูกต้อง"), fields: bad }, { status: 400 });

  const ip = clientIp(req) || "unknown";
  const ipHash = createHash("sha256").update(`krok-contact:${ip}`).digest("hex").slice(0, 32);
  if ((await rateLimited(`contact:${ipHash}`, 5, 3600)) || (await rateLimited("contact:all", 200, 86400))) {
    return NextResponse.json({ error: await sm("ส่งข้อความหลายครั้งเกินไป — ลองใหม่ภายหลัง หรือโทรหาเราโดยตรง") }, { status: 429 });
  }

  const admin = getAdminClient();
  let rowId: string | null = null;
  if (admin) {
    const { data } = await admin.from("contact_requests").insert({
      name: c.name, company: c.company, email: c.email, phone: c.phone, seats: c.seats, message: c.message,
      lang: body.lang === "en" ? "en" : "th", ip_hash: ipHash,
    }).select("id").maybeSingle();
    rowId = (data?.id as string) ?? null; // ยังไม่รัน 0068 = ส่งอีเมลอย่างเดียว
  }

  const mail = contactEmail(c, `${await siteOrigin()}/admin/contacts`);
  const sent = await sendEmail({ to: TO(), replyTo: c.email, ...mail });
  if (admin && rowId) await admin.from("contact_requests").update({ emailed: sent.ok, email_error: sent.ok ? null : sent.error.slice(0, 300) }).eq("id", rowId);

  // เก็บลงฐานข้อมูลได้ = ทีมเห็นแน่ แม้อีเมลไม่ออก · ไม่มีทั้งสองทาง = แจ้งให้ติดต่อช่องทางอื่น
  if (!sent.ok && !rowId) {
    console.error("[krok] contact form: email failed and not stored:", sent.error);
    return NextResponse.json({ error: await sm("ส่งข้อความไม่สำเร็จ — โปรดโทรหรืออีเมลหาเราโดยตรง") }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
