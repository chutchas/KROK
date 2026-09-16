import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SIGNED_TTL = 60 * 30; // 30 นาที — พอสำหรับเปิดดูระหว่างกรอกฟอร์ม

/**
 * ออก signed URL ให้เอกสารแนบ แล้ว redirect ไป
 * ใช้ได้ทั้งใน <img src> และ <iframe src> ตรง ๆ
 *
 * สิทธิ์: สมาชิก tenant เดียวกับฟอร์ม  หรือ  ฟอร์มนั้นเป็น public + published
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdminClient();
  const download = new URL(req.url).searchParams.get("download") === "1";

  // อ่าน metadata — ใช้ service role ถ้ามี (เพื่อรองรับฟอร์มสาธารณะที่ผู้เปิดไม่ได้ล็อกอิน)
  const reader = admin ?? (await createClient());
  const { data: att } = await reader
    .from("form_attachments")
    .select("id, tenant_id, form_id, kind, name, storage_path, url")
    .eq("id", id)
    .maybeSingle();

  if (!att) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });

  // ลิงก์ภายนอก — ไม่ต้องออก signed URL
  if (att.kind === "link") {
    if (!att.url) return NextResponse.json({ error: "ลิงก์ว่าง" }, { status: 404 });
    return NextResponse.redirect(att.url as string);
  }

  // ---- ตรวจสิทธิ์ ----
  let allowed = false;
  const session = await getSession();
  if (session && session.tenantId === att.tenant_id) allowed = true;

  if (!allowed && admin) {
    const { data: f } = await admin
      .from("forms")
      .select("visibility, status, deleted_at")
      .eq("id", att.form_id)
      .maybeSingle();
    if (f && f.visibility === "public" && f.status === "published" && !f.deleted_at) allowed = true;
  }

  if (!allowed) return NextResponse.json({ error: "ไม่มีสิทธิ์เปิดเอกสารนี้" }, { status: 403 });

  const signer = admin ?? (await createClient());
  const { data: signed, error } = await signer.storage
    .from("attachments")
    .createSignedUrl(att.storage_path as string, SIGNED_TTL, download ? { download: (att.name as string) || "document" } : undefined);

  if (error || !signed?.signedUrl)
    return NextResponse.json({ error: "เปิดเอกสารไม่ได้" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
