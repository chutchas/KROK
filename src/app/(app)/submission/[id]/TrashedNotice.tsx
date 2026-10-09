"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { restoreSubmission } from "@/lib/submission-trash-actions";

/** owner/admin เปิดลิงก์ของเอกสารที่อยู่ในถังขยะ → บอกว่าถูกลบ ใคร เพราะอะไร + กู้คืนได้ตรงนี้ (แทนหน้า "ไม่พบ") */
export default function TrashedNotice({ id, title, docNo, by, reason, deletedAt }: { id: string; title: string; docNo: string; by: string; reason: string; deletedAt: string }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = new Date(deletedAt).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  async function restore() {
    setBusy(true); setErr(null);
    try {
      const r = await restoreSubmission(id);
      if ("error" in r) { setErr(r.error); return; }
      router.refresh();
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ maxWidth: 560, margin: "32px auto", padding: "0 4px", display: "grid", gap: 12 }}>
      <span aria-hidden style={{ width: 52, height: 52, borderRadius: 14, background: "var(--fail-soft)", color: "var(--fail-text)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon icon={Trash2} className="h-6 w-6" />
      </span>
      <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{tt("trash.inTrashTitle", { no: docNo })}</h1>
      <p style={{ margin: 0, color: "var(--ink-2)" }}>{title}</p>
      <p style={{ margin: 0, fontSize: ".9rem", color: "var(--ink-2)" }}>{tt("trash.deletedMeta", { by, at: when })}{reason ? <> · “{reason}”</> : null}</p>
      {err && <div role="alert"><Notice kind="error">{err}</Notice></div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={restore} loading={busy} style={{ minHeight: 44 }}><Icon icon={RotateCcw} className="h-4 w-4" /> {t("trash.restore")}</Button>
        <a href="/reports/trash" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 6px" }}>{t("trash.title")}</a>
      </div>
    </div>
  );
}
