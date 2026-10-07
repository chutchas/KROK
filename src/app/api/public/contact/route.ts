import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/client-ip";
import { rateLimited } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-origin";
import { sm } from "@/lib/server-msg";
import { getSession } from "@/lib/session";
import { cleanContact, contactEmail, contactErrors, CONTACT_MIN_MS } from "@/lib/contact";

// ============================================================
// ฟอร์ม "ติดต่อเรา" (/contact) — ไม่ต้องล็อกอิน · ล็อกอินอยู่ = แนบ user/workspace (0069)
// กันบอท: ช่องลับ (website) · ส่งเร็วผิดปกติ · จำกัด 5 ครั้ง/ชม. (ต่อผู้ใช้ถ้าล็อกอิน ไม่งั้นต่อ IP) · อีเมลแจ้งทีมไม่เกิน 200 ฉบับ/วัน (เกิน = บันทึกอย่างเดียว)
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

  const session = await getSession().catch(() => null);
  const ip = clientIp(req) || "unknown";
  const ipHash = createHash("sha256").update(`krok-contact:${ip}`).digest("hex").slice(0, 32);
  // ผู้ใช้ในระบบนับต่อบัญชี (ออฟฟิศเดียวกันใช้ IP เดียวกันได้หลายคน)
  const limitKey = session ? `contact:u:${session.userId}` : `contact:${ipHash}`;
  if (await rateLimited(limitKey, 5, 3600)) {
    return NextResponse.json({ error: await sm("ส่งข้อความหลายครั้งเกินไป — ลองใหม่ภายหลัง หรือโทรหาเราโดยตรง") }, { status: 429 });
  }

  const admin = getAdminClient();
  let rowId: string | null = null;
  if (admin) {
    const base = {
      name: c.name, company: c.company, email: c.email, phone: c.phone, seats: c.seats, message: c.message,
      lang: body.lang === "en" ? "en" : "th", ip_hash: ipHash,
    };
    const extra = { topic: c.topic, user_id: session?.userId ?? null, tenant_id: session?.tenantId ?? null };
    let { data, error } = await admin.from("contact_requests").insert({ ...base, ...extra }).select("id").maybeSingle();
    if (error) ({ data, error } = await admin.from("contact_requests").insert(base).select("id").maybeSingle()); // ยังไม่รัน 0069
    rowId = (data?.id as string) ?? null; // ยังไม่รัน 0068 = ส่งอีเมลอย่างเดียว
  }

  const sender = session ? { workspace: session.tenantName, role: session.roleName || session.role, userId: session.userId } : null;
  const mail = contactEmail(c, `${await siteOrigin()}/admin/contacts`, sender);
  // เพดานรวมทั้งระบบคุมเฉพาะการส่งอีเมล (กันโดนยิงจนกล่องเมลเต็ม) — ข้อความยังบันทึกลงระบบ คนจริงไม่โดนปฏิเสธ
  const mailCapped = await rateLimited("contact:mail", 200, 86400);
  const sent = mailCapped && rowId ? { ok: false as const, error: "daily email cap reached (stored only)" } : await sendEmail({ to: TO(), replyTo: c.email, ...mail });
  if (admin && rowId) await admin.from("contact_requests").update({ emailed: sent.ok, email_error: sent.ok ? null : sent.error.slice(0, 300) }).eq("id", rowId);

  // เก็บลงฐานข้อมูลได้ = ทีมเห็นแน่ แม้อีเมลไม่ออก · ไม่มีทั้งสองทาง = แจ้งให้ติดต่อช่องทางอื่น
  if (!sent.ok && !rowId) {
    console.error("[krok] contact form: email failed and not stored:", sent.error);
    return NextResponse.json({ error: await sm("ส่งข้อความไม่สำเร็จ — โปรดโทรหรืออีเมลหาเราโดยตรง") }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
