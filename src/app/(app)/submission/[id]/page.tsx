import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

interface AnswerItem {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
}

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  none: { t: "ส่งแล้ว", c: "var(--ink-2)" },
  pending: { t: "รออนุมัติ", c: "var(--amber)" },
  approved: { t: "อนุมัติแล้ว", c: "var(--pass)" },
  rejected: { t: "ตีกลับ", c: "var(--fail)" },
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!sub) notFound();

  const { data: photoRows } = await supabase
    .from("submission_photos")
    .select("field_id, storage_path")
    .eq("submission_id", id);

  const photoMap: Record<string, string> = {};
  for (const p of photoRows || []) {
    const { data: signed } = await supabase.storage
      .from("submissions")
      .createSignedUrl(p.storage_path as string, 3600);
    if (signed?.signedUrl) photoMap[p.field_id as string] = signed.signedUrl;
  }

  const answers = (sub.answers || []) as AnswerItem[];
  const status = STATUS_LABEL[sub.approval_status as string] || STATUS_LABEL.none;

  const label: React.CSSProperties = { color: "var(--ink-2)", fontSize: ".85rem", width: 200, flexShrink: 0 };
  const row: React.CSSProperties = { display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)", alignItems: "flex-start" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <a href="/dashboard" style={{ fontSize: ".9rem" }}>← กลับ Dashboard</a>
        <PrintButton />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "28px 30px", boxShadow: "var(--shadow)" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 6, gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="hazard" style={{ width: 22, height: 22, borderRadius: 4 }} />
              <span style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, letterSpacing: ".03em" }}>KROK</span>
            </div>
            <h1 style={{ fontSize: "1.5rem", margin: "10px 0 2px" }}>{sub.form_icon} {sub.form_title}</h1>
            <div style={{ color: "var(--ink-3)", fontSize: ".8rem", fontFamily: "monospace" }}>{session.tenantName} · เอกสารเลขที่ {String(sub.id).slice(0, 8).toUpperCase()}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-block", border: `2px solid ${status.c}`, color: status.c, borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontFamily: "var(--font-anuphan)" }}>
              {status.t}
            </div>
            <div style={{ marginTop: 8, fontSize: ".8rem", color: sub.result === "fail" ? "var(--fail)" : "var(--pass)", fontWeight: 600 }}>
              {sub.result === "fail" ? `พบปัญหา ${(sub.fails as string[])?.length || 0} รายการ` : "ครบถ้วน"}
            </div>
          </div>
        </div>

        {/* meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px", fontSize: ".86rem", margin: "14px 0 8px" }}>
          <div><span style={{ color: "var(--ink-3)" }}>ผู้กรอก: </span><b>{sub.user_name || "—"}</b></div>
          <div><span style={{ color: "var(--ink-3)" }}>เวลาส่ง: </span>{fmt(sub.submitted_at)}</div>
          <div><span style={{ color: "var(--ink-3)" }}>ใช้เวลา: </span>{sub.duration_s ?? "—"} วินาที</div>
          <div><span style={{ color: "var(--ink-3)" }}>เวอร์ชันฟอร์ม: </span>v{sub.form_version ?? 1}</div>
        </div>

        {/* answers */}
        <div style={{ marginTop: 12 }}>
          {answers.map((a, i) => (
            <div key={i} style={row}>
              <div style={label}>
                {a.label}
                {a.note && <div style={{ color: "var(--fail)", fontSize: ".78rem", marginTop: 2 }}>⚠ {a.note}</div>}
              </div>
              <div style={{ flex: 1, fontWeight: 600, color: a.fail ? "var(--fail)" : "var(--ink)" }}>
                {a.photoField && photoMap[a.photoField] ? (
                  <img src={photoMap[a.photoField]} alt={a.label} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, border: "1px solid var(--line)" }} />
                ) : a.photoField ? (
                  <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(ไม่พบไฟล์)</span>
                ) : (
                  a.display ?? "—"
                )}
              </div>
            </div>
          ))}
        </div>

        {/* approval history timeline */}
        {Array.isArray(sub.approval_history) && sub.approval_history.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 600, fontSize: ".95rem", marginBottom: 8 }}>ประวัติการอนุมัติ</div>
            {(sub.approval_history as { step: number; label: string; reviewer_name: string; decision: string; note: string; at: string }[]).map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: ".86rem" }}>
                <span aria-hidden>{h.decision === "approved" ? "✓" : "↩"}</span>
                <div style={{ flex: 1 }}>
                  <b style={{ color: h.decision === "approved" ? "var(--pass)" : "var(--fail)" }}>
                    {h.label} — {h.decision === "approved" ? "อนุมัติ" : "ตีกลับ"}
                  </b>
                  <span style={{ color: "var(--ink-2)" }}> โดย {h.reviewer_name}</span>
                  {h.note && <div style={{ color: "var(--ink-2)" }}>“{h.note}”</div>}
                </div>
                <span style={{ color: "var(--ink-3)", fontSize: ".76rem", whiteSpace: "nowrap" }}>{fmt(h.at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* current step (still pending) */}
        {sub.approval_status === "pending" && Array.isArray(sub.approval_chain) && (sub.approval_chain as unknown[]).length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "var(--accent-soft)", color: "var(--ink-2)", fontSize: ".86rem" }}>
            🕒 กำลังรออนุมัติขั้นที่ {(sub.approval_step as number) + 1} จาก {(sub.approval_chain as unknown[]).length}
          </div>
        )}

        {/* review block */}
        {(sub.approval_status === "approved" || sub.approval_status === "rejected") && (
          <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10, background: sub.approval_status === "approved" ? "var(--pass-soft)" : "var(--fail-soft)" }}>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-anuphan)", color: sub.approval_status === "approved" ? "var(--pass)" : "var(--fail)" }}>
              {sub.approval_status === "approved" ? "✓ อนุมัติโดย" : "↩ ตีกลับโดย"} {sub.reviewer_name || "ผู้ตรวจ"}
            </div>
            <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginTop: 2 }}>{fmt(sub.reviewed_at)}</div>
            {sub.review_note && <div style={{ fontSize: ".88rem", marginTop: 6 }}>“{sub.review_note}”</div>}
          </div>
        )}

        <div style={{ marginTop: 26, paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: ".72rem", color: "var(--ink-3)", fontFamily: "monospace", display: "flex", justifyContent: "space-between" }}>
          <span>สร้างโดย KROK · ฟอร์มดิจิทัลหน้างาน</span>
          <span>{String(sub.id)}</span>
        </div>
      </div>
    </div>
  );
}
