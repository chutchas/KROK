import { notFound, redirect } from "next/navigation";
import { InlineFormIcon } from "@/components/FormIcon";
import { ArrowLeft, TriangleAlert, Check, Undo2, Clock } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { type AnswerItem } from "@/lib/answer-item";
import { T, LocalDate } from "@/i18n/T";
import { getFormPrintPhotos } from "@/lib/print-photos-server";
import { answerPhotoKeys } from "@/lib/photo-slots";
import { mmToPx } from "@/lib/paper-layout";
import PaperPhotoGrid, { PhotoAppendix } from "@/components/paper/PaperPhotoGrid";
import type { MessageKey } from "@/i18n/dictionaries";

export const dynamic = "force-dynamic";



const STATUS_LABEL: Record<string, { k: MessageKey; c: string }> = {
  none: { k: "dash.submitted", c: "var(--ink-2)" },
  pending: { k: "dash.pending", c: "var(--amber)" },
  approved: { k: "dash.approved", c: "var(--pass)" },
  rejected: { k: "dash.rejected", c: "var(--fail)" },
};

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

  // งาน (ผู้กรอกแต่ละขั้น) + รูป + หลักฐาน AI อ่านเอกสาร — ดึงพร้อมกัน แล้วขอ signed URL ครั้งเดียวทั้งชุด
  // งาน: อ่านด้วย service role เพราะผู้ดูเอกสารอาจไม่เคยเกี่ยวกับงานนั้น (สิทธิ์ดูเอกสารตรวจจาก RLS ของ submissions แล้ว)
  const caseDb = getAdminClient() ?? supabase;
  const [pp, caseRes, { data: photoRows }, { data: extractRows }] = await Promise.all([
    getFormPrintPhotos(supabase, sub.form_id as string | null),
    sub.case_id
      ? caseDb.from("form_cases").select("schema, step_meta").eq("id", sub.case_id).eq("tenant_id", sub.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", id),
    // เอกสารต้นฉบับที่ AI อ่าน (ถ้ามี) — เก็บไว้ให้ตรวจย้อนหลังได้ว่าค่ามาจากไหน
    supabase
      .from("submission_doc_extracts")
      .select("id, source_id, storage_path, accepted, created_at")
      .eq("submission_id", id)
      .order("created_at", { ascending: true }),
  ]);

  let caseSteps: { title: string; name: string; at: string }[] = [];
  const c = caseRes.data as { schema?: unknown; step_meta?: unknown } | null;
  if (c) {
    const steps = ((c.schema as { steps?: { title?: string }[] })?.steps) || [];
    const meta = (c.step_meta as Record<string, { name?: string; at?: string }>) || {};
    caseSteps = steps.map((st, i) => ({ title: `${i + 1}. ${st.title || ""}`, name: meta[String(i)]?.name || "—", at: meta[String(i)]?.at || "" }));
  }

  const paths = [
    ...(photoRows || []).map((p) => p.storage_path as string),
    ...(extractRows || []).map((e) => e.storage_path as string | null).filter((p): p is string => !!p),
  ];
  const signedOf = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrls(paths, 3600);
    for (const x of signed || []) if (x.path && x.signedUrl) signedOf.set(x.path, x.signedUrl);
  }

  const photoMap: Record<string, string> = {};
  for (const p of photoRows || []) {
    const u = signedOf.get(p.storage_path as string);
    if (u) photoMap[p.field_id as string] = u;
  }

  const extracts: { id: string; url: string | null; count: number; edited: number }[] = [];
  for (const ex of extractRows || []) {
    const acc = (ex.accepted || []) as { edited?: boolean }[];
    extracts.push({ id: String(ex.id), url: ex.storage_path ? signedOf.get(ex.storage_path as string) ?? null : null, count: acc.length, edited: acc.filter((a) => a.edited).length });
  }

  const allAnswers = (sub.answers || []) as AnswerItem[];
  // ฟิลด์รูปถ่าย (ตั้งในฟอร์ม): grid = รวมเป็นกล่องภาพประกอบ · appendix = รูปย่อ + หน้าแนบท้ายตอนพิมพ์ · hidden = ไม่พิมพ์
  const photoAnswers = allAnswers.filter((a) => a.type === "photo" && a.photoField);
  const photoItems = photoAnswers.flatMap((a) => { const ks = answerPhotoKeys(a); return ks.map((k, i) => ({ key: k, label: ks.length > 1 ? `${a.label} (${i + 1}/${ks.length})` : a.label, url: photoMap[k] })); });
  const answers = pp.mode === "grid" ? allAnswers.filter((a) => a.type !== "photo") : allAnswers;
  const hasPhotos = Object.keys(photoMap).length > 0 && allAnswers.some((a) => (a.type === "photo" && a.photoField) || (a.type === "table" && a.rows?.some((r) => Object.keys(r).some((k) => k.endsWith("#photo") && r[k]))));
  const status = STATUS_LABEL[sub.approval_status as string] || STATUS_LABEL.none;

  const label: React.CSSProperties = { color: "var(--ink-2)", fontSize: ".85rem", width: 200, flexShrink: 0 };
  const row: React.CSSProperties = { display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)", alignItems: "flex-start" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <a href="/dashboard" style={{ fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={ArrowLeft} className="h-4 w-4" /> <T k="sub.backDashboard" /></a>
        <PrintButton submissionId={String(sub.id)} hasPhotos={hasPhotos} />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "clamp(18px, 5vw, 30px)", boxShadow: "var(--shadow)" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="hazard" style={{ width: 22, height: 22, borderRadius: 4 }} />
              <span style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, letterSpacing: ".03em" }}>KROK</span>
            </div>
            <h1 style={{ fontSize: "1.5rem", margin: "10px 0 2px" }}><InlineFormIcon value={sub.form_icon} size={24} />{sub.form_title}</h1>
            <div style={{ color: "var(--ink-3)", fontSize: ".8rem", fontFamily: "monospace" }}>{session.tenantName} · <T k="sub.docNo" vars={{ id: String(sub.id).slice(0, 8).toUpperCase() }} /></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-block", border: `2px solid ${status.c}`, color: status.c, borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontFamily: "var(--font-anuphan)" }}>
              <T k={status.k} />
            </div>
            <div style={{ marginTop: 8, fontSize: ".8rem", color: sub.result === "fail" ? "var(--fail)" : "var(--pass)", fontWeight: 600 }}>
              {sub.result === "fail" ? <T k="sub.issues" vars={{ n: (sub.fails as string[])?.length || 0 }} /> : <T k="sub.complete" />}
            </div>
          </div>
        </div>

        {/* meta */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 24px", fontSize: ".86rem", margin: "14px 0 8px" }}>
          <div><span style={{ color: "var(--ink-3)" }}><T k="sub.filledBy" /> </span><b>{sub.user_name || "—"}</b></div>
          <div><span style={{ color: "var(--ink-3)" }}><T k="sub.submittedAt" /> </span><LocalDate iso={sub.submitted_at} /></div>
          <div><span style={{ color: "var(--ink-3)" }}><T k="sub.duration" /> </span><T k="sub.seconds" vars={{ s: sub.duration_s ?? "—" }} /></div>
          <div><span style={{ color: "var(--ink-3)" }}><T k="sub.formVersion" /> </span>v{sub.form_version ?? 1}</div>
        </div>
        {caseSteps.length > 0 && (
          <div style={{ fontSize: ".84rem", margin: "4px 0 8px", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8 }}>
            <div style={{ color: "var(--ink-3)", marginBottom: 4 }}><T k="sub.stepFillers" vars={{ id: String(sub.case_id).slice(0, 8).toUpperCase() }} /></div>
            {caseSteps.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ minWidth: 140 }}>{c.title}</span>
                <b>{c.name}</b>
                {c.at && <span style={{ color: "var(--ink-3)" }}><LocalDate iso={c.at} /></span>}
              </div>
            ))}
          </div>
        )}

        {/* answers */}
        <div style={{ marginTop: 12 }}>
          {answers.map((a, i) =>
            a.type === "table" && a.columns ? (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ color: "var(--ink-2)", marginBottom: 6 }}>{a.label}</div>
                {a.rows && a.rows.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: ".85rem", minWidth: "100%" }}>
                      <thead>
                        <tr>{a.columns.map((c) => <th key={c.id} style={{ textAlign: "left", padding: "5px 9px", borderBottom: "1px solid var(--line)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {a.rows.map((r, ri) => (
                          <tr key={ri} style={{ borderBottom: "1px solid var(--line)" }}>
                            {a.columns!.map((c) => {
                              const pk = r[`${c.id}#photo`];
                              return (
                                <td key={c.id} style={{ padding: "5px 9px", verticalAlign: "top" }}>
                                  {pk && photoMap[pk] ? (
                                    <a href={photoMap[pk]} target="_blank" rel="noreferrer">
                                      <img src={photoMap[pk]} alt={`${c.label} ${ri + 1}`} style={{ height: 64, maxWidth: 110, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                                    </a>
                                  ) : (r[c.id] || "—")}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <span style={{ color: "var(--ink-3)" }}>—</span>}
              </div>
            ) : (
              <div key={i} className={`krok-sub-row${pp.mode === "hidden" && a.type === "photo" ? " no-print" : ""}`} style={row}>
                <div className="krok-sub-label" style={label}>
                  {a.label}
                  {a.note && <div style={{ color: "var(--fail)", fontSize: ".78rem", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><Icon icon={TriangleAlert} className="h-3.5 w-3.5" /> {a.note}</div>}
                </div>
                <div style={{ flex: 1, fontWeight: 600, color: a.fail ? "var(--fail)" : "var(--ink)" }}>
                  {a.src && (
                    <span
                      title={a.src === "scan" ? "ค่านี้มาจากการสแกนบาร์โค้ด/QR" : a.src === "api" ? "ค่านี้ระบบภายนอกส่งมาทาง API" : "ค่านี้ AI อ่านจากเอกสาร แล้วผู้กรอกยืนยัน"}
                      style={{
                        fontSize: ".68rem", fontWeight: 700, padding: "1px 7px", borderRadius: 999, marginRight: 7,
                        verticalAlign: "middle", whiteSpace: "nowrap",
                        border: "1px solid var(--line)",
                        background: a.src === "scan" || a.src === "api" ? "var(--code-bg)" : "var(--accent-soft)",
                        color: a.src === "scan" || a.src === "api" ? "var(--ink-3)" : "var(--accent)",
                      }}
                    >
                      <T k={`src.${a.src}`} />
                    </span>
                  )}
                  {a.photoField && photoMap[a.photoField] ? (
                    <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {answerPhotoKeys(a).filter((k) => photoMap[k]).map((k, _i, all) => (
                        <img key={k} src={photoMap[k]} alt={a.label} className={pp.mode === "appendix" && a.type === "photo" ? "krok-sub-thumb" : undefined} style={{ maxWidth: all.length > 1 ? "calc(50% - 4px)" : "100%", maxHeight: all.length > 1 ? 180 : 260, borderRadius: 8, border: "1px solid var(--line)" }} />
                      ))}
                    </span>
                  ) : a.photoField ? (
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}><T k="sub.fileMissing" /></span>
                  ) : (
                    <>
                      {a.display ?? "—"}
                      {a.code && <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: ".78rem", fontWeight: 400, color: "var(--ink-3)" }}>{a.code}</span>}
                    </>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* กล่องภาพประกอบ (ฟอร์มตั้งให้รวมรูป) */}
        {pp.mode === "grid" && photoItems.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "#fff", color: "#111" }}>
            <PaperPhotoGrid items={photoItems} cols={pp.cols} imgH={mmToPx(pp.height_mm)} />
          </div>
        )}

        {/* เอกสารต้นฉบับที่ AI อ่าน */}
        {extracts.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 600, fontSize: ".95rem", marginBottom: 2 }}><T k="sub.aiDocsTitle" /></div>
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" }}>
              <T k="sub.aiDocsSub" />
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
              {extracts.map((ex) => (
                <div key={ex.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 8, background: "var(--surface)" }}>
                  {ex.url ? (
                    <img src={ex.url} alt="เอกสารต้นฉบับ" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 6, background: "var(--code-bg)" }} />
                  ) : (
                    <div style={{ color: "var(--ink-3)", fontSize: ".82rem", padding: "18px 0", textAlign: "center" }}><T k="sub.noOriginal" /></div>
                  )}
                  <div style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 6 }}>
                    <T k="sub.filledFields" vars={{ n: ex.count }} />{ex.edited > 0 && <> · <T k="sub.editedByFiller" vars={{ n: ex.edited }} /></>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* approval history timeline */}
        {Array.isArray(sub.approval_history) && sub.approval_history.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 600, fontSize: ".95rem", marginBottom: 8 }}><T k="sub.approvalHistory" /></div>
            {(sub.approval_history as { step: number; label: string; reviewer_name: string; decision: string; note: string; at: string }[]).map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: ".86rem" }}>
                <span aria-hidden style={{ display: "inline-flex" }}><Icon icon={h.decision === "approved" ? Check : Undo2} className="h-4 w-4" /></span>
                <div style={{ flex: 1 }}>
                  <b style={{ color: h.decision === "approved" ? "var(--pass)" : "var(--fail)" }}>
                    {h.label} — <T k={h.decision === "approved" ? "sub.decApproved" : "sub.decRejected"} />
                  </b>
                  <span style={{ color: "var(--ink-2)" }}> <T k="sub.by" /> {h.reviewer_name}</span>
                  {h.note && <div style={{ color: "var(--ink-2)" }}>“{h.note}”</div>}
                </div>
                <span style={{ color: "var(--ink-3)", fontSize: ".76rem", whiteSpace: "nowrap" }}><LocalDate iso={h.at} /></span>
              </div>
            ))}
          </div>
        )}

        {/* current step (still pending) */}
        {sub.approval_status === "pending" && Array.isArray(sub.approval_chain) && (sub.approval_chain as unknown[]).length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "var(--accent-soft)", color: "var(--ink-2)", fontSize: ".86rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon icon={Clock} className="h-4 w-4" /> <T k="sub.waitingStep" vars={{ n: (sub.approval_step as number) + 1, total: (sub.approval_chain as unknown[]).length }} />
          </div>
        )}

        {/* review block */}
        {(sub.approval_status === "approved" || sub.approval_status === "rejected") && (
          <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10, background: sub.approval_status === "approved" ? "var(--pass-soft)" : "var(--fail-soft)" }}>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-anuphan)", color: sub.approval_status === "approved" ? "var(--pass)" : "var(--fail)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon icon={sub.approval_status === "approved" ? Check : Undo2} className="h-4 w-4" /> <T k={sub.approval_status === "approved" ? "sub.approvedBy" : "sub.rejectedBy"} /> {sub.reviewer_name || <T k="sub.reviewer" />}
            </div>
            <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginTop: 2 }}><LocalDate iso={sub.reviewed_at} /></div>
            {sub.review_note && <div style={{ fontSize: ".88rem", marginTop: 6 }}>“{sub.review_note}”</div>}
          </div>
        )}

        <div style={{ marginTop: 26, paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: ".72rem", color: "var(--ink-3)", fontFamily: "monospace", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span><T k="sub.footer" /></span>
          <span style={{ wordBreak: "break-all" }}>{String(sub.id)}</span>
        </div>
      </div>
      {/* หน้าภาพประกอบท้ายเอกสาร (พิมพ์เท่านั้น) */}
      {pp.mode === "appendix" && (
        <PhotoAppendix items={photoItems} cols={pp.cols} imgH={mmToPx(pp.height_mm)} title={String(sub.form_title || "")} />
      )}
      <style>{`@media(max-width:600px){ .krok-sub-row{flex-direction:column;gap:4px} .krok-sub-label{width:auto !important} } @media print{ .krok-sub-thumb{max-height:64px !important; max-width:110px !important} }`}</style>
    </div>
  );
}
