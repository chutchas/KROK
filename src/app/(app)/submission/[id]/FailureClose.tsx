"use client";
import HelpTip from "@/components/HelpTip";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, CircleCheck, RotateCcw } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { LocalDate } from "@/i18n/T";
import { closeFailure, reopenFailure } from "@/lib/failure-close-actions";
import { daysSince } from "@/lib/fail-items";

export interface FailureState {
  /** ข้อที่ไม่ผ่าน + หมายเหตุของผู้ตรวจ (ถ้ามี) */
  items: { label: string; note?: string }[];
  closedAt: string | null;
  closedBy: string | null;
  note: string | null;
  /** ประวัติปิด/เปิดกลับ (0081) — เก่าไปใหม่ */
  history: FailureEvent[];
}

export interface FailureEvent { action: "close" | "reopen"; at: string; byName: string; note?: string; reason?: string }

/**
 * สถานะเรื่องของใบไม่ผ่าน — ยังไม่ปิด (ผู้จัดการกดปิดพร้อมหมายเหตุการแก้ไข) / ปิดแล้ว (ใคร เมื่อไร แก้อย่างไร)
 * supported=false = ยังไม่รัน 0080 → แสดงแค่ข้อที่ไม่ผ่าน ไม่มีปุ่ม · หน้าพิมพ์/PDF แสดงบันทึกการปิดเรื่องแยก (FailureCloseRecord)
 */
