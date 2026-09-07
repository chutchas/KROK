import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { buildSubmissionPdf, type PdfAnswer, type SubmissionPdfData } from "@/lib/pdf/submission-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface AnswerItem {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
  rows?: Record<string, string>[];
  columns?: { id: string; label: string }[];
}

const STATUS: Record<string, { label: string; color: SubmissionPdfData["statusColor"] }> = {
  none: { label: "ส่งแล้ว", color: "muted" },
  pending: { label: "รออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติแล้ว", color: "pass" },
  rejected: { label: "ตีกลับ", color: "fail" },
};

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  // RLS จำกัดให้เห็นเฉพาะ tenant ตัวเองอยู่แล้ว — ใส่ filter ซ้ำกันพลาด
  const { data: sub } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

  // ดึงรูป/ลายเซ็น → signed URL → โหลดไบต์มาแนบใน PDF
  const { data: photoRows } = await supabase
    .from("submission_photos")
    .select("field_id, storage_path")
    .eq("submission_id", id);

  const photoBuf: Record<string, Buffer> = {};
  for (const p of photoRows || []) {
    try {
      const { data: signed } = await supabase.storage
        .from("submissions")
        .createSignedUrl(p.storage_path as string, 300);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      // pdfkit รองรับ JPEG/PNG เท่านั้น — 4MB/รูปพอสำหรับเอกสาร
      if (ab.byteLength <= 4 * 1024 * 1024) photoBuf[p.field_id as string] = Buffer.from(ab);
    } catch {
      /* ข้ามรูปที่โหลดไม่ได้ */
    }
  }

  const rawAnswers = (sub.answers || []) as AnswerItem[];
  const answers: PdfAnswer[] = rawAnswers.map((a) => ({
    label: a.label,
    type: a.type,
    display: a.display,
    note: a.note,
    fail: a.fail,
    photo: a.photoField ? photoBuf[a.photoField] ?? null : null,
    rows: a.rows,
    columns: a.columns,
  }));

  const st = STATUS[sub.approval_status as string] || STATUS.none;
  const history = Array.isArray(sub.approval_history)
    ? (sub.approval_history as { label: string; reviewer_name: string; decision: string; note?: string; at: string }[]).map((h) => ({
        label: h.label,
        reviewer: h.reviewer_name,
        approved: h.decision === "approved",
        note: h.note,
        at: fmtDate(h.at),
      }))
    : [];

  const data: SubmissionPdfData = {
    tenantName: session.tenantName,
    formTitle: (sub.form_title as string) || "ฟอร์ม",
    formIcon: (sub.form_icon as string) || "",
    docNo: String(sub.id).slice(0, 8).toUpperCase(),
    fullId: String(sub.id),
    statusLabel: st.label,
    statusColor: st.color,
    resultFail: sub.result === "fail",
    failCount: Array.isArray(sub.fails) ? (sub.fails as unknown[]).length : 0,
    userName: (sub.user_name as string) || "—",
    submittedAt: fmtDate(sub.submitted_at as string | null),
    durationS: (sub.duration_s as number | null) ?? null,
    formVersion: (sub.form_version as number) ?? 1,
    answers,
    history,
  };

  const pdf = await buildSubmissionPdf(data);
  const filename = `KROK-${data.docNo}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
