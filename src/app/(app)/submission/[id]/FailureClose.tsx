"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, CircleCheck, RotateCcw } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { LocalDate } from "@/i18n/T";
import { closeFailure, reopenFailure } from "@/lib/failure-close-actions";

export interface FailureState {
  fails: number;
  closedAt: string | null;
  closedBy: string | null;
  note: string | null;
}

/**
 * สถานะเรื่องของใบไม่ผ่าน — ยังไม่ปิด (ผู้จัดการกดปิดพร้อมหมายเหตุการแก้ไข) / ปิดแล้ว (ใคร เมื่อไร แก้อย่างไร)
 * supported=false = ยังไม่รัน 0080 → แสดงแค่จำนวนข้อที่ไม่ผ่าน ไม่มีปุ่ม
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

  async function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if ("error" in r) { setErr(r.error); return; }
      setOpen(false); setNote("");
      router.refresh();
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = { display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10, marginBottom: 12, fontSize: ".88rem" };

  if (state.closedAt) {
    return (
      <section className="no-print" aria-label={t("fc.closedTitle")} style={{ ...box, border: "1px solid var(--line)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", color: "var(--pass)" }}><Icon icon={CircleCheck} className="h-[18px] w-[18px]" /></span>
          <b>{t("fc.closedTitle")}</b>
          <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>
            {state.closedBy || "—"} · <LocalDate iso={state.closedAt} />
          </span>
        </div>
        {state.note && <div style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}><span style={{ color: "var(--ink-3)" }}>{t("fc.fixLabel")} </span>{state.note}</div>}
        {err && <Notice kind="error">{err}</Notice>}
        {canReopen && (
          <div>
            <Button variant="ghost" onClick={() => run(() => reopenFailure(id))} disabled={busy} loading={busy} style={{ fontSize: ".82rem" }}>
              <Icon icon={RotateCcw} className="h-4 w-4" /> {t("fc.reopen")}
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="no-print" aria-label={t("fc.openTitle")} style={{ ...box, border: "1px solid var(--fail)", background: "var(--fail-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", color: "var(--fail-text)" }}><Icon icon={CircleX} className="h-[18px] w-[18px]" /></span>
        <b style={{ color: "var(--fail-text)" }}>{tt("fc.openTitleN", { n: state.fails })}</b>
        {supported && <span style={{ color: "var(--ink-2)", fontSize: ".82rem" }}>{t("fc.openSub")}</span>}
        {supported && canClose && !open && (
          <Button onClick={() => setOpen(true)} style={{ marginLeft: "auto" }}>
            <Icon icon={CircleCheck} className="h-4 w-4" /> {t("fc.close")}
          </Button>
        )}
      </div>
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
            <Button variant="primary" onClick={() => run(() => closeFailure(id, note))} disabled={busy || note.trim().length < 3} loading={busy}>
              <Icon icon={CircleCheck} className="h-4 w-4" /> {t("fc.closeConfirm")}
            </Button>
          </div>
        </>
      )}
      {!open && err && <Notice kind="error">{err}</Notice>}
    </section>
  );
}
