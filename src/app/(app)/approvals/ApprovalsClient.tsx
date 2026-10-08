"use client";
import StoredText from "@/i18n/StoredText";
import FormIcon from "@/components/FormIcon";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, Field, Pill, TextArea } from "@/components/ui";
import Icon from "@/components/Icon";
import { PartyPopper, Check, X, Play, ArrowRight, Paperclip, TriangleAlert } from "lucide-react";
import { reviewSubmission, approveMany, loadEvidencePhotos } from "./actions";
import { useT } from "@/i18n/LanguageProvider";

import type { ApprovalStep } from "@/lib/approval";
import { alertDialog, confirmDialog } from "@/components/dialogs";
import AreaOpenNotice from "@/components/AreaOpenNotice";
import type { OpenItem } from "@/lib/areas";
import {
  BULK_APPROVE_MAX,
  EMPTY_FILTER,
  MIN_REJECT_REASON,
  QUEUE_PAGE,
  areaOptions,
  filterQueue,
  formOptions,
  isRejectReasonValid,
  summarizeBulk,
  type Evidence,
  type QueueFilter,
  type ResultFilter,
} from "@/lib/approval-queue";

export interface PendingSub {
  id: string;
  form_id?: string | null;
  form_title: string;
  form_icon: string;
  user_name: string;
  result: "pass" | "fail";
  fails: string[];
  answers: { label: string; display?: string; note?: string; fail?: boolean; type: string }[];
  submitted_at: string;
  approval_step: number;
  approval_chain: ApprovalStep[] | unknown[];
  /** ใบอื่นที่ยังไม่จบในพื้นที่เดียวกัน (มีฟิลด์พื้นที่ · 0072) — เตือนอย่างเดียว */
  area?: { id: string; name: string; others: OpenItem[] };
  /** ข้อไม่ผ่าน + key รูปหลักฐาน (คำนวณที่ server) */
  evidence?: Evidence;
}

/** สถานะรูปของแต่ละใบ: กำลังโหลด / โหลดไม่ได้ / key → URL */
type PhotoState = "loading" | "error" | Record<string, string>;

const TAP = 44; // ขนาดแตะขั้นต่ำบนมือถือ