export default function FailureClose({ id, state, canClose, canReopen, supported, historySupported = false, submittedAt = null }: {
  id: string; state: FailureState; canClose: boolean; canReopen: boolean; supported: boolean;
  /** รัน 0081 แล้ว (เปิดกลับเก็บเหตุผล + หมายเหตุเดิมไว้ในประวัติ) */
  historySupported?: boolean;
  submittedAt?: string | null;
}) {
  const { t, tt } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  /** ฟอร์มเปิดเรื่องกลับ (ต้องมีเหตุผล) */
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** ข้อความประกาศผล (screen reader) + ย้ายโฟกัสกลับหัวแผงหลังเปลี่ยนสถานะ */
  const [done, setDone] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const reopenBtnRef = useRef<HTMLButtonElement>(null);
  /** กดยกเลิกแล้วคืนโฟกัสให้ปุ่มที่เปิดฟอร์ม (ไม่หลุดไปที่ body) */
  const refocus = useRef<"close" | "reopen" | null>(null);
  const closed = !!state.closedAt;
  const days = closed ? 0 : daysSince(submittedAt);

  useEffect(() => {
    if (done) headRef.current?.focus();
  }, [done, closed]);
  useEffect(() => {
    if (!refocus.current || open || reopening) return;
    (refocus.current === "close" ? closeBtnRef : reopenBtnRef).current?.focus();
    refocus.current = null;
  }, [open, reopening]);

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, okMsg: string) {
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await fn();
      if ("error" in r) { setErr(r.error); return; }
      setOpen(false); setNote(""); setReopening(false); setReason("");
      setDone(okMsg);
      router.refresh();
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(false);
    }
  }


  const box: React.CSSProperties = { display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10, marginBottom: 12, fontSize: ".88rem" };
  const h: React.CSSProperties = { fontSize: ".95rem", margin: 0, outline: "none", display: "inline-flex", alignItems: "center", gap: 8 };
  const textarea: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" };
  // ประวัติแสดงเมื่อมีการเปิดกลับอย่างน้อยครั้งเดียว (ปิดครั้งเดียว = ข้อมูลซ้ำกับหัวแผง)
  const history = state.history.some((e) => e.action === "reopen") && (
    <details style={{ fontSize: ".82rem" }}>
      <summary style={{ cursor: "pointer", color: "var(--ink-2)", minHeight: 32, display: "flex", alignItems: "center" }}>{tt("fc.historyN", { n: state.history.length })}</summary>
      <ol style={{ margin: "4px 0 0", paddingLeft: 20, display: "grid", gap: 4, color: "var(--ink-2)" }}>
        {state.history.map((e, i) => (
          <li key={i}>
            <b style={{ color: "var(--ink)" }}>{e.action === "close" ? t("fc.evClose") : t("fc.evReopen")}</b> · {e.byName || "—"} · <LocalDate iso={e.at} />
            {e.note && <div style={{ whiteSpace: "pre-wrap" }}>{t("fc.fixLabel")} {e.note}</div>}
            {e.reason && <div style={{ whiteSpace: "pre-wrap" }}>{t("fc.reasonLabel")} {e.reason}</div>}
          </li>
        ))}
      </ol>
    </details>
  );
  const live = <div role="status" aria-live="polite" className="sr-only">{done || ""}</div>;
  const list = state.items.length > 0 && (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 2 }}>
      {state.items.map((it, i) => (
        <li key={i}><span>{it.label}</span>{it.note && <span style={{ color: "var(--ink-2)" }}> — {it.note}</span>}</li>
      ))}
    </ul>
  );

  if (closed) {
    return (
      <section className="no-print" aria-labelledby="fc-h" style={{ ...box, border: "1px solid var(--line)", background: "var(--surface)" }}>
        {live}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 id="fc-h" ref={headRef} tabIndex={-1} style={h}>
            <span style={{ display: "inline-flex", color: "var(--pass)" }}><Icon icon={CircleCheck} className="h-[18px] w-[18px]" /></span>
            {tt("fc.closedTitleN", { n: state.items.length })}
          </h2>
          <span style={{ color: "var(--ink-2)", fontSize: ".82rem" }}>
            {t("fc.closedBy")} {state.closedBy || "—"} · <LocalDate iso={state.closedAt} />
          </span>
        </div>
        {list}
        {state.note && <div style={{ whiteSpace: "pre-wrap" }}><span style={{ color: "var(--ink-3)" }}>{t("fc.fixLabel")} </span>{state.note}</div>}
        {history}
        {reopening && (
          <>
            <div style={{ color: "var(--ink-2)", fontSize: ".82rem" }}>{historySupported ? t("fc.reopenConfirm") : t("fc.reopenConfirmNoHist")}</div>
            <label style={{ display: "grid", gap: 4 }}>
              {t("fc.reopenReason")}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} autoFocus
                placeholder={t("fc.reopenReasonPh")} aria-describedby="fc-reason-hint" aria-required="true" style={textarea} />
              <span id="fc-reason-hint" style={{ fontSize: ".76rem", color: "var(--ink-2)" }}>{t("trash.reasonMin")}</span>
            </label>
          </>
        )}
        {err && <Notice kind="error">{err}</Notice>}
        {canReopen && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: reopening ? "flex-end" : "flex-start" }}>
            {reopening ? (
              <>
                <Button onClick={() => { setReopening(false); setErr(null); refocus.current = "reopen"; }} disabled={busy}>{t("common.cancel")}</Button>
                <Button variant="danger" onClick={() => run(() => reopenFailure(id, reason), t("fc.reopened"))} disabled={busy || reason.trim().length < 3} loading={busy}>
                  <Icon icon={RotateCcw} className="h-4 w-4" /> {t("fc.reopen")}
                </Button>
              </>
            ) : (
              <Button ref={reopenBtnRef} variant="ghost" onClick={() => setReopening(true)} aria-expanded={false} style={{ fontSize: ".82rem", minHeight: 44 }}>
                <Icon icon={RotateCcw} className="h-4 w-4" /> {t("fc.reopen")}
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="no-print" aria-labelledby="fc-h" style={{ ...box, border: "1px solid var(--fail)", background: "var(--fail-soft)" }}>
      {live}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 id="fc-h" ref={headRef} tabIndex={-1} style={{ ...h, color: "var(--fail-text)" }}>
          <Icon icon={CircleX} className="h-[18px] w-[18px]" />
          {supported ? tt("fc.openTitleN", { n: state.items.length }) : tt("sub.issues", { n: state.items.length })}
        </h2>
        {supported && days > 0 && <span style={{ color: "var(--fail-text)", fontSize: ".82rem", fontWeight: 600 }}>{tt("fc.daysOpen", { n: days })}</span>}
        {supported && canClose && !open && (
          <Button ref={closeBtnRef} onClick={() => setOpen(true)} aria-expanded={false} style={{ marginLeft: "auto", minHeight: 44 }}>
            <Icon icon={CircleCheck} className="h-4 w-4" /> {t("fc.close")}
          </Button>
        )}
      </div>
      {list}
      {supported && <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", color: "var(--ink-2)", fontSize: ".82rem" }}>{canClose ? t("fc.openSub") : t("fc.openSubMember")}{canClose && <HelpTip id="close-failure" compact />}</div>}
      {history}
      {open && (
        <>
          <label style={{ display: "grid", gap: 4 }}>
            {t("fc.noteLabel")}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} autoFocus
              placeholder={t("fc.notePh")} aria-describedby="fc-note-hint" aria-required="true" style={textarea} />
            <span id="fc-note-hint" style={{ fontSize: ".76rem", color: "var(--ink-2)" }}>{t("trash.reasonMin")}</span>
          </label>
          {err && <Notice kind="error">{err}</Notice>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button onClick={() => { setOpen(false); setErr(null); refocus.current = "close"; }} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => run(() => closeFailure(id, note), t("fc.closedDone"))} disabled={busy || note.trim().length < 3} loading={busy}>
              <Icon icon={CircleCheck} className="h-4 w-4" /> {t("fc.closeConfirm")}
            </Button>
          </div>
        </>
      )}
      {!open && err && <Notice kind="error">{err}</Notice>}
    </section>
  );
}

