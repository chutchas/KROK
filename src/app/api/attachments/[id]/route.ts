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
 * สิทธิ์: สมาชิก tenant เดียวกับฟอร์มที่เห็นฟอร์มนั้น  หรือ  ฟอร์มนั้นเป็น public + published
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

  // ---- ตรวจสิทธิ์ (ก่อนทั้งลิงก์และไฟล์) ----
  let allowed = false;
  const session = await getSession();
  if (session && session.tenantId === att.tenant_id) {
    // สมาชิก workspace เดียวกัน: ต้องเห็นฟอร์มนั้นด้วย (ฟอร์มแชร์เฉพาะทีม/เฉพาะคน — RLS 0054 ตัดสิน)
    const { data: visible } = await (await createClient()).from("forms").select("id").eq("id", att.form_id).maybeSingle();
    allowed = !!visible;
  }

  if (!allowed && admin) {
    const { data: f } = await admin
      .from("forms")
      .select("visibility, status, deleted_at")
      .eq("id", att.form_id)
      .maybeSingle();
    if (f && f.visibility === "public" && f.status === "published" && !f.deleted_at) allowed = true;
  }

  if (!allowed) return NextResponse.json({ error: "ไม่มีสิทธิ์เปิดเอกสารนี้" }, { status: 403 });

  // ลิงก์ภายนอก — ไม่ต้องออก signed URL
  if (att.kind === "link") {
    if (!att.url) return NextResponse.json({ error: "ลิงก์ว่าง" }, { status: 404 });
    // ไม่ redirect อัตโนมัติ (กันใช้โดเมน KROK เป็นทางผ่านไปเว็บหลอกลวง) — แสดงหน้าคั่นให้ผู้ใช้เห็นปลายทางก่อนกด
    let target: URL;
    try { target = new URL(att.url as string); } catch { return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 }); }
    if (target.protocol !== "https:" && target.protocol !== "http:") return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
    return new NextResponse(leavePage(target.toString(), String(att.name || "")), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  // path ที่บันทึกไว้ต้องอยู่ใต้ <tenant>/<form>/ ของเอกสารนี้จริง (กันข้อมูลเก่าที่มี ".." หลุดมา)
  const sp = String(att.storage_path || "");
  if (!sp.startsWith(`${att.tenant_id}/${att.form_id}/`) || sp.includes("..") || sp.includes("\\") || sp.includes("%"))
    return NextResponse.json({ error: "เปิดเอกสารไม่ได้" }, { status: 400 });

  const signer = admin ?? (await createClient());
  const { data: signed, error } = await signer.storage
    .from("attachments")
    .createSignedUrl(att.storage_path as string, SIGNED_TTL, download ? { download: (att.name as string) || "document" } : undefined);

  if (error || !signed?.signedUrl)
    return NextResponse.json({ error: "เปิดเอกสารไม่ได้" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** หน้าคั่นก่อนออกไปเว็บภายนอก */
function leavePage(url: string, name: string): string {
  const u = esc(url);
  let host = "";
  try { host = esc(new URL(url).host); } catch { /* ignore */ }
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>ลิงก์ภายนอก</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f6f8;color:#0f172a;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px">
<main style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;max-width:440px;width:100%;padding:22px;box-sizing:border-box">
<h1 style="font-size:1.1rem;margin:0 0 6px">กำลังออกจาก KROK</h1>
<p style="margin:0 0 12px;color:#475569;font-size:.9rem">${name ? `เอกสาร “${esc(name)}” เป็น` : ""}ลิงก์ไปเว็บภายนอก ตรวจชื่อเว็บก่อนเปิด</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:.85rem;overflow-wrap:anywhere"><b>${host}</b><br><span style="color:#64748b">${u}</span></div>
<a href="${u}" rel="noopener noreferrer nofollow" style="display:block;text-align:center;margin-top:14px;padding:11px;border-radius:9px;background:#2559c4;color:#fff;text-decoration:none;font-weight:600">เปิดลิงก์</a>
</main></body></html>`;
}
