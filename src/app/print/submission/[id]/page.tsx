import { notFound } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getFormPrintInfo } from "@/lib/print-photos-server";
import { getWorkspaceBranding } from "@/lib/branding";
import { resolveTheme } from "@/lib/theme";
import { docNoOf } from "@/lib/form-schema";
import { getDocSchema } from "@/lib/submission-doc-server";
import type { StoredAnswer } from "@/lib/doc-answers";
import SubmissionDoc from "@/components/SubmissionDoc";
import AutoPrint from "./AutoPrint";

export const dynamic = "force-dynamic";

// ============================================================
// หน้าพิมพ์เอกสาร A4 ของใบที่ส่งแล้ว — กระดาษอย่างเดียว ไม่มีเมนู/แถบของแอป
// ใช้ 2 ทาง: ปุ่ม "พิมพ์" (เปิดหน้านี้แล้วสั่งพิมพ์อัตโนมัติ ?auto=1) และเครื่องทำ PDF ฝั่ง server (เปิดหน้านี้แล้วพิมพ์เป็น PDF)
// → PDF ที่ดาวน์โหลด กับกระดาษที่พิมพ์เอง หน้าตาเดียวกันทุกอย่าง
// สิทธิ์: session + RLS ของ submissions เหมือนหน้าดูเอกสาร
// ============================================================

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("submissions").select("id, form_title, doc_no").eq("id", id).eq("tenant_id", session.tenantId).maybeSingle();
  if (!data) return {};
  return { title: `${data.form_title || ""} ${docNoOf({ id: String(data.id), doc_no: data.doc_no as string | null | undefined })}`.trim(), robots: { index: false } };
}

export default async function PrintSubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) return redirectNoSession();

  const supabase = await createClient();
  const { data: sub } = await supabase.from("submissions").select("*").eq("id", id).eq("tenant_id", session.tenantId).maybeSingle();
  if (!sub) notFound();

  const [schema, { theme: formTheme }, { data: photoRows }, wsBrand] = await Promise.all([
    getDocSchema(supabase, { tenant_id: String(sub.tenant_id), form_id: sub.form_id as string | null, form_version: sub.form_version as number | null, case_id: sub.case_id as string | null }),
    getFormPrintInfo(supabase, sub.form_id as string | null),
    supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", id),
    getWorkspaceBranding(supabase, sub.tenant_id as string),
  ]);
  if (!schema) notFound();
  const theme = resolveTheme(wsBrand, formTheme);

  const photos: Record<string, string> = {};
  const paths = (photoRows || []).map((p) => p.storage_path as string);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrls(paths, 600);
    const byPath = new Map((signed || []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl]));
    for (const p of photoRows || []) { const u = byPath.get(p.storage_path as string); if (u) photos[p.field_id as string] = u; }
  }

  return (
    <div className="krok-doc-page">
      <SubmissionDoc
        variant="print"
        schema={schema}
        title={String(sub.form_title || "")}
        icon={String(sub.form_icon || "")}
        answers={(sub.answers || []) as StoredAnswer[]}
        photos={photos}
        theme={theme}
        filler={String(sub.user_name || "")}
        submittedAt={sub.submitted_at as string | null}
        docNo={docNoOf({ id: String(sub.id), doc_no: sub.doc_no as string | null | undefined })}
      />
      {sp.auto === "1" && <AutoPrint />}
      {/* กระดาษ A4 ไม่มีขอบ — ระยะขอบอยู่ในแคนวาสแล้ว (ตรงกับที่ออกแบบ) */}
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #e5e7eb; }
        .krok-doc-page { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 0; }
        .krok-doc-page .krok-pl-canvas { box-shadow: 0 2px 16px rgba(0,0,0,.18); }
        @media print {
          html, body { background: #fff !important; }
          .krok-doc-page { display: block; padding: 0; }
          .krok-doc-page .krok-pl-canvas { box-shadow: none; }
          .krok-doc-print button:not([data-print-keep]) { display: none !important; }
        }
      `}</style>
    </div>
  );
}
