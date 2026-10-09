import { NextResponse } from "next/server";
import { attachmentHeader, docNoFileSafe } from "@/lib/form-schema";
import { renderSubmissionPdf } from "@/lib/pdf/submission-pdf-render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await renderSubmissionPdf(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const filename = `${docNoFileSafe(r.docNo)}.pdf`;

  return new NextResponse(new Uint8Array(r.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentHeader(filename),
      "Cache-Control": "no-store",
    },
  });
}
