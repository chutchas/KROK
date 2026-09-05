"use client";
import Link from "next/link";
import { Card, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { ReceiptText, ArrowRightLeft, FileText } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { getPlan } from "@/lib/plans";

export interface PlanEvent { id: string; plan: string; at: string }
export interface InvoiceRow {
  id: string;
  number: string;
  plan: string;
  amount: number;
  currency: string;
  period: string;
  status: "demo" | "pending" | "paid" | "void" | "failed";
  issuedAt: string;
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function HistoryClient({ events, invoices }: { events: PlanEvent[]; invoices: InvoiceRow[] }) {
  const { t, lang } = useT();
  const stLabel = (s: InvoiceRow["status"]) =>
    s === "paid" ? t("bill.stPaid") : s === "pending" ? t("bill.stPending") : s === "void" ? t("bill.stVoid") : s === "failed" ? t("bill.stFailed") : t("bill.stDemo");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("bill.histTitle")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("bill.histSub")}</p>
      </div>

      {/* ใบแจ้งหนี้ */}
      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ReceiptText} className="h-[18px] w-[18px]" /> {t("bill.invoices")}
        </h2>
        {invoices.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: ".9rem" }}>{t("bill.noInvoices")}</p>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {invoices.map((iv) => {
              const p = getPlan(iv.plan);
              return (
                <Link key={iv.id} href={`/settings/billing/invoice/${iv.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "var(--ink)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon={FileText} className="h-[18px] w-[18px]" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: ".9rem" }}>{iv.number}</b>{" "}
                    {iv.status === "paid" ? <Pill kind="pass">{stLabel(iv.status)}</Pill> : iv.status === "failed" || iv.status === "void" ? <Pill kind="fail">{stLabel(iv.status)}</Pill> : <Pill kind="na">{stLabel(iv.status)}</Pill>}
                    <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>
                      {lang === "en" ? p.nameEn : p.name} · {iv.period} · {fmt(iv.issuedAt)}
                    </small>
                  </div>
                  <span className="tabnum" style={{ fontWeight: 600 }}>฿{iv.amount.toLocaleString()}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* บันทึกการเปลี่ยนแผน */}
      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ArrowRightLeft} className="h-[18px] w-[18px]" /> {t("bill.planLog")}
        </h2>
        {events.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: ".9rem" }}>{t("bill.histEmpty")}</p>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {events.map((e) => {
              const p = getPlan(e.plan);
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: ".9rem" }}>{t("bill.histChanged")} {lang === "en" ? p.nameEn : p.name}</b>
                    <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{fmt(e.at)}</small>
                  </div>
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
