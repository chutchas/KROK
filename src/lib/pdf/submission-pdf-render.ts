import "server-only";
import { sm } from "@/lib/server-msg";
import { fmtCoords, mapUrl, readGeo } from "@/lib/geo";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { buildSubmissionPdf, type PdfAnswer, type SubmissionPdfData } from "@/lib/pdf/submission-pdf";
import { SRC_LABEL, type AnswerItem } from "@/lib/answer-item";
import { getFormPrintInfo } from "@/lib/print-photos-server";
import { getWorkspaceBranding } from "@/lib/branding";
import { BRANDING_PATH, resolveTheme } from "@/lib/theme";
import { answerPhotoKeys } from "@/lib/photo-slots";
import { docNoOf } from "@/lib/form-schema";

const STATUS: Record<string, { label: string; color: SubmissionPdfData["statusColor"] }> = {
  none: { label: "ส่งแล้ว", color: "muted" },
  pending: { label: "รออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติแล้ว", color: "pass" },
  rejected: { label: "ตีกลับ", color: "fail" },
};

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  } catch {
    return "—";
  }
}

export type SubmissionPdfResult =
  | { ok: true; pdf: Buffer; docNo: string }
  | { ok: false; status: number; error: string };

/** สร้าง PDF ของใบที่ส่งแล้ว (ใช้ทั้งดาวน์โหลด PDF และภาพย่อหน้าส่งเสร็จ) — สิทธิ์ตาม session + RLS */
export async function renderSubmissionPdf(id: string): Promise<SubmissionPdfResult> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "unauthorized" };

  const supabase = await createClient();
  // RLS จำกัดให้เห็นเฉพาะ tenant ตัวเองอยู่แล้ว — ใส่ filter ซ้ำกันพลาด
  const { data: sub } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!sub) return { ok: false, status: 404, error: "not found" };

  // ตั้งค่าการพิมพ์รูป + รายการรูป — โหลดพร้อมกัน
  const [{ pp, theme: formTheme }, { data: photoRows }, wsBrand] = await Promise.all([
    getFormPrintInfo(supabase, sub.form_id as string | null),
    supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", id),
    getWorkspaceBranding(supabase, session.tenantId),
  ]);
  const theme = resolveTheme(wsBrand, formTheme);
  // โลโก้: ไฟล์ใน bucket branding — pdfkit รองรับ PNG/JPEG เท่านั้น (WebP ข้าม)
  let logo: Buffer | null = null;
  if (theme.logo) {
    try {
      const path = decodeURIComponent(new URL(theme.logo).pathname.slice(BRANDING_PATH.length));
      if (path.startsWith(`${session.tenantId}/`) && !path.endsWith(".webp")) {
        const { data: blob } = await supabase.storage.from("branding").download(path);
        if (blob && blob.size <= 2 * 1024 * 1024) logo = Buffer.from(await blob.arrayBuffer());
      }
    } catch { /* ไม่มีโลโก้ใน PDF */ }
  }

  // ดาวน์โหลดตรงจาก storage (ไม่ต้องขอ signed URL ทีละรูป) ทีละ 4 รูปพร้อมกัน
  const photoBuf: Record<string, Buffer> = {};
  const list = photoRows || [];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async (p) => {
      try {
        const { data: blob } = await supabase.storage.from("submissions").download(p.storage_path as string);
        if (!blob) return;
        const ab = await blob.arrayBuffer();
        // pdfkit รองรับ JPEG/PNG เท่านั้น — 4MB/รูปพอสำหรับเอกสาร
        if (ab.byteLength <= 4 * 1024 * 1024) photoBuf[p.field_id as string] = Buffer.from(ab);
      } catch { /* ข้ามรูปที่โหลดไม่ได้ */ }
    }));
  }

  const rawAnswers = (sub.answers || []) as AnswerItem[];
  const answers: PdfAnswer[] = rawAnswers.map((a) => {
    // รูปถ่ายต่อแถว: ช่องในตารางแสดง "รูป n" แล้ววาดรูปทั้งหมดเป็นตารางรูปใต้ตาราง
    let rows = a.rows;
    const rowPhotos: { caption: string; photo: Buffer }[] = [];
    if (a.type === "table" && a.rows && a.columns?.some((c) => c.type === "photo")) {
      rows = a.rows.map((r, ri) => {
        const o = { ...r };
        for (const c of a.columns!) {
          const k = r[`${c.id}#photo`];
          const buf = k ? photoBuf[k] : undefined;
          if (buf) { rowPhotos.push({ caption: `รูป ${rowPhotos.length + 1} · แถว ${ri + 1} ${c.label}`, photo: buf }); o[c.id] = `รูป ${rowPhotos.length}`; }
        }
        return o;
      });
    }
    return {
    // ช่องที่ผู้สร้างฟอร์มไม่ได้ตั้งชื่อ → ชื่อตามชนิด (เหมือนในแอป) แทน "—"
    label: a.label?.trim() || (a.type === "photo" ? "รูปภาพ" : a.type === "signature" ? "ลายเซ็น" : "ช่องไม่มีชื่อ"),
    type: a.type,
    // ที่มาของค่าต้องปรากฏในเอกสารที่พิมพ์ออกไปด้วย ไม่งั้นตรวจย้อนหลังแยกไม่ออก
    // แสดงชื่อ เก็บรหัส → พิมพ์รหัสกำกับไว้ด้วย เพื่อใช้อ้างอิงกับระบบอื่น
    display: [a.code ? `${a.display ?? "—"} [${a.code}]` : a.display ?? "—", a.src ? `(${SRC_LABEL[a.src]})` : ""].filter(Boolean).join(" "),
    note: a.note,
    fail: a.fail,
    photo: a.photoField ? photoBuf[a.photoField] ?? null : null,
    // ฟิลด์หลายรูป: รูปทั้งหมดพร้อมคำบรรยาย (วาดเป็นตารางรูป)
    photos: a.type === "photo"
      ? answerPhotoKeys(a).map((k, i, all) => ({ caption: a.photoLabels?.[i]?.trim() || (all.length > 1 ? `รูปที่ ${i + 1}` : ""), photo: photoBuf[k] })).filter((p): p is { caption: string; photo: Buffer } => !!p.photo)
      : undefined,
    rows,
    columns: a.columns,
    rowPhotos: rowPhotos.length ? rowPhotos : undefined,
  };
  });

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
    docNo: docNoOf({ id: String(sub.id), doc_no: sub.doc_no as string | null | undefined }),
    fullId: String(sub.id),
    statusLabel: st.label,
    statusColor: st.color,
    resultFail: sub.result === "fail",
    failCount: Array.isArray(sub.fails) ? (sub.fails as unknown[]).length : 0,
    userName: (sub.user_name as string) || "—",
    submittedAt: fmtDate(sub.submitted_at as string | null),
    durationS: (sub.duration_s as number | null) ?? null,
    formVersion: (sub.form_version as number) ?? 1,
    geo: (() => { const g = readGeo(sub.geo); return g ? { text: `${fmtCoords(g)}${g.acc ? ` (±${g.acc} ม.)` : ""}`, url: mapUrl(g) } : null; })(),
    answers,
    history,
    photoLayout: { mode: pp.mode, cols: pp.cols, heightMm: pp.height_mm },
    brand: { header: theme.custom ? theme.header : undefined, primary: theme.custom ? theme.primary : undefined, logo, footer: theme.footer },
  };

  let pdf: Buffer;
  try {
    pdf = await buildSubmissionPdf(data);
  } catch (e) {
    console.error("[krok] PDF generation failed:", e);
    return { ok: false, status: 500, error: await sm("สร้าง PDF ไม่สำเร็จ") };
  }
  return { ok: true, pdf, docNo: data.docNo };
}
