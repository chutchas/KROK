"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, CircleCheck, RotateCcw } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { LocalDate } from "@/i18n/T";
import { confirmDialog } from "@/components/dialogs";
import { closeFailure, reopenFailure } from "@/lib/failure-close-actions";

export interface FailureState {
  /** ข้อที่ไม่ผ่าน + หมายเหตุของผู้ตรวจ (ถ้ามี) */
  items: { label: string; note?: string }[];
  closedAt: string | null;
  closedBy: string | null;
  note: string | null;
}

/**
 * สถานะเรื่องของใบไม่ผ่าน — ยังไม่ปิด (ผู้จัดการกดปิดพร้อมหมายเหตุการแก้ไข) / ปิดแล้ว (ใคร เมื่อไร แก้อย่างไร)
 * supported=false = ยังไม่รัน 0080 → แสดงแค่ข้อที่ไม่ผ่าน ไม่มีปุ่ม · หน้าพิมพ์/PDF แสดงบันทึกการปิดเรื่องแยก (FailureCloseRecord)
 */
export default function FailureClose({ id, state, canClose, canReopen, supported }: {
  id: string; state: FailureState; canClose: boolean; canReopen: boolean; supported: boolean;
}) {
  const { t, tt } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** ข้อความประกาศผล (screen reader) + ย้ายโฟกัสกลับหัวแผงหลังเปลี่ยนสถานะ */
  const [done, setDone] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const closed = !!state.closedAt;

  useEffect(() => {
    if (done) headRef.current?.focus();
  }, [done, closed]);

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, okMsg: string) {
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await fn();
      if ("error" in r) { setErr(r.error); return; }
      setOpen(false); setNote("");
      setDone(okMsg);
      router.refresh();
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!(await confirmDialog({ title: t("fc.reopen"), message: t("fc.reopenConfirm"), confirmLabel: t("fc.reopen"), danger: true }))) return;
    await run(() => reopenFailure(id), t("fc.reopened"));
  }

  const box: React.CSSProperties = { display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10, marginBottom: 12, fontSize: ".88rem" };
  const h: React.CSSProperties = { fontSize: ".95rem", margin: 0, outline: "none", display: "inline-flex", alignItems: "center", gap: 8 };
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
          <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>
            {state.closedBy || "—"} · <LocalDate iso={state.closedAt} />
          </span>
        </div>
        {list}
        {state.note && <div style={{ whiteSpace: "pre-wrap" }}><span style={{ color: "var(--ink-3)" }}>{t("fc.fixLabel")} </span>{state.note}</div>}
        {err && <Notice kind="error">{err}</Notice>}
        {canReopen && (
          <div>
            <Button variant="ghost" onClick={reopen} disabled={busy} loading={busy} style={{ fontSize: ".82rem" }}>
              <Icon icon={RotateCcw} className="h-4 w-4" /> {t("fc.reopen")}
            </Button>
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
        {supported && canClose && !open && (
          <Button onClick={() => setOpen(true)} style={{ marginLeft: "auto" }}>
            <Icon icon={CircleCheck} className="h-4 w-4" /> {t("fc.close")}
          </Button>
        )}
      </div>
      {list}
      {supported && <div style={{ color: "var(--ink-2)", fontSize: ".82rem" }}>{canClose ? t("fc.openSub") : t("fc.openSubMember")}</div>}
      {open && (
        <>
          <label style={{ display: "grid", gap: 4 }}>
            {t("fc.noteLabel")}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} autoFocus
              placeholder={t("fc.notePh")} aria-describedby="fc-note-hint"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }} />
            <span id="fc-note-hint" style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{t("trash.reasonMin")}</span>
          </label>
          {err && <Notice kind="error">{err}</Notice>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button onClick={() => { setOpen(false); setErr(null); }} disabled={busy}>{t("common.cancel")}</Button>
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

/** บันทึกการปิดเรื่องบนหน้าพิมพ์/PDF — กล่องแยกท้ายเอกสาร ไม่แตะเนื้อหาที่กรอก (หลักฐานสำหรับผู้ตรวจสอบ) */
export function FailureCloseRecord({ closedAt, closedBy, note, items }: { closedAt: string; closedBy: string | null; note: string | null; items: { label: string }[] }) {
  const { t, lang } = useT();
  const when = new Date(closedAt).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="krok-close-record" style={{ width: "210mm", boxSizing: "border-box", padding: "10mm 14mm", background: "#fff", color: "#111", fontSize: 12, lineHeight: 1.5, breakInside: "avoid" }}>
      <div style={{ border: "1.5px solid #166534", borderRadius: 4, padding: "8px 12px" }}>
        <b style={{ display: "block", fontSize: 13, color: "#166534", marginBottom: 4 }}>{t("fc.recordTitle")}</b>
        {items.length > 0 && <div><span style={{ color: "#555" }}>{t("fc.recordItems")} </span>{items.map((i) => i.label).join(", ")}</div>}
        <div><span style={{ color: "#555" }}>{t("fc.recordBy")} </span>{closedBy || "—"} · {when}</div>
        {note && <div style={{ whiteSpace: "pre-wrap" }}><span style={{ color: "#555" }}>{t("fc.fixLabel")} </span>{note}</div>}
      </div>
    </section>
  );
}
