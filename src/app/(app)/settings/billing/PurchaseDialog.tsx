"use client";
// ============================================================
// KROK · ยืนยันก่อนไปหน้าชำระ — แสดงยอด + ขอความยินยอมต่ออายุอัตโนมัติ (บัตร) อย่างชัดเจน
// ============================================================
import { backdropClose } from "@/lib/backdrop";
import { useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import type { Plan } from "@/lib/plans";

export default function PurchaseDialog({ plan, renewing, busy, onConfirm, onClose }: {
  plan: Plan;
  /** ต่ออายุแพ็กเกจเดิม (ไม่ใช่ซื้อใหม่) */
  renewing: boolean;
  busy: boolean;
  onConfirm: (autoRenew: boolean) => void;
  onClose: () => void;
}) {
  const { t, tt, lang } = useT();
  const en = lang === "en";
  const [autoRenew, setAutoRenew] = useState(true);
  const price = plan.priceThb.toLocaleString("en-US");
  const name = en ? plan.nameEn : plan.name;
  return (
    <BodyPortal>
      <div role="dialog" aria-modal="true" aria-label={t("buy.title")} {...backdropClose(onClose)}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,12,18,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: "min(460px, 100%)", background: "var(--surface)", color: "var(--ink)", borderRadius: 14, border: "1px solid var(--line)", boxShadow: "0 18px 50px rgba(0,0,0,.3)", padding: 20, display: "grid", gap: 12 }}>
          <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>{renewing ? tt("buy.renewTitle", { plan: name }) : tt("buy.buyTitle", { plan: name })}</b>
          <div style={{ fontSize: ".95rem" }}>{tt("buy.amount", { price })}</div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", border: "1px solid var(--line)", borderRadius: 10, padding: 12, background: "var(--surface-2)" }}>
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: "var(--accent)" }} />
            <span style={{ fontSize: ".86rem", lineHeight: 1.55 }}>
              <b>{t("buy.autoRenew")}</b>
              <span style={{ display: "block", color: "var(--ink-2)" }}>{tt("buy.autoRenewHint", { price })}</span>
            </span>
          </label>
          <p style={{ margin: 0, fontSize: ".78rem", color: "var(--ink-3)" }}>{t("buy.note")}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={onClose} disabled={busy}>{t("intg.cancel")}</Button>
            <Button variant="primary" onClick={() => onConfirm(autoRenew)} loading={busy}>{t("buy.go")}</Button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
