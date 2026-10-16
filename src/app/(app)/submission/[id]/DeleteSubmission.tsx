"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { deleteSubmission } from "@/lib/submission-trash-actions";
import { useInlineConfirmFocus } from "@/lib/use-inline-confirm-focus";

/** ปุ่มลบเอกสาร (เจ้าของ/แอดมิน) — ต้องใส่เหตุผล · ย้ายไปถังขยะ กู้คืนได้ 30 วัน */
export default function DeleteSubmission({ id, docNo }: { id: string; docNo: string }) {
  const { t, tt } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { panelRef, triggerRef } = useInlineConfirmFocus(open, () => { if (!busy) { setOpen(false); setErr(null); } });

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const r = await deleteSubmission(id, reason);
      if ("error" in r) { setErr(r.error); return; }
      router.push("/reports/trash?deleted=1");
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(false);
    }
  }

  // ปุ่มลบคงอยู่ตำแหน่งเดิมตลอด (ปุ่มอื่นในแถบไม่กระโดด) · กล่องยืนยันเปิดเป็นแถวใหม่ใต้ปุ่ม
  const trigger = (
      // จอแคบ: เหลือไอคอนอย่างเดียว (ไม่ตกบรรทัดใต้ปุ่ม PDF)
      <Button ref={triggerRef} variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t("trash.delete")} title={t("trash.delete")} className="krok-sb-del krok-touch-min" style={{ color: "var(--fail)", minWidth: 44 }}>
        <Icon icon={Trash2} className="h-4 w-4" /> <span className="krok-narrow-hide">{t("trash.delete")}</span>
      </Button>
  );
  if (!open) return trigger;
  const panel = (
    <div ref={panelRef} tabIndex={-1} role="group" aria-label={t("trash.delete")} style={{ order: 10, flex: "none", width: "100%", boxSizing: "border-box", display: "grid", gap: 8, padding: 12, border: "1px solid var(--fail)", borderRadius: 10, background: "var(--fail-soft)" }}>
      <b style={{ color: "var(--fail-text)" }}>{tt("trash.confirmTitle", { no: docNo })}</b>
      <span style={{ fontSize: ".84rem", color: "var(--ink-2)" }}>{t("trash.confirmBody")}</span>
      <label style={{ display: "grid", gap: 4, fontSize: ".84rem" }}>
        {t("trash.reason")}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
          placeholder={t("trash.reasonPh")}
          aria-describedby="del-reason-hint"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }} />
        <span id="del-reason-hint" style={{ fontSize: ".76rem", color: reason.trim().length >= 3 ? "var(--ink-3)" : "var(--ink-2)" }}>{t("trash.reasonMin")}</span>
      </label>
      {err && <Notice kind="error">{err}</Notice>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Button onClick={() => { setOpen(false); setErr(null); }} disabled={busy}>{t("common.cancel")}</Button>
        <Button variant="danger" onClick={confirm} disabled={busy || reason.trim().length < 3} loading={busy}>
          <Icon icon={Trash2} className="h-4 w-4" /> {t("trash.deleteConfirm")}
        </Button>
      </div>
    </div>
  );
  // กล่องไปอยู่นอกแถวปุ่ม (ช่อง krok-del-slot ในหน้า) — ไม่มีช่อง = วางต่อท้ายปุ่มแบบเดิม
  const slot = typeof document !== "undefined" ? document.getElementById("krok-del-slot") : null;
  return <>{trigger}{slot ? createPortal(panel, slot) : panel}</>;
}
