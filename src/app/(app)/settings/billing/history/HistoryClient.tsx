"use client";
import { Card, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { ReceiptText, ArrowRightLeft } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { getPlan } from "@/lib/plans";

export interface PlanEvent {
  id: string;
  plan: string;
  at: string;
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function HistoryClient({ events }: { events: PlanEvent[] }) {
  const { t, lang } = useT();
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("bill.histTitle")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("bill.histSub")}</p>
      </div>

      <Card>
        {events.length === 0 ? (
          <span style={{ color: "var(--ink-3)", fontSize: ".9rem" }}>{t("bill.histEmpty")}</span>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {events.map((e) => {
              const p = getPlan(e.plan);
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon={ArrowRightLeft} className="h-[18px] w-[18px]" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: ".92rem" }}>{t("bill.histChanged")} {lang === "en" ? p.nameEn : p.name}</b>
                    <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{fmt(e.at)}</small>
                  </div>
                  <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{lang === "en" ? p.priceLabelEn : p.priceLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Notice>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ReceiptText} className="h-4 w-4" /> {t("bill.invoiceNote")}
        </span>
      </Notice>
    </div>
  );
}