function fmt(ts: string, lang: string) {
  try {
    return new Date(ts).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function chainOf(s: PendingSub): ApprovalStep[] {
  return (Array.isArray(s.approval_chain) ? s.approval_chain : []).filter(
    (x): x is ApprovalStep => !!x && typeof x === "object" && "user_id" in x
  );
}

/** จำนวนข้อไม่ผ่านของใบ (รายการใน fails ละเอียดกว่า เช่น ตารางนับรายแถว) */
const failCount = (s: PendingSub) => s.fails?.length || s.evidence?.failed.length || 0;

const selectStyle: React.CSSProperties = {
  minHeight: TAP, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8,
  background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".92rem", maxWidth: "100%",
};

export default function ApprovalsClient({ initial, isOwner }: { initial: PendingSub[]; myId: string; isOwner: boolean }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [subs, setSubs] = useState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>(EMPTY_FILTER);
  const [limit, setLimit] = useState(QUEUE_PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; errors: string[] } | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoState>>({});
  const requested = useRef(new Set<string>());

  const forms = useMemo(() => formOptions(subs), [subs]);
  const areas = useMemo(() => areaOptions(subs), [subs]);
  const filtered = useMemo(() => filterQueue(subs, filter), [subs, filter]);
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const filterOn = filter.form !== "" || filter.result !== "all" || filter.area !== "" || filter.q.trim() !== "";

  // อนุมัติหลายใบ: นับเฉพาะที่เลือกและยังอยู่ในรายการที่กรองอยู่ (ไม่อนุมัติใบที่มองไม่เห็น)
  const picked = useMemo(() => filtered.filter((s) => selected.has(s.id)), [filtered, selected]);
  const selectable = shown.slice(0, BULK_APPROVE_MAX);
  const allShownPicked = selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  // รูปหลักฐาน: ขอ URL เป็นชุดเฉพาะใบที่แสดงอยู่และมีรูปที่ต้องดู (ไม่ขอทีละใบ · ไม่ขอซ้ำ)
  const shownKey = shown.map((s) => s.id).join(",");
  useEffect(() => {
    const need = shown.filter((s) => (s.evidence?.photos.length ?? 0) > 0 && !requested.current.has(s.id));
    if (!need.length) return;
    for (const s of need) requested.current.add(s.id);
    setPhotos((p) => ({ ...p, ...Object.fromEntries(need.map((s) => [s.id, "loading" as const])) }));
    const reqs = need.map((s) => ({ id: s.id, keys: (s.evidence?.photos || []).map((x) => x.key) }));
    (async () => {
      for (let i = 0; i < reqs.length; i += BULK_APPROVE_MAX) {
        const chunk = reqs.slice(i, i + BULK_APPROVE_MAX);
        let res: Awaited<ReturnType<typeof loadEvidencePhotos>>;
        try {
          res = await loadEvidencePhotos(chunk);
        } catch {
          res = { error: "network" };
        }
        setPhotos((p) => {
          const n = { ...p };
          for (const r of chunk) n[r.id] = "error" in res ? "error" : res.urls[r.id] || {};
          return n;
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ขึ้นกับชุดใบที่แสดง (shownKey) เท่านั้น
  }, [shownKey]);

  function setF(patch: Partial<QueueFilter>) {
    setFilter((f) => ({ ...f, ...patch }));
    setLimit(QUEUE_PAGE);
  }

  function drop(ids: string[]) {
    const gone = new Set(ids);
    setSubs((prev) => prev.filter((s) => !gone.has(s.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
  }

  async function act(s: PendingSub, decision: "approved" | "rejected") {
    const note = notes[s.id] || "";
    if (decision === "rejected" && !isRejectReasonValid(note)) {
      await alertDialog(t("appr.rejectNeedsNote"));
      return;
    }
    const n = failCount(s);
    if (decision === "approved" && n > 0) {
      const ok = await confirmDialog({ title: t("appr.confirmTitle"), message: tt("appr.confirmFails", { n }), confirmLabel: t("appr.approve") });
      if (!ok) return;
    }
    setBusy(s.id + decision);
    const res = await reviewSubmission(s.id, decision, note);
    setBusy(null);
    if ("error" in res) {
      await alertDialog(res.error);
      return;
    }
    drop([s.id]);
    router.refresh();
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const s of selectable) {
        if (on) n.add(s.id);
        else n.delete(s.id);
      }
      return n;
    });
  }

  async function bulkApprove() {
    const items = picked.slice(0, BULK_APPROVE_MAX);
    if (!items.length) return;
    const withFails = items.filter((s) => failCount(s) > 0).length;
    if (withFails > 0) {
      const ok = await confirmDialog({ title: t("appr.confirmTitle"), message: tt("appr.bulkConfirm", { n: items.length, f: withFails }), confirmLabel: t("appr.approve") });
      if (!ok) return;
    }
    setBulkBusy(true);
    setStatus({ text: tt("appr.bulkRunning", { n: items.length }), errors: [] });
    let res: Awaited<ReturnType<typeof approveMany>>;
    try {
      res = await approveMany(items.map((s) => ({ id: s.id, note: notes[s.id] || "" })));
    } catch (e) {
      res = { error: e instanceof Error ? e.message : String(e) };
    }
    setBulkBusy(false);
    if ("error" in res) {
      setStatus({ text: res.error, errors: [] });
      return;
    }
    const sum = summarizeBulk(res.results);
    const titleOf = new Map(items.map((s) => [s.id, `${s.form_title} · ${s.user_name || "—"}`]));
    setStatus({
      text: tt("appr.bulkResult", { ok: sum.ok, fail: sum.failed.length }),
      errors: sum.failed.map((f) => `${titleOf.get(f.id) || f.id}: ${f.error}`),
    });
    drop(res.results.filter((r) => r.ok).map((r) => r.id));
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 data-tour="appr-title" style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("appr.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {subs.length ? tt("appr.count", { n: subs.length }) : t("appr.none")}
        </p>
      </div>

      {subs.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "24px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Icon icon={PartyPopper} className="h-5 w-5" /> {t("appr.cleared")}</div>
        </Card>
      )}

      {/* สถานะการอนุมัติหลายใบ — role=status ให้โปรแกรมอ่านหน้าจออ่านผล */}
      <div role="status" aria-live="polite">
        {status && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", background: "var(--surface)", fontSize: ".9rem", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{status.text}</b>
              {status.errors.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--fail)", fontSize: ".84rem" }}>
                  {status.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
            {!bulkBusy && (
              <Button variant="ghost" onClick={() => setStatus(null)} aria-label={t("appr.dismiss")} style={{ minHeight: TAP, minWidth: TAP, padding: 0 }}>
                <Icon icon={X} className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {subs.length > 0 && (
        <Card style={{ padding: 14 }}>
          {/* ตัวกรอง (กรองในหน้าจอจากคิวที่โหลดมาแล้ว) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Field
              type="search"
              value={filter.q}
              onChange={(e) => setF({ q: e.target.value })}
              placeholder={t("appr.search")}
              aria-label={t("appr.search")}
              style={{ flex: "1 1 200px", width: "auto", minHeight: TAP }}
            />
            {forms.length > 1 && (
              <select aria-label={t("appr.filterForm")} value={filter.form} onChange={(e) => setF({ form: e.target.value })} style={selectStyle}>
                <option value="">{t("appr.allForms")}</option>
                {forms.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
              </select>
            )}
            <select aria-label={t("appr.filterResult")} value={filter.result} onChange={(e) => setF({ result: e.target.value as ResultFilter })} style={selectStyle}>
              <option value="all">{t("appr.resAll")}</option>
              <option value="fail">{t("appr.resFail")}</option>
              <option value="pass">{t("appr.resPass")}</option>
            </select>
            {areas.length > 0 && (
              <select aria-label={t("appr.filterArea")} value={filter.area} onChange={(e) => setF({ area: e.target.value })} style={selectStyle}>
                <option value="">{t("appr.allAreas")}</option>
                {areas.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
              </select>
            )}
            {filterOn && (
              <Button variant="ghost" onClick={() => setF(EMPTY_FILTER)} style={{ minHeight: TAP, color: "var(--accent-text)" }}>{t("appr.clearFilters")}</Button>
            )}
          </div>

          {/* เลือกหลายใบ + อนุมัติที่เลือก */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: TAP, cursor: "pointer", fontSize: ".9rem" }}>
              <input
                type="checkbox"
                checked={allShownPicked}
                disabled={!selectable.length || bulkBusy}
                onChange={(e) => toggleAll(e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              {t("appr.selectAll")}
            </label>
            <span style={{ flex: 1, color: "var(--ink-3)", fontSize: ".82rem" }}>
              {filterOn || filtered.length > shown.length ? tt("appr.shown", { n: shown.length, total: filtered.length }) : ""}
            </span>
            {picked.length > 0 && !bulkBusy && (
              <Button variant="ghost" onClick={() => setSelected(new Set())} style={{ minHeight: TAP }}>{t("appr.clearSel")}</Button>
            )}
            <Button
              variant="primary"
              onClick={bulkApprove}
              disabled={!picked.length || picked.length > BULK_APPROVE_MAX || !!busy}
              loading={bulkBusy}
              style={{ minHeight: TAP, background: "var(--pass-solid)", borderColor: "var(--pass-solid)" }}
            >
              <Icon icon={Check} className="h-4 w-4" /> {tt("appr.bulkApprove", { n: picked.length })}
            </Button>
          </div>
          {picked.length > BULK_APPROVE_MAX && (
            <p style={{ margin: "6px 0 0", color: "var(--fail)", fontSize: ".82rem" }}>{tt("appr.bulkMax", { n: BULK_APPROVE_MAX })}</p>
          )}
        </Card>
      )}

      {subs.length > 0 && filtered.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "16px 0" }}>{t("appr.noMatch")}</div>
        </Card>
      )}

      {shown.map((s) => {
        const chain = chainOf(s);
        const ev = s.evidence;
        const nFail = failCount(s);
        const note = notes[s.id] || "";
        const canReject = isRejectReasonValid(note);
        const hintId = `rej-hint-${s.id}`;
        const ph = photos[s.id];
        const isPicked = selected.has(s.id);
        return (
          <Card key={s.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: TAP, minHeight: TAP, margin: "-8px 0 -8px -10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isPicked}
                  disabled={bulkBusy || (!isPicked && picked.length >= BULK_APPROVE_MAX)}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                  aria-label={tt("appr.selectItem", { form: s.form_title, user: s.user_name || "—" })}
                  style={{ width: 20, height: 20 }}
                />
              </label>
              <FormIcon value={s.form_icon} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{s.form_title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>{s.user_name || "—"} · {fmt(s.submitted_at, lang)}</small>
              </div>
              {nFail ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {tt("appr.problems", { n: nFail })}</span></Pill> : <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("appr.complete")}</span></Pill>}
            </div>
            {s.area && s.area.others.length > 0 && <AreaOpenNotice areaId={s.area.id} excludeId={s.id} preload={{ name: s.area.name, items: s.area.others }} />}

            {chain.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                {chain.map((st, i) => {
                  const done = i < (s.approval_step ?? 0);
                  const current = i === (s.approval_step ?? 0);
                  return (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: ".76rem", padding: "3px 10px", borderRadius: 20,
                        background: done ? "var(--pass-soft)" : current ? "var(--accent-soft)" : "var(--code-bg)",
                        color: done ? "var(--pass)" : current ? "var(--accent-text)" : "var(--ink-3)",
                        fontWeight: current ? 700 : 500, border: current ? "1px solid var(--accent)" : "1px solid var(--line)",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                        {done && <Icon icon={Check} className="h-3 w-3" />}{current && <Icon icon={Play} className="h-3 w-3" />}{st.label || tt("appr.stepN", { n: i + 1 })}: {st.name}
                      </span>
                      {i < chain.length - 1 && <span style={{ color: "var(--ink-3)", display: "inline-flex" }}><Icon icon={ArrowRight} className="h-3.5 w-3.5" /></span>}
                    </span>
                  );
                })}
                {isOwner && chain[s.approval_step ?? 0]?.user_id !== undefined && (
                  <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>· {t("appr.ownerOverride")}</span>
                )}
              </div>
            )}

            {/* หลักฐาน: ข้อไม่ผ่านกางไว้เสมอ พร้อมหมายเหตุ + รูป */}
            {ev && ev.failed.length > 0 ? (
              <div style={{ borderLeft: "3px solid var(--fail)", background: "var(--fail-soft)", borderRadius: "0 8px 8px 0", padding: "8px 12px", margin: "12px 0 0", fontSize: ".86rem", color: "var(--ink-2)" }}>
                <div style={{ fontWeight: 700, color: "var(--fail)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <Icon icon={TriangleAlert} className="h-3.5 w-3.5" /> {tt("appr.failedItems", { n: nFail })}
                </div>
                {ev.failed.map((f, i) => (
                  <div key={i} style={{ padding: "4px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--ink)" }}>{f.label}</span>
                      {f.display && <b style={{ color: "var(--fail)" }}><StoredText text={f.display} /></b>}
                    </div>
                    {f.details?.map((d, j) => <div key={j} style={{ fontSize: ".8rem" }}>• <StoredText text={d} /></div>)}
                    {f.note && <div style={{ fontSize: ".82rem", color: "var(--ink-2)", fontStyle: "italic" }}>“<StoredText text={f.note} />”</div>}
                  </div>
                ))}
                {ev.photos.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginBottom: 4 }}>{t("appr.photoEvidence")}</div>
                    {ph === "loading" || ph === undefined ? (
                      <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("appr.photosLoading")}</div>
                    ) : ph === "error" ? (
                      <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("appr.photoMissing")}</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {ev.photos.map((p) =>
                          ph[p.key] ? (
                            <a key={p.key} href={ph[p.key]} target="_blank" rel="noopener noreferrer" title={p.label} style={{ display: "block", lineHeight: 0 }}>
                              <img src={ph[p.key]} alt={p.label} loading="lazy" width={72} height={72} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", background: "var(--code-bg)" }} />
                            </a>
                          ) : (
                            <span key={p.key} title={p.label} style={{ width: 72, height: 72, borderRadius: 6, border: "1px dashed var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: ".68rem", color: "var(--ink-3)", padding: 4 }}>{t("appr.photoMissing")}</span>
                          )
                        )}
                        {ev.photoTotal > ev.photos.length && (
                          <Link href={`/submission/${s.id}`} style={{ alignSelf: "center", fontSize: ".8rem" }}>{tt("appr.morePhotos", { n: ev.photoTotal - ev.photos.length })}</Link>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : s.fails?.length > 0 ? (
              <div style={{ borderLeft: "3px solid var(--fail)", background: "var(--fail-soft)", borderRadius: "0 8px 8px 0", padding: "8px 12px", margin: "12px 0 0", fontSize: ".85rem", color: "var(--ink-2)" }}>
                {s.fails.map((f, i) => <div key={i}>• <StoredText text={f} /></div>)}
              </div>
            ) : null}

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--accent-text)", fontSize: ".88rem", minHeight: TAP, display: "flex", alignItems: "center" }}>{t("appr.viewAll")}</summary>
              <div style={{ marginTop: 8 }}>
                {s.answers.map((a, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 14px", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: ".88rem" }}>
                    <div style={{ color: "var(--ink-2)" }}>{a.label}{a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}><StoredText text={a.note} /></div>}</div>
                    <div style={{ fontWeight: 600, textAlign: "right", color: a.fail ? "var(--fail)" : "var(--ink)" }}>{a.type === "photo" || a.type === "signature" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><Icon icon={Paperclip} className="h-3.5 w-3.5" /> {t("appr.hasAttachment")}</span> : a.display ? <StoredText text={a.display} /> : "—"}</div>
                  </div>
                ))}
              </div>
              <Link href={`/submission/${s.id}`} style={{ fontSize: ".85rem", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, minHeight: TAP }}>{t("appr.openDoc").replace(/[→\s]*$/, "")} <Icon icon={ArrowRight} className="h-3.5 w-3.5" /></Link>
            </details>

            <TextArea
              value={note}
              onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
              placeholder={t("appr.notePlaceholder")}
              aria-label={t("appr.notePlaceholder")}
              aria-describedby={hintId}
              maxLength={500}
              style={{ marginTop: 12, minHeight: 52 }}
            />
            <div id={hintId} style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4, minHeight: "1.2em" }}>
              {canReject ? "" : tt("appr.rejectHint", { n: MIN_REJECT_REASON })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <Button variant="primary" onClick={() => act(s, "approved")} disabled={!!busy || bulkBusy} loading={busy === s.id + "approved"} style={{ flex: 1, minHeight: TAP, background: "var(--pass-solid)", borderColor: "var(--pass-solid)" }}>
                <Icon icon={Check} className="h-4 w-4" /> {chain.length > 1 && (s.approval_step ?? 0) < chain.length - 1 ? t("appr.approveNext") : t("appr.approve")}
              </Button>
              <Button variant="danger" onClick={() => act(s, "rejected")} disabled={!!busy || bulkBusy || !canReject} aria-describedby={hintId} loading={busy === s.id + "rejected"} style={{ flex: 1, minHeight: TAP, ...(canReject ? {} : { opacity: 0.55, cursor: "not-allowed" }) }}>
                <Icon icon={X} className="h-4 w-4" /> {t("appr.reject")}
              </Button>
            </div>
          </Card>
        );
      })}

      {filtered.length > shown.length && (
        <Button onClick={() => setLimit((n) => n + QUEUE_PAGE)} style={{ minHeight: TAP, justifySelf: "center" }}>
          {t("appr.showMore")} ({filtered.length - shown.length})
        </Button>
      )}
    </div>
  );
}
