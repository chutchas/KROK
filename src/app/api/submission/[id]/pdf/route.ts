import { NextResponse } from "next/server";
import { attachmentHeader, docNoFileSafe, docNoOf } from "@/lib/form-schema";
import { renderSubmissionPdf } from "@/lib/pdf/submission-pdf-render";
import { renderDocWithChromium } from "@/lib/pdf/doc-chromium";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const pdfResponse = (pdf: Buffer | Uint8Array, docNo: string) =>
  new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentHeader(`${docNoFileSafe(docNo)}.pdf`),
      "Cache-Control": "no-store",
    },
  });

/**
 * PDF ของใบที่ส่งแล้ว ตามแท็บที่ผู้ใช้เปิดอยู่
 *   (ค่าเริ่มต้น)    = เอกสาร A4 (กระดาษแผ่นเดียวกับตอนกรอก/ตอนพิมพ์) — วาดด้วย Chromium ฝั่ง server
 *   ?format=summary = แบบรายการคำตอบ (pdfkit)
 * A4 สร้างไม่สำเร็จ → 503 พร้อมเหตุผล (ไม่ส่งแบบรายการมาแทน — หน้าตาจะไม่ตรงกับแท็บที่เปิด)
 * หน้าเว็บจะให้เปิดหน้าพิมพ์ A4 แล้วบันทึกเป็น PDF จากเบราว์เซอร์แทน
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = new URL(req.url).searchParams.get("format") === "summary";
  if (!summary) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const supabase = await createClient();
    const { data: sub } = await supabase.from("submissions").select("id, doc_no").eq("id", id).eq("tenant_id", session.tenantId).maybeSingle();
    if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });
    try {
      const pdf = await renderDocWithChromium(id, "pdf");
      return pdfResponse(pdf, docNoOf({ id: String(sub.id), doc_no: sub.doc_no as string | null | undefined }));
    } catch (e) {
      console.error("[krok] A4 PDF (chromium) failed:", e);
      const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);
      return NextResponse.json({ error: "a4_failed", reason }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  const r = await renderSubmissionPdf(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return pdfResponse(r.pdf, r.docNo);
}
