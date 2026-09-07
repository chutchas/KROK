"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { Settings, Bot, CreditCard, Package } from "lucide-react";
import AdminAiClient, { type AiSettings } from "../ai/AdminAiClient";
import PaymentClient from "./PaymentClient";
import PlanClient from "./PlanClient";
import type { ProviderClientView, PaymentProviderId } from "@/lib/payment-meta";
import type { Plan, PlanKey } from "@/lib/plans";

type Tab = "ai" | "payment" | "plans";

export default function SystemSettingsClient({
  ai,
  aiConfigured,
  payViews,
  payConfigured,
  plans,
  plansConfigured,
}: {
  ai: AiSettings;
  aiConfigured: boolean;
  payViews: Record<PaymentProviderId, ProviderClientView>;
  payConfigured: boolean;
  plans: Record<PlanKey, Plan>;
  plansConfigured: boolean;
}) {
  const [tab, setTab] = useState<Tab>("ai");

  const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: "ai", label: "ตั้งค่า AI", icon: Bot },
    { id: "payment", label: "การชำระเงิน", icon: CreditCard },
    { id: "plans", label: "แผน & ราคา", icon: Package },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Settings} className="h-5 w-5" /> ตั้งค่าระบบ
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          ตั้งค่าระดับแพลตฟอร์ม — เฉพาะ Platform Admin / Developer มีผลกับทุก workspace
        </p>
      </div>

      {/* แท็บ */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", cursor: "pointer",
                fontFamily: "inherit", fontSize: ".92rem", fontWeight: on ? 700 : 500, whiteSpace: "nowrap",
                color: on ? "var(--accent)" : "var(--ink-2)", background: "transparent", border: "none",
                borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
              }}
            >
              <Icon icon={tb.icon} className="h-4 w-4" /> {tb.label}
            </button>
          );
        })}
      </div>

      <div hidden={tab !== "ai"}>
        <AdminAiClient current={ai} configured={aiConfigured} embedded />
      </div>
      <div hidden={tab !== "payment"}>
        <PaymentClient views={payViews} configured={payConfigured} />
      </div>
      <div hidden={tab !== "plans"}>
        <PlanClient plans={plans} configured={plansConfigured} />
      </div>
    </div>
  );
}