/**
 * บันทึกการปิดเรื่องบนหน้าพิมพ์/PDF — กล่องแยกท้ายเอกสาร ไม่แตะเนื้อหาที่กรอก (หลักฐานสำหรับผู้ตรวจสอบ)
 * มักตกไปหน้าใหม่ (กระดาษเต็ม A4) จึงต้องบอกเองว่าเป็นของเอกสารใบไหน + ช่องลงชื่อผู้ตรวจสอบ
 */
export function FailureCloseRecord({ closedAt, closedBy, note, items, formTitle, docNo, submittedAt, filler }: {
  closedAt: string | null; closedBy: string | null; note: string | null; items: { label: string }[];
  formTitle: string; docNo: string; submittedAt: string | null; filler: string;
}) {
  const { t, lang } = useT();
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  const tone = closedAt ? "#166534" : "#b91c1c";
  const muted = { color: "#555" };
  const sign = (label: string) => (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div style={{ borderBottom: "1px solid #333", height: 28 }} />
      <div style={{ ...muted, fontSize: 11, marginTop: 3 }}>{label}</div>
      <div style={{ ...muted, fontSize: 11, marginTop: 10 }}>{t("fc.recordDate")} ........../........../..........</div>
    </div>
  );
  return (
    <section className="krok-close-record" aria-labelledby="fc-record-h" style={{ width: "210mm", boxSizing: "border-box", padding: "10mm 14mm", background: "#fff", color: "#111", fontSize: 12, lineHeight: 1.55, breakInside: "avoid" }}>
      <div style={{ border: `1.5px solid ${tone}`, borderRadius: 4, padding: "10px 14px", display: "grid", gap: 4 }}>
        <h2 id="fc-record-h" style={{ fontSize: 14, margin: "0 0 2px", color: tone }}>{closedAt ? t("fc.recordTitle") : t("fc.recordOpenTitle")}</h2>
        {/* เอกสารต้นทาง — แยกแผ่นแล้วยังรู้ว่าเป็นของใบไหน */}
        <div style={{ paddingBottom: 6, marginBottom: 2, borderBottom: "1px solid #ddd" }}>
          <div><span style={muted}>{t("fc.recordDoc")} </span><b>{formTitle}</b> · {docNo}</div>
          <div><span style={muted}>{t("fc.recordFiled")} </span>{filler || "—"}{submittedAt ? ` · ${fmt(submittedAt)}` : ""}</div>
        </div>
        {items.length > 0 && <div><span style={muted}>{t("fc.recordItems")} </span>{items.map((i) => i.label).join(", ")}</div>}
        {closedAt && <div><span style={muted}>{t("fc.recordBy")} </span>{closedBy || "—"} · {fmt(closedAt)}</div>}
        {closedAt && note && <div style={{ whiteSpace: "pre-wrap" }}><span style={muted}>{t("fc.fixLabel")} </span>{note}</div>}
        {closedAt && (
          <div style={{ display: "flex", gap: "12mm", marginTop: 14 }}>
            {sign(t("fc.recordSignCloser"))}
            {sign(t("fc.recordSignReviewer"))}
          </div>
        )}
      </div>
    </section>
  );
}
