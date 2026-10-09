import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { renderSubmissionPdf } from "@/lib/pdf/submission-pdf-render";
import { pdfFirstPagePng } from "@/lib/pdf/pdf-thumb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** เปลี่ยนเมื่อหน้าตาภาพย่อเปลี่ยน (ขนาด/วิธีวาด) → ETag เก่าใช้ไม่ได้ */
const THUMB_REV = "2"; // 2: หัวเอกสารไม่มีชื่อแพลตฟอร์ม

/**
 * ภาพย่อหน้าแรกของเอกสาร (PNG ~20–40KB) สำหรับหน้าส่งเสร็จ — มือถือไม่ต้องโหลดตัวอ่าน PDF
 * สิทธิ์เดียวกับ /pdf
 * ETag จากข้อมูลของใบที่ทำให้หน้าแรกเปลี่ยน (สถานะ/ประวัติอนุมัติ/เลขที่/ผล) — ใบไม่เปลี่ยน = ตอบ 304 ไม่ต้องสร้าง PDF ใหม่
 * (โลโก้/ธีม workspace ที่เปลี่ยนทีหลังจะไม่ทำให้ภาพย่อของใบเก่าเปลี่ยน — ภาพย่อใช้แค่หน้าส่งเสร็จ)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, doc_no, result, fails, approval_status, approval_step, approval_history, form_version, submitted_at")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

  const etag = `W/"t${THUMB_REV}-${createHash("sha1").update(JSON.stringify(sub)).digest("base64url").slice(0, 22)}"`;
  // เบราว์เซอร์ถามทุกครั้ง (no-cache) แต่ใบเดิม = 304 เบาๆ · ใบที่เพิ่งอนุมัติ = ภาพใหม่ทันที
  const cacheHeaders = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: cacheHeaders });

  const r = await renderSubmissionPdf(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  let png: Buffer;
  try {
    png = await pdfFirstPagePng(new Uint8Array(r.pdf));
  } catch (e) {
    console.error("[krok] PDF thumbnail failed:", e);
    return NextResponse.json({ error: "thumbnail failed" }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: { "Content-Type": "image/png", ...cacheHeaders },
  });
}
