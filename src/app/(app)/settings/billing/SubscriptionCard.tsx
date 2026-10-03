"use client";
// ============================================================
// KROK · สถานะการต่ออายุของแพ็กเกจเสียเงิน — วันหมดอายุ / ตัดเงินรอบถัดไป / บัตร / ยกเลิก-เปิดต่ออายุ / เปลี่ยนบัตร
// ============================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Card, Notice } from "@/components/ui";
import { confirmDialog } from "@/components/dialogs";
import { usePayT as useT } from "@/i18n/ns/pay";
import type { Plan } from "@/lib/plans";
import { setAutoRenew, startCardUpdate } from "./actions";

export interface SubscriptionInfo { autoRenew: boolean; cardLabel: string | null; hasCard: boolean; renewPrice: number | null; lastError: string | null; attempts: number }

export default function SubscriptionCard({ plan, expiresAt, daysLeft, sub, isOwner, payable, onRenew, renewBusy }: {
  plan: Plan;
  expiresAt: string;
  daysLeft: number;
  sub: SubscriptionInfo | null;
  isOwner: boolean;
  payable: boolean;
  onRenew: () => void;
  renewBusy: boolean;
}) {
  const router = useRouter();
  const { t, tt, lang } = useT();
  const en = lang === "en";
  const [busy, setBusy] = useState<"" | "toggle" | "card">("");
  const [err, setErr] = useState<string | null>(null);
  const date = new Date(expiresAt).toLocaleDateString(en ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
  const price = (sub?.renewPrice ?? plan.priceThb).toLocaleString("en-US");
  const auto = !!sub?.autoRenew && !!sub.hasCard;

  async function toggle(on: boolean) {
    if (!on && !(await confirmDialog({ message: tt("sub.cancelConfirm", { date }), danger: true }))) return;
    setBusy("toggle"); setErr(null);
    const r = await setAutoRenew(on);
    setBusy("");
    if ("error" in r) setErr(r.error); else router.refresh();
  }
  async function card() {
    setBusy("card"); setErr(null);
    const r = await startCardUpdate();
    if ("setupUrl" in r) { window.location.href = r.setupUrl; return; }
    setBusy(""); setErr(r.error);
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon icon={RefreshCw} className="h-[18px] w-[18px]" />
        <b style={{ fontSize: "1.02rem", flex: 1 }}>{t("sub.title")}</b>
        <span style={{ fontSize: ".74rem", fontWeight: 700, borderRadius: 20, padding: "2px 10px", border: "1px solid", color: auto ? "var(--pass)" : "var(--ink-3)" }}>
          {auto ? t("sub.on") : t("sub.off")}
        </span>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: ".9rem", color: "var(--ink-2)", lineHeight: 1.6 }}>
        {daysLeft <= 0 ? t("pay.expired")
          : auto ? tt("sub.nextCharge", { date, price })
          : tt("sub.endsOn", { date, n: daysLeft })}
      </p>
      {sub?.cardLabel && (
        <p style={{ margin: "4px 0 0", fontSize: ".82rem", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon icon={CreditCard} className="h-4 w-4" /> {sub.cardLabel}
        </p>
      )}
      {sub?.lastError && (
        <Notice kind="error">{tt("sub.failed", { reason: sub.lastError, n: sub.attempts })}</Notice>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {isOwner && payable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {auto ? (
            <Button onClick={() => toggle(false)} loading={busy === "toggle"} disabled={!!busy}>{t("sub.cancel")}</Button>
          ) : sub?.hasCard && daysLeft > -3 ? (
            <Button variant="primary" onClick={() => toggle(true)} loading={busy === "toggle"} disabled={!!busy}>{t("sub.resume")}</Button>
          ) : null}
          {!auto && <Button onClick={onRenew} loading={renewBusy} disabled={!!busy}>{t("pay.renew")}</Button>}
          {(sub?.hasCard || auto) && <Button onClick={card} loading={busy === "card"} disabled={!!busy}><Icon icon={CreditCard} className="h-4 w-4" /> {t("sub.changeCard")}</Button>}
        </div>
      )}
    </Card>
  );
}
