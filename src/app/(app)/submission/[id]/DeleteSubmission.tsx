"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { deleteSubmission } from "@/lib/submission-trash-actions";

/** ปุ่มลบเอกสาร (owner/admin) — ต้องใส่เหตุผล · ย้ายไปถังขยะ กู้คืนได้ 30 วัน */
export default function DeleteSubmission({ id, docNo }: { id: string; docNo: string }) {
  const { t, tt } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} style={{ color: "var(--fail)" }}>
        <Icon icon={Trash2} className="h-4 w-4" /> {t("trash.delete")}
      </Button>
    );
  }
  return (
    <div role="group" aria-label={t("trash.delete")} style={{ flexBasis: "100%", display: "grid", gap: 8, padding: 12, border: "1px solid var(--fail)", borderRadius: 10, background: "var(--fail-soft)" }}>
      <b style={{ color: "var(--fail-text)" }}>{tt("trash.confirmTitle", { no: docNo })}</b>
      <span style={{ fontSize: ".84rem", color: "var(--ink-2)" }}>{t("trash.confirmBody")}</span>
      <label style={{ display: "grid", gap: 4, fontSize: ".84rem" }}>
        {t("trash.reason")}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} autoFocus
          placeholder={t("trash.reasonPh")}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }} />
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
}
