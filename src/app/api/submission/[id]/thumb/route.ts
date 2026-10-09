import { NextResponse } from "next/server";
import { renderSubmissionPdf } from "@/lib/pdf/submission-pdf-render";
import { pdfFirstPagePng } from "@/lib/pdf/pdf-thumb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ภาพย่อหน้าแรกของเอกสาร (PNG ~20–40KB) สำหรับหน้าส่งเสร็จ — มือถือไม่ต้องโหลดตัวอ่าน PDF
 * สิทธิ์เดียวกับ /pdf · เก็บในเบราว์เซอร์ 5 นาที (หลังอนุมัติ เอกสารเปลี่ยน → ภาพใหม่ภายในไม่กี่นาที)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
