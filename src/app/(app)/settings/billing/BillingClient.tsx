"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Check, Lock, CreditCard, Minus, Sparkles } from "lucide-react";
import { usePayT as useT } from "@/i18n/ns/pay";
import { DEFAULT_PLANS, UNLIMITED, planFeatures, type PlanKey, type Plan } from "@/lib/plans";
import { AI_PURPOSES, PURPOSE_LABELS, PURPOSE_LABELS_EN, type AiPurpose } from "@/lib/ai-purpose";
import { setPlan, invoiceStatus, cancelPlanChange } from "./actions";
import { confirmDialog } from "@/components/dialogs";
import PurchaseDialog from "./PurchaseDialog";
import SubscriptionCard, { type SubscriptionInfo } from "./SubscriptionCard";
import { useEffect, useSyncExternalStore } from "react";

export default function BillingClient({
  view = "quota",
  pendingChange = null,
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
  /** แท็บ: แผนปัจจุบัน/โควตา · แพ็กเกจ (เลือกซื้อ) */
  view?: "quota" | "plans";
  /** ลดแพ็กเกจที่ตั้งเวลาไว้ — เปลี่ยนเมื่อหมดรอบ (0070) */
  pendingChange?: { key: string; name: string; nameEn: string; at: string } | null;
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

  // แพ็กเกจเสียเงิน → เปิดหน้ายืนยัน (ยอด + ความยินยอมต่ออายุอัตโนมัติ) ก่อนไปหน้าชำระ
  const [buying, setBuying] = useState<Plan | null>(null);
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(en ? "en-GB" : "th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
  async function choose(p: PlanKey) {
    const target = plans.find((x) => x.key === p) ?? (plan.key === p ? plan : null);
    if (target && target.priceThb > 0) { setBuying(target); return; }
    // ลดเป็นแพ็กเกจฟรีระหว่างรอบที่จ่ายแล้ว = ตั้งเวลาเปลี่ยนเมื่อหมดรอบ → บอกให้ชัดก่อน
    if (target && plan.priceThb > 0 && expiresAt && (daysLeft ?? 0) > 0) {
      const ok = await confirmDialog({ message: tt("plan.downgradeConfirm", { to: en ? target.nameEn : target.name, cur: en ? plan.nameEn : plan.name, date: fmtDay(expiresAt) }) });
      if (!ok) return;
    }
    void doChoose(p);
  }

  async function doChoose(p: PlanKey, autoRenew?: boolean) {
    setBusy(p);
    setMsg(null);
    const res = await setPlan(p, { autoRenew });
    if ("checkoutUrl" in res) { window.location.assign(res.checkoutUrl); return; } // ไปหน้าชำระของ Gateway
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setMsg({ t: "scheduledAt" in res && res.scheduledAt ? tt("plan.scheduled", { date: fmtDay(res.scheduledAt) }) : t("plan.changed") });
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

  // getSnapshot ต้องคืนค่าเดิมทุกครั้ง — คืน Date.now() ใหม่ทุก render ทำให้ React วน render ไม่จบ (error #185)
  const mounted = useSyncExternalStore(noopSub, () => true, () => false);
  const [loadedAt] = useState(() => Date.now());
  const now = mounted ? loadedAt : 0;
  const daysLeft = expiresAt && now ? Math.ceil((new Date(expiresAt).getTime() - now) / 86400_000) : null;

  // โควตา: ที่มีเพดาน = แถบ (กริด) · ไม่จำกัด = รวมบรรทัดเดียว · แพ็กเกจไม่รวม (0) = ไม่แสดง
  type Row = { label: string; used: number; max: number; unit?: string };
  const rows: Row[] = [
    { label: t("plan.forms"), used: usage.forms, max: plan.maxForms },
    { label: t("plan.members"), used: usage.members, max: plan.maxMembers },
    { label: t("plan.submissions"), used: usage.submissions ?? -1, max: plan.maxSubmissionsMonth },
    { label: t("plan.storage"), used: usage.storageMb ?? -1, max: plan.storageMb, unit: "MB" },
    { label: t("plan.datasets"), used: usage.datasets ?? -1, max: plan.maxDatasets },
    { label: "Webhook", used: usage.webhooks ?? -1, max: plan.maxWebhooks },
    { label: t("plan.intake"), used: usage.intakeForms ?? -1, max: plan.maxIntakeForms },
    { label: t("plan.devices"), used: usage.devices ?? -1, max: plan.maxDevices },
  ].filter((r) => r.used >= 0 && r.max > 0);
  const aiRows: Row[] = AI_PURPOSES.map((p) => ({ label: en ? PURPOSE_LABELS_EN[p] : PURPOSE_LABELS[p], used: usage.ai[p] ?? 0, max: plan.aiCredits[p] ?? 0 })).filter((r) => r.max > 0);
  const limited = (list: Row[]) => list.filter((r) => r.max < UNLIMITED);
  const unlimited = [...rows, ...aiRows].filter((r) => r.max >= UNLIMITED);

  const head = (title: string) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{title}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {tenantName} · {t("plan.current")}: <b style={{ color: "var(--accent-text)" }}>{en ? plan.nameEn : plan.name}</b>
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "2px 0 0" }}>
          {isOwner ? tt("plan.accountOwn", { n: workspaces }) : tt("plan.accountOther", { name: ownerName || t("plan.ownerFallback"), n: workspaces })}
        </p>
      </div>
      {view === "quota" && (
        <Link href="/settings/billing/plans" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 8, padding: "9px 16px", fontSize: ".88rem", fontWeight: 600, textDecoration: "none" }}>
          <Icon icon={Sparkles} className="h-4 w-4" /> {t("plan.seePlans")}
        </Link>
      )}
    </div>
  );

  const notices = (<>
    {payState && (
      <Notice kind={payState === "failed" ? "error" : "info"}>
        {payState === "waiting" ? t("pay.waiting") : payState === "paid" ? t("pay.paid") : payState === "failed" ? t("pay.failed") : t("pay.timeout")}
      </Notice>
    )}
    {pendingInvoice && !payState && isOwner && (
      <Notice>
        <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {tt("pay.pending", { plan: plans.find((p) => p.key === pendingInvoice.plan)?.name ?? pendingInvoice.plan, amount: pendingInvoice.amount.toLocaleString() })}
          <a href={pendingInvoice.url} style={{ color: "var(--accent-text)", fontWeight: 600 }}>{t("pay.continue")}</a>
        </span>
      </Notice>
    )}
    {pendingChange && (
      <Notice>
        <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {tt("plan.pending", { to: en ? pendingChange.nameEn : pendingChange.name, date: fmtDay(pendingChange.at), cur: en ? plan.nameEn : plan.name })}
          {isOwner && (
            <button type="button" onClick={async () => { const r = await cancelPlanChange(); if ("error" in r) setMsg({ t: r.error, err: true }); else { setMsg({ t: t("plan.pendingCancelled") }); router.refresh(); } }}
              style={{ border: "none", background: "none", padding: 0, color: "var(--accent-text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>
              {t("plan.pendingCancel")}
            </button>
          )}
        </span>
      </Notice>
    )}
    {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
  </>);

  if (view === "quota") return (
    <div style={{ display: "grid", gap: 16 }}>
      {head(t("plan.titleQuota"))}
      {notices}
      {cardReturn && <Notice>{t("sub.cardReturn")}</Notice>}
      {daysLeft !== null && expiresAt && plan.priceThb > 0 && (
        <SubscriptionCard plan={plan} expiresAt={expiresAt} daysLeft={daysLeft} sub={subscription} isOwner={isOwner} payable={payable}
          onRenew={() => void choose(plan.key)} renewBusy={busy === plan.key} />
      )}
      {buying && (
        <PurchaseDialog plan={buying} renewing={buying.key === plan.key} busy={busy === buying.key}
          onClose={() => setBuying(null)} onConfirm={(auto) => void doChoose(buying.key, auto)} />
      )}
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{t("plan.usage")}</h2>
          <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>{t("plan.period")}: {usage.period}</span>
        </div>
        <div className="krok-usage-grid">
          {limited(rows).map((r) => <UsageBar key={r.label} {...r} />)}
        </div>
        {limited(aiRows).length > 0 && (<>
          <div style={{ fontWeight: 600, fontSize: ".92rem", marginTop: 18 }}>{t("plan.aiCredits")}</div>
          <p style={{ color: "var(--ink-3)", fontSize: ".76rem", margin: "2px 0 0" }}>
            {en
              ? "Each task has its own monthly allowance — running out on one does not block the others. Barcode / QR scanning is free."
              : "แต่ละงานมีโควตาของตัวเอง — หมดถังหนึ่งไม่กระทบอีกถัง · การสแกนบาร์โค้ด/QR ไม่ใช้เครดิต"}
          </p>
          <div className="krok-usage-grid">
            {limited(aiRows).map((r) => <UsageBar key={r.label} {...r} />)}
          </div>
        </>)}
        {unlimited.length > 0 && (
          <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: ".84rem", color: "var(--ink-2)", lineHeight: 1.7 }}>
            <b>{t("plan.unlimited")}:</b>{" "}
            {unlimited.map((r, i) => <span key={r.label} style={{ whiteSpace: "nowrap" }}>{i > 0 && " · "}{r.label} <span className="tabnum" style={{ color: "var(--ink-3)" }}>({r.used.toLocaleString("en-US")}{r.unit ? ` ${r.unit}` : ""})</span></span>)}
          </p>
        )}
      </Card>
      <style>{`
        .krok-usage-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 24px;margin-top:12px}
        @media(max-width:900px){.krok-usage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.krok-usage-grid{grid-template-columns:minmax(0,1fr)}}
      `}</style>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {head(t("plan.titlePlans"))}
      {notices}
      {buying && (
        <PurchaseDialog plan={buying} renewing={buying.key === plan.key} busy={busy === buying.key}
          onClose={() => setBuying(null)} onConfirm={(auto) => void doChoose(buying.key, auto)} />
      )}
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
                <div style={{ color: "var(--accent-text)", fontWeight: 600, fontSize: "1rem", marginTop: 2 }}>{en ? p.priceLabelEn : p.priceLabel}</div>
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
                {pendingChange?.key === key ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--accent-text)", fontSize: ".84rem", fontWeight: 600 }}>{tt("plan.pendingBadge", { date: fmtDay(pendingChange.at) })}</div>
                ) : isCurrent ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".88rem", fontWeight: 600 }}>{t("plan.currentBadge")}</div>
                ) : !isOwner ? (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--ink-3)", fontSize: ".8rem" }}>{t("plan.billingOwnerOnly")}</div>
                ) : p.priceThb > 0 && !payable ? (
                  <Button variant="default" disabled style={{ width: "100%", opacity: 0.7 }}>
                    <Icon icon={Lock} className="h-4 w-4" /> {t("plan.locked")}
                  </Button>
                ) : (
                  <Button variant={p.highlight ? "primary" : "default"} onClick={() => void choose(key)} disabled={!!busy} loading={busy === key} style={{ width: "100%" }}>
                    {t("plan.select")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ช่องทางชำระเงิน: เปิดแล้ว = การ์ดรายการ · ยังไม่เปิด = บรรทัดเดียว */}
      {payMethods.length > 0 ? (
        <Card>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 2px", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={CreditCard} className="h-[18px] w-[18px]" /> {t("pay.title")}
          </h2>
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
        </Card>
      ) : (
        <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: 0, display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexWrap: "wrap", textAlign: "center" }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("pay.disabledNote")}
        </p>
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
