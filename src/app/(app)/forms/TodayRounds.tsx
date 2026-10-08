"use client";
import Link from "next/link";
import FormIcon from "@/components/FormIcon";
import Icon from "@/components/Icon";
import { Card, EmptyState } from "@/components/ui";
import { ArrowRight, CalendarCheck2, CheckCircle2, Clock, AlertTriangle, CircleDashed, XCircle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { RoundStatus } from "@/lib/schedule";

export interface TodayRoundItem {
  formId: string;
  title: string;
  icon: string;
  time: string;
  open: string;
  due: string;
  status: RoundStatus;
  mode: "once" | "each";
  mine: boolean;
  expected: number;
  doneUsers: number;
  doneBy: { name: string; at: string; late: boolean }[];
  missingNames: string[];
  carried: boolean;
}

const STYLE: Record<RoundStatus, { color: string; bg: string; icon: typeof Clock }> = {
  overdue: { color: "var(--fail)", bg: "var(--fail-soft)", icon: AlertTriangle },
  open: { color: "var(--warn)", bg: "var(--warn-soft)", icon: Clock },
  upcoming: { color: "var(--ink-3)", bg: "var(--code-bg)", icon: CircleDashed },
  done: { color: "var(--pass)", bg: "var(--pass-soft)", icon: CheckCircle2 },
  late: { color: "var(--warn)", bg: "var(--code-bg)", icon: CheckCircle2 },
  missed: { color: "var(--fail)", bg: "var(--code-bg)", icon: XCircle },
};

/** งานที่ต้องทำ (นับบนแท็บ): รอบที่เปิดแล้วและยังไม่เสร็จ ที่ฉันรับผิดชอบ */
export const actionable = (r: TodayRoundItem) => r.mine && (r.status === "open" || r.status === "overdue");

export default function TodayRounds({ rounds, manager }: { rounds: TodayRoundItem[]; manager: boolean }) {
  const { t, tt, lang } = useT();
  const hm = (iso: string) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  if (!rounds.length)
    return <Card><EmptyState icon={<Icon icon={CalendarCheck2} className="h-7 w-7" />} title={t("today.empty")} hint={manager ? t("today.emptyHintManager") : t("today.emptyHint")} /></Card>;

  const count = (s: RoundStatus[]) => rounds.filter((r) => s.includes(r.status)).length;
  const summary: { k: string; n: number; color: string }[] = [
    { k: t("today.sumOpen"), n: count(["open"]), color: "var(--warn)" },
    { k: t("today.sumOverdue"), n: count(["overdue"]), color: "var(--fail)" },
    { k: t("today.sumDone"), n: count(["done", "late"]), color: "var(--pass)" },
    { k: t("today.sumUpcoming"), n: count(["upcoming"]), color: "var(--ink-3)" },
  ];

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {summary.map((s) => (
          <div key={s.k} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", minWidth: 0, background: "var(--surface)" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: s.color, fontFamily: "var(--font-anuphan)" }}>{s.n}</div>
            <div style={{ fontSize: ".76rem", color: "var(--ink-3)", lineHeight: 1.3 }}>{s.k}</div>
          </div>
        ))}
      </div>

      {rounds.map((r) => {
        const st = STYLE[r.status];
        const canFill = r.mine && r.status !== "done" && r.status !== "late" && r.status !== "missed";
        return (
          <div key={`${r.formId}-${r.open}`} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: `1px solid ${r.status === "overdue" ? "var(--fail)" : "var(--line)"}`, borderRadius: 12, padding: 14, background: "var(--surface)" }}>
            <FormIcon value={r.icon} size={42} />
            <div style={{ flex: 1, minWidth: 190 }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{r.title}</b>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".76rem", fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: st.color, background: st.bg }}>
                  <Icon icon={st.icon} className="h-3.5 w-3.5" /> {t(`today.st.${r.status}`)}
                </span>
                <small style={{ color: "var(--ink-2)", fontSize: ".8rem" }}>
                  {r.carried && <span style={{ color: "var(--fail)" }}>{t("today.yesterday")} · </span>}
                  {tt("today.window", { open: hm(r.open), due: hm(r.due) })}
                </small>
                {r.mode === "each" && (
                  <small style={{ color: "var(--ink-3)", fontSize: ".78rem" }}>{tt("today.progress", { n: r.doneUsers, total: r.expected })}</small>
                )}
              </div>
              {r.doneBy.length > 0 && (
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 3 }}>
                  {t("today.doneBy")} {r.doneBy.slice(0, 4).map((d) => `${d.name} ${hm(d.at)}${d.late ? ` (${t("today.lateShort")})` : ""}`).join(", ")}
                  {r.doneBy.length > 4 && ` +${r.doneBy.length - 4}`}
                </small>
              )}
              {manager && r.mode === "each" && r.missingNames.length > 0 && r.status !== "upcoming" && (
                <small style={{ display: "block", color: r.status === "overdue" || r.status === "missed" ? "var(--fail)" : "var(--ink-3)", fontSize: ".76rem", marginTop: 2 }}>
                  {t("today.missing")} {r.missingNames.slice(0, 6).join(", ")}{r.missingNames.length > 6 && ` +${r.missingNames.length - 6}`}
                </small>
              )}
            </div>
            {canFill && (
              <Link href={`/fill/${r.formId}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, padding: "8px 14px", borderRadius: 8, fontSize: ".88rem", fontWeight: 600, textDecoration: "none", background: r.status === "upcoming" ? "var(--surface)" : "var(--accent)", border: "1px solid var(--accent)", color: r.status === "upcoming" ? "var(--accent-text)" : "#fff" }}>
                {t("today.fill")} <Icon icon={ArrowRight} className="h-4 w-4" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
