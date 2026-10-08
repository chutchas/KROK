"use client";
// ปุ่มเปิดฟอร์มลูก (0074) + รายการฟอร์มลูกที่เปิดจากปุ่มนี้
// ปุ่มเป็น UI ของเว็บ: ไม่พิมพ์ลงกระดาษ (กล่องยังกินพื้นที่เท่าเดิม ไม่ขยับ layout)
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FilePlus2 } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import type { FormField } from "@/lib/form-schema";
import { openChildForm, type ChildLink } from "./child-actions";

export default function ChildFormPanel({ field: f, caseId, caseOpen, readOnly, links, beforeOpen, onOpened, paper = false }: {
  field: FormField;
  /** id ใบหลัก (ยังไม่เริ่มงาน = null) */
  caseId: string | null;
  caseOpen: boolean;
  /** ขั้นนี้ไม่ใช่ของผู้ใช้ตอนนี้ (ดูอย่างเดียว) */
  readOnly: boolean;
  links: ChildLink[];
  /** บันทึกช่วงของตัวเองก่อน (ค่าที่ส่งไปฟอร์มลูกอ่านจากฐานข้อมูล) */
  beforeOpen: () => Promise<unknown>;
  onOpened: () => void;
  paper?: boolean;
}) {
  const { t, tt, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [opened, setOpened] = useState<{ formId: string; caseId: string; mine: boolean } | null>(null);
  const cfg = f.child_form;
  const formTitle = cfg?.form_title || t("child.formFallback");
  const mine = links.filter((l) => l.parent_field_id === f.id);
  const canMore = !cfg || cfg.multiple || !mine.some((l) => l.status !== "cancelled");

  async function open() {
    if (!caseId || busy) return;
    setBusy(true); setErr(""); setOpened(null);
    try {
      await beforeOpen();
      const r = await openChildForm(caseId, f.id);
      if ("error" in r) { setErr(localizeServerMsg(r.error, lang)); return; }
      setOpened({ formId: r.childFormId, caseId: r.childCaseId, mine: r.mine });
      onOpened();
    } catch (e) {
      setErr(e instanceof Error ? localizeServerMsg(e.message, lang) : t("fw.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const statusText = (l: ChildLink) =>
    l.status === "done" ? (l.writeback_status === "failed" ? `${t("child.st.done")} · ${t("child.wbFailed")}` : t("child.st.done"))
    : l.status === "cancelled" ? t("child.st.cancelled") : t("child.st.pending");
  const statusColor = (l: ChildLink) => (l.status === "done" ? "var(--pass)" : l.status === "cancelled" ? "var(--ink-3)" : "var(--warn)");

  return (
    <div className="krok-child-form" style={{ border: `1px dashed ${paper ? "#b9bec4" : "var(--line)"}`, borderRadius: 10, padding: paper ? 6 : 12, background: paper ? "#fff" : "var(--surface)" }}>
      {/* ปุ่มไม่พิมพ์ลงกระดาษ — visibility: hidden กินที่เท่าเดิม */}
      <style>{`@media print{.krok-child-form{visibility:hidden!important}}`}</style>
      {!cfg ? (
        <span style={{ fontSize: ".82rem", color: "var(--ink-3)" }}>{t("child.notConfigured")}</span>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={open} disabled={!caseId || !caseOpen || readOnly || busy || !canMore}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: paper ? "4px 10px" : "9px 14px", borderRadius: 8, border: "1px solid var(--accent)",
                background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 600, fontSize: paper ? ".8rem" : ".9rem",
                cursor: !caseId || !caseOpen || readOnly || busy || !canMore ? "not-allowed" : "pointer", opacity: !caseId || !caseOpen || readOnly || !canMore ? 0.55 : 1 }}>
              <Icon icon={FilePlus2} className="h-4 w-4" /> {busy ? t("child.opening") : f.label?.trim() || tt("child.open", { form: formTitle })}
            </button>
            {!caseId && <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("child.needCase")}</span>}
            {caseId && !canMore && <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("child.onlyOnce")}</span>}
          </div>
          {err && <p role="alert" style={{ color: "var(--fail)", fontSize: ".8rem", margin: "6px 0 0" }}>{err}</p>}
          {opened && (
            <p role="status" style={{ fontSize: ".82rem", margin: "8px 0 0", color: "var(--ink-2)" }}>
              {opened.mine ? t("child.openedMine") : t("child.openedOther")}{" "}
              {opened.mine && <Link href={`/fill/${opened.formId}?case=${opened.caseId}`} style={{ color: "var(--accent-text)" }}>{t("child.goFill")}</Link>}
            </p>
          )}
          {mine.length > 0 && (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 4 }}>
              {mine.map((l) => {
                const href = l.child_submission_id ? `/submission/${l.child_submission_id}` : l.child_form_id && l.child_case_id ? `/fill/${l.child_form_id}?case=${l.child_case_id}` : null;
                return (
                  <li key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".8rem", flexWrap: "wrap" }}>
                    <span style={{ color: statusColor(l), fontWeight: 600 }}>● {statusText(l)}</span>
                    <span style={{ color: "var(--ink-2)" }}>{l.child_form_title} · {l.created_name || "—"}</span>
                    {href && (
                      <Link href={href} style={{ color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Icon icon={ExternalLink} className="h-3 w-3" /> {t("child.view")}
                      </Link>
                    )}
                    {l.status === "cancelled" && l.cancel_reason && <span style={{ flexBasis: "100%", color: "var(--ink-3)", fontSize: ".76rem" }}>{l.cancel_reason}</span>}
                    {l.writeback_status === "failed" && l.writeback_error && <span style={{ flexBasis: "100%", color: "var(--fail)", fontSize: ".76rem" }}>{l.writeback_error}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
