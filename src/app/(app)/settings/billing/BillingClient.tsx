"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { PLANS, PLAN_ORDER, fmtLimit, type PlanKey } from "@/lib/plans";
import { setPlan } from "./actions";

export default function BillingClient({
  isOwner,
  currentPlan,
  tenantName,
  usage,
}: {
  isOwner: boolean;
  currentPlan: PlanKey;
  tenantName: string;
  usage: { forms: number; members: number; ai: number; period: string };
}) {
  const router = useRouter();
  const { t, lang } = useT();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const plan = PLANS[currentPlan];
  const en = lang === "en";

  async function choose(p: PlanKey) {
    if (p === currentPlan) return;
    setBusy(p);
    setMsg(null);
    const res = await setPlan(p);
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setMsg({ t: t("plan.changed") });
      router.refresh();
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("plan.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {tenantName} · {t("plan.current")}: <b style={{ color: "var(--accent)" }}>{en ? plan.nameEn : plan.name}</b>
        </p>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 2 }}>{t("plan.usage")}</h2>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", marginTop: 0 }}>{t("plan.period")}: {usage.period}</p>
        <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
          <UsageBar label={t("plan.forms")} used={usage.forms} max={plan.maxForms} />
          <UsageBar label={t("plan.members")} used={usage.members} max={plan.maxMembers} />
          <UsageBar label={t("plan.aiCredits")} used={usage.ai} max={plan.aiCreditsPerMonth} />
        </div>
      </Card>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }} className="krok-plans">
        {PLAN_ORDER.map((key) => {
          const p = PLANS[key];
          const isCurrent = key === currentPlan;
          return (
            <div
              key={key}
              style={{
                border: p.highlight ? "2px solid var(--accent)" : "1px solid var(--line)",
                borderRadius: 14,
                padding: 18,
                background: "var(--surface)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {p.highlight && (
                <span style={{ position: "absolute", top: -11, left: 16, background: "var(--accent)", color: "var(--accent-ink)", fontSize: ".7rem", fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                  {t("plan.popular")}
                </span>
              )}
              <div>
                <div style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.25rem", fontWeight: 700 }}>{en ? p.nameEn : p.name}</div>
                <div style={{ color: "var(--accent)", fontWeight: 600, fontSize: "1rem" }}>{en ? p.priceLabelEn : p.priceLabel}</div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, fontSize: ".88rem", color: "var(--ink-2)" }}>
                <li>✓ {t("plan.forms")}: <b>{fmtLimit(p.maxForms)}</b></li>
                <li>✓ {t("plan.aiCredits")}: <b>{fmtLimit(p.aiCreditsPerMonth)}</b>/{t("plan.perMonth")}</li>
                <li>✓ {t("plan.members")}: <b>{fmtLimit(p.maxMembers)}</b></li>
                <li>✓ Workspace: <b>{fmtLimit(p.maxWorkspaces)}</b></li>
              </ul>
              <div style={{ marginTop: "auto" }}>
                {isCurrent ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".88rem", fontWeight: 600 }}>{t("plan.currentBadge")}</div>
                ) : isOwner ? (
                  <Button variant={p.highlight ? "primary" : "default"} onClick={() => choose(key)} disabled={!!busy} style={{ width: "100%" }}>
                    {busy === key ? "…" : t("plan.select")}
                  </Button>
                ) : (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".8rem" }}>{t("plan.ownerOnly")}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ color: "var(--ink-3)", fontSize: ".8rem", textAlign: "center" }}>{t("plan.noPayment")}</p>

      <style>{`@media(max-width:700px){.krok-plans{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max >= 999999;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const over = !unlimited && used >= max;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", marginBottom: 4 }}>
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        <span className="tabnum" style={{ fontWeight: 600, color: over ? "var(--fail)" : "var(--ink)" }}>
          {used} / {unlimited ? "∞" : max}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: unlimited ? "8%" : `${pct}%`, height: "100%", background: over ? "var(--fail)" : "var(--accent)", borderRadius: 6, transition: "width .3s" }} />
      </div>
    </div>
  );
}
