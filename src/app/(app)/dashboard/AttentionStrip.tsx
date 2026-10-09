"use client";
import { use, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import FormIcon from "@/components/FormIcon";
import Icon, { type IconType } from "@/components/Icon";
import { CircleX, CalendarClock, ClipboardCheck, CircleCheck, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { AttentionData } from "@/lib/dashboard-attention";

// แถบ "ต้องดูตอนนี้" — คำนวณฝั่ง server (loadAttention) แล้วส่ง promise มา · หน้าแสดงก่อน แถบนี้ตามมาทีหลัง

const timeOf = (iso: string, lang: string) => {
  try {
    return new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 12, marginBottom: 18 };

export default function AttentionStrip({ data }: { data: Promise<AttentionData> }) {
  const { t, tt, lang } = useT();
  const d = use(data);
  const { failedToday: failed, overdueRounds: rounds, approvals } = d;
  if (!failed && !rounds && !approvals) return null;

  const allClear = (failed?.count ?? 0) === 0 && (rounds?.count ?? 0) === 0 && (approvals?.count ?? 0) === 0;

  return (
    <section aria-labelledby="dash-attn-h" data-tour="dash-attention" style={{ marginBottom: 6 }}>
      <h2 id="dash-attn-h" style={{ fontSize: "1.1rem", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        {t("dash.attnTitle")}
        {allClear && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--pass)", fontSize: ".82rem", fontWeight: 500 }}>
            <Icon icon={CircleCheck} className="h-4 w-4" /> {t("dash.attnAllClear")}
          </span>
        )}
      </h2>
      <div style={GRID}>
        {failed && (
          <Tile icon={CircleX} tone="var(--fail)" label={t("dash.attnFailed")} count={failed.count} none={t("dash.attnNone")}>
            {failed.items.map((s) => (
              <Row key={s.id} href={`/submission/${s.id}`} icon={s.form_icon} title={s.form_title}
                sub={`${s.user_name || "—"} · ${timeOf(s.submitted_at, lang)}${s.fails ? ` · ${tt("dash.failN", { n: s.fails })}` : ""}`} />
            ))}
            {failed.count > failed.items.length && <More text={tt("dash.attnMore", { n: failed.count - failed.items.length })} />}
          </Tile>
        )}
        {rounds && (
          <Tile icon={CalendarClock} tone="var(--warn)" label={t("dash.attnOverdue")} count={rounds.count} none={t("dash.attnNone")}
            footer={rounds.count > 0 ? { href: "/forms?tab=today", text: t("comp.todayLink") } : undefined}>
            {rounds.items.map((r, i) => (
              <Row key={`${r.formId}:${r.time}:${i}`} href={`/fill/${r.formId}`} icon={r.icon} title={r.title}
                sub={tt("dash.attnDue", { time: timeOf(r.due, lang) })} />
            ))}
            {rounds.count > rounds.items.length && <More text={tt("dash.attnMore", { n: rounds.count - rounds.items.length })} />}
          </Tile>
        )}
        {approvals && (
          <Tile icon={ClipboardCheck} tone="var(--accent-text)" label={t("dash.attnApprovals")} count={approvals.count} capped={approvals.capped} none={t("dash.attnNone")}
            footer={approvals.count > 0 ? { href: "/approvals", text: t("dash.attnOpenApprovals") } : undefined} />
        )}
      </div>
    </section>
  );
}

function Tile({ icon, tone, label, count, capped, none, footer, children }: {
  icon: IconType; tone: string; label: string; count: number; capped?: boolean; none: string;
  footer?: { href: string; text: string }; children?: ReactNode;
}) {
  const hot = count > 0;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderLeft: `3px solid ${hot ? tone : "var(--line)"}`, borderRadius: 12, padding: "12px 14px", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: hot ? tone : "var(--ink-3)", fontSize: ".82rem", fontWeight: 600 }}>
        <Icon icon={icon} className="h-4 w-4" /> {label}
      </div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.7rem", lineHeight: 1.2, margin: "4px 0 2px", color: hot ? "var(--ink)" : "var(--ink-3)" }}>
        {hot ? `${count.toLocaleString()}${capped ? "+" : ""}` : <span style={{ fontSize: ".95rem", fontWeight: 500 }}>{none}</span>}
      </div>
      {hot && children && <div style={{ display: "grid", marginTop: 4 }}>{children}</div>}
      {footer && (
        <Link href={footer.href} style={{ marginTop: "auto", paddingTop: 8, display: "inline-flex", alignItems: "center", gap: 2, fontSize: ".84rem", color: "var(--accent-text)", fontWeight: 600, minHeight: 32 }}>
          {footer.text} <Icon icon={ChevronRight} className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function Row({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line)", color: "inherit", textDecoration: "none", minHeight: 40 }}>
      <FormIcon value={icon} size={26} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: ".86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
        <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".74rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</small>
      </span>
    </Link>
  );
}

function More({ text }: { text: string }) {
  return <small style={{ color: "var(--ink-3)", fontSize: ".76rem", paddingTop: 6, borderTop: "1px solid var(--line)" }}>{text}</small>;
}

/** โครงระหว่างรอ (สูงใกล้ของจริง กันหน้ากระโดด) */
export function AttentionSkeleton() {
  return (
    <div aria-hidden style={{ ...GRID, marginTop: 34 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ height: 92, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)" }} />
      ))}
    </div>
  );
}
