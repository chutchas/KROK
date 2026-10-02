"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Check, Lock, CreditCard, Minus } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { DEFAULT_PLANS, UNLIMITED, planFeatures, type PlanKey, type Plan } from "@/lib/plans";
import { AI_PURPOSES, PURPOSE_LABELS, PURPOSE_LABELS_EN, type AiPurpose } from "@/lib/ai-purpose";
import { setPlan, invoiceStatus } from "./actions";
import PurchaseDialog from "./PurchaseDialog";
import SubscriptionCard, { type SubscriptionInfo } from "./SubscriptionCard";
import { useEffect, useSyncExternalStore } from "react";

export default function BillingClient({
  isOwner,
  ownerName,
  workspaces = 1,
  currentPlan,
  tenantName,
  usage,
  payMethods = [],
  plans = DEFAULT_PLANS,
  current,
  payable = false,
  expiresAt = null,
  pendingInvoice = null,
  returnInvoice = null,
  subscription = null,
  cardReturn = false,
}: {
  /** สถานะต่ออายุอัตโนมัติ (0047) */
  subscription?: SubscriptionInfo | null;
  /** กลับมาจากหน้าบันทึกบัตรของ Gateway */
  cardReturn?: boolean;
  /** เปิดรับชำระจริงแล้ว (Payment Gateway ตั้งค่าครบ + PAYMENTS_LIVE) */
  payable?: boolean;
  /** วันหมดอายุของแพ็กเกจปัจจุบัน (null = ไม่หมดอายุ) */
  expiresAt?: string | null;
  /** ใบแจ้งหนี้ที่ค้างจ่าย (ลิงก์ชำระยังใช้ได้) */
  pendingInvoice?: { id: string; plan: string; amount: number; url: string } | null;
  /** กลับมาจากหน้าชำระของ Gateway (?invoice=) → รอผลยืนยัน */
  returnInvoice?: string | null;
  isOwner: boolean;
  /** ชื่อเจ้าของบัญชี (แสดงเมื่อผู้ดูไม่ใช่เจ้าของ) */
  ownerName?: string | null;
  /** จำนวน workspace ที่ใช้แพ็กเกจ/โควตาร่วมกัน */
  workspaces?: number;
  currentPlan: PlanKey;
  tenantName: string;
  usage: {
    forms: number; members: number; ai: Record<AiPurpose, number>; period: string;
    submissions?: number; storageMb?: number; datasets?: number; webhooks?: number; intakeForms?: number; devices?: number;
  };
  payMethods?: { id: string; name: string; hint: string }[];
  /** แพ็กเกจที่ลูกค้าเลือกได้ (+ แพ็กเกจปัจจุบันแม้ถูกซ่อน) เรียงตามลำดับ */
  plans?: Plan[];
  /** แพ็กเกจที่ใช้อยู่ (ลิมิตจริง) */
  current?: Plan;
}) {
  const router = useRouter();
  const { t, tt, lang } = useT();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const plan = current ?? plans.find((p) => p.key === currentPlan) ?? plans[0];
  const en = lang === "en";
  const opt = (n: number | undefined, max: number, label: string, unit?: string) =>
    n === undefined || max <= 0 ? null : <UsageBar key={label} label={label} used={n} max={max} unit={unit} />;

  // แพ็กเกจเสียเงิน → เปิดหน้ายืนยัน (ยอด + ความยินยอมต่ออายุอัตโนมัติ) ก่อนไปหน้าชำระ
  const [buying, setBuying] = useState<Plan | null>(null);
  function choose(p: PlanKey) {
    const target = plans.find((x) => x.key === p) ?? (plan.key === p ? plan : null);
    if (target && target.priceThb > 0) { setBuying(target); return; }
    void doChoose(p);
  }

  async function doChoose(p: PlanKey, autoRenew?: boolean) {
    setBusy(p);
    setMsg(null);
    const res = await setPlan(p, { autoRenew });
    if ("checkoutUrl" in res) { window.location.href = res.checkoutUrl; return; } // ไปหน้าชำระของ Gateway
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setMsg({ t: t("plan.changed") });
      router.refresh();
    }
  }

  // กลับจากหน้าชำระ: ถามสถานะซ้ำทุก 3 วิ (สูงสุด ~2 นาที) จนกว่า Gateway จะแจ้งผล
  const [payState, setPayState] = useState<"waiting" | "paid" | "failed" | "timeout" | null>(returnInvoice ? "waiting" : null);
  useEffect(() => {
    if (!returnInvoice) return;
    let n = 0; let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await invoiceStatus(returnInvoice);
      const s = "status" in r ? r.status : "";
      if (s === "paid") { setPayState("paid"); router.refresh(); return; }
      if (s === "failed" || s === "void") { setPayState("failed"); return; }
      if (++n >= 40) { setPayState("timeout"); return; }
      setTimeout(tick, 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [returnInvoice, router]);

  const now = useSyncExternalStore(noopSub, () => Date.now(), () => 0);
  const daysLeft = expiresAt && now ? Math.ceil((new Date(expiresAt).getTime() - now) / 86400_000) : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("plan.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {tenantName} · {t("plan.current")}: <b style={{ color: "var(--accent)" }}>{en ? plan.nameEn : plan.name}</b>
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "2px 0 0" }}>
          {isOwner ? tt("plan.accountOwn", { n: workspaces }) : tt("plan.accountOther", { name: ownerName || t("plan.ownerFallback"), n: workspaces })}
        </p>
      </div>

      {payState && (
        <Notice kind={payState === "failed" ? "error" : "info"}>
          {payState === "waiting" ? t("pay.waiting") : payState === "paid" ? t("pay.paid") : payState === "failed" ? t("pay.failed") : t("pay.timeout")}
        </Notice>
      )}
      {pendingInvoice && !payState && isOwner && (
        <Notice>
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {tt("pay.pending", { plan: plans.find((p) => p.key === pendingInvoice.plan)?.name ?? pendingInvoice.plan, amount: pendingInvoice.amount.toLocaleString() })}
            <a href={pendingInvoice.url} style={{ color: "var(--accent)", fontWeight: 600 }}>{t("pay.continue")}</a>
          </span>
        </Notice>
      )}
      {cardReturn && <Notice>{t("sub.cardReturn")}</Notice>}
      {daysLeft !== null && expiresAt && plan.priceThb > 0 && (
        <SubscriptionCard plan={plan} expiresAt={expiresAt} daysLeft={daysLeft} sub={subscription} isOwner={isOwner} payable={payable}
          onRenew={() => choose(plan.key)} renewBusy={busy === plan.key} />
      )}
      {buying && (
        <PurchaseDialog plan={buying} renewing={buying.key === plan.key} busy={busy === buying.key}
          onClose={() => setBuying(null)} onConfirm={(auto) => void doChoose(buying.key, auto)} />
      )}

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 2 }}>{t("plan.usage")}</h2>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", marginTop: 0 }}>{t("plan.period")}: {usage.period}</p>
        <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
          <UsageBar label={t("plan.forms")} used={usage.forms} max={plan.maxForms} />
          <UsageBar label={t("plan.members")} used={usage.members} max={plan.maxMembers} />
          {opt(usage.submissions, plan.maxSubmissionsMonth, t("plan.submissions"))}
          {opt(usage.storageMb, plan.storageMb, t("plan.storage"), "MB")}
          {opt(usage.datasets, plan.maxDatasets, t("plan.datasets"))}
          {opt(usage.webhooks, plan.maxWebhooks, "Webhook")}
          {opt(usage.intakeForms, plan.maxIntakeForms, t("plan.intake"))}
          {opt(usage.devices, plan.maxDevices, t("plan.devices"))}
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600, fontSize: ".95rem" }}>{t("plan.aiCredits")}</div>
          <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "2px 0 12px" }}>
            {en
              ? "Each task has its own monthly allowance — running out on one does not block the others. Barcode / QR scanning is free and uses no credits."
              : "แต่ละงานมีโควตาของตัวเอง — หมดถังหนึ่งไม่กระทบอีกถัง · การสแกนบาร์โค้ด/QR ไม่ใช้เครดิต"}
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            {AI_PURPOSES.map((p) => (
              <UsageBar
                key={p}
                label={en ? PURPOSE_LABELS_EN[p] : PURPOSE_LABELS[p]}
                used={usage.ai[p] ?? 0}
                max={plan.aiCredits[p] ?? 0}
              />
            ))}
          </div>
        </div>
      </Card>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {plans.map((p) => {
          const key = p.key;
          const isCurrent = key === currentPlan;
          const desc = en ? p.descEn : p.desc;
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
                {desc && <div style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>{desc}</div>}
                <div style={{ color: "var(--accent)", fontWeight: 600, fontSize: "1rem", marginTop: 2 }}>{en ? p.priceLabelEn : p.priceLabel}</div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 7, fontSize: ".85rem", color: "var(--ink-2)" }}>
                {planFeatures(p, en).map((f, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, color: f.off ? "var(--ink-3)" : undefined, textDecoration: f.off ? "line-through" : undefined }}>
                    <span style={{ marginTop: 2, display: "inline-flex", flexShrink: 0, color: f.off ? "var(--ink-3)" : "var(--pass)" }}><Icon icon={f.off ? Minus : Check} className="h-4 w-4" /></span>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: "auto" }}>
                {isCurrent ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".88rem", fontWeight: 600 }}>{t("plan.currentBadge")}</div>
                ) : !isOwner ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".8rem" }}>{t("plan.billingOwnerOnly")}</div>
                ) : p.priceThb > 0 && !payable ? (
                  <Button variant="default" disabled style={{ width: "100%", opacity: 0.7 }}>
                    <Icon icon={Lock} className="h-4 w-4" /> {t("plan.locked")}
                  </Button>
                ) : (
                  <Button variant={p.highlight ? "primary" : "default"} onClick={() => choose(key)} disabled={!!busy} loading={busy === key} style={{ width: "100%" }}>
                    {t("plan.select")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ช่องทางชำระเงินที่รองรับ (มาจากที่แพลตฟอร์มเปิดใช้งาน) */}
      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={CreditCard} className="h-[18px] w-[18px]" /> {t("pay.title")}
          {payMethods.length === 0 && (
            <span style={{ fontSize: ".68rem", fontWeight: 700, color: "var(--amber)", border: "1px solid var(--line)", borderRadius: 20, padding: "2px 8px" }}>{t("pay.soon")}</span>
          )}
        </h2>
        {payMethods.length > 0 ? (
          <>
            <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>{t("pay.available")}</p>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {payMethods.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--surface)" }}>
                  <Icon icon={Check} className="h-4 w-4" />
                  <span style={{ flex: 1 }}>
                    <b style={{ fontSize: ".9rem" }}>{m.name}</b>
                    <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{m.hint}</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>{t("pay.sub")}</p>
            <Notice><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon icon={Lock} className="h-4 w-4" /> {t("pay.disabledNote")}</span></Notice>
          </>
        )}
      </Card>

      {payMethods.length === 0 && (
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", textAlign: "center" }}>{t("plan.noPayment")}</p>
      )}

    </div>
  );
}

function UsageBar({ label, used, max, unit }: { label: string; used: number; max: number; unit?: string }) {
  const unlimited = max >= UNLIMITED;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const over = !unlimited && used >= max;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", marginBottom: 4 }}>
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        <span className="tabnum" style={{ fontWeight: 600, color: over ? "var(--fail)" : "var(--ink)" }}>
          {used.toLocaleString("en-US")} / {unlimited ? "∞" : max.toLocaleString("en-US")}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: unlimited ? "8%" : `${pct}%`, height: "100%", background: over ? "var(--fail)" : "var(--accent)", borderRadius: 6, transition: "width .3s" }} />
      </div>
    </div>
  );
}

const noopSub = () => () => {};
