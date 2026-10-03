"use client";
// ============================================================
// KROK · แบนเนอร์เตือนโควตาใกล้เต็ม/เต็ม (แดชบอร์ด + หน้าที่กำลังจะสร้างของ) — เต็มแล้ว = งานบางอย่างจะถูกบล็อก
// ข้อความตามภาษาที่ผู้ใช้เลือก (label ใน QuotaWarning เป็นภาษาไทยสำหรับอีเมลแจ้งเตือน — หน้าจอใช้ key แทน)
// ============================================================
import Link from "next/link";
import { fmtLimit } from "@/lib/plans";
import type { QuotaWarning } from "@/lib/quota-warn";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";

const LABEL_KEY: Record<string, MessageKey> = {
  submissions: "plan.submissions",
  storage: "plan.storage",
  forms: "plan.forms",
  members: "plan.members",
  ai_form_gen: "quota.ai.form_gen",
  ai_form_from_image: "quota.ai.form_from_image",
  ai_photo_check: "quota.ai.photo_check",
  ai_doc_extract: "quota.ai.doc_extract",
};

export default function QuotaBanner({ warnings, canUpgrade }: { warnings: QuotaWarning[]; canUpgrade: boolean }) {
  const { t } = useT();
  if (!warnings.length) return null;
  const full = warnings.some((w) => w.level === 100);
  const c = full ? "var(--fail)" : "var(--amber, #b45309)";
  const label = (w: QuotaWarning) => (LABEL_KEY[w.metric] ? t(LABEL_KEY[w.metric]) : w.label);
  return (
    <div role="status" style={{ border: `1px solid ${c}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, background: "var(--surface)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: ".88rem", lineHeight: 1.6 }}>
        <b style={{ color: c }}>{full ? t("quota.full") : t("quota.near")}</b>
        <div style={{ color: "var(--ink-2)" }}>
          {warnings.slice(0, 4).map((w) => `${label(w)} ${w.used.toLocaleString("en-US")}/${fmtLimit(w.max)}${w.unit ? ` ${w.unit}` : ""} (${w.pct}%)`).join(" · ")}
        </div>
      </div>
      {canUpgrade ? (
        <Link href="/settings/billing" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 8, padding: "7px 14px", fontSize: ".85rem", fontWeight: 600, textDecoration: "none" }}>{t("quota.seePlans")}</Link>
      ) : (
        <span style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("quota.askOwner")}</span>
      )}
    </div>
  );
}
