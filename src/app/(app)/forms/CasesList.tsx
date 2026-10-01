"use client";
// แท็บ "งานรอฉัน" — งานของฟอร์มกรอกหลายคน: ที่ฉันถืออยู่ / รอทีมฉันกดรับ / ที่ฉันเคยทำ (ติดตามสถานะ)
import FormIcon from "@/components/FormIcon";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { ClipboardList, CornerUpLeft, Users, ArrowRight, Eye, Hourglass, Search as SearchIcon, SearchX } from "lucide-react";
import { Field } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { claimCaseAction } from "@/app/(app)/fill/[formId]/case-actions";

export interface CaseListItem {
  id: string;
  formId: string;
  formTitle: string;
  formIcon: string;
  title: string;
  stepIdx: number;
  steps: number;
  stepTitle: string;
  teamName: string | null;
  holderName: string | null;
  kind: "mine" | "pool" | "watch";
  returned: { name: string; note: string } | null;
  updatedAt: string;
  /** เวลาที่งานมาถึงสถานะปัจจุบัน (ใช้คำนวณ "รอมาแล้ว") */
  waitingSince: string;
}

function fmtWhen(s: string, lang: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

/** ระยะเวลารอแบบสั้น: นาที / ชม. / วัน */
export function waitMinutes(since: string, now: number): number {
  const t = new Date(since).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}

export default function CasesList({ cases }: { cases: CaseListItem[] }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  // รอนานสุดขึ้นก่อน (ค่าเริ่มต้น) หรือกลับด้าน · ค้นจากชื่อฟอร์ม/ชื่องาน/เลขงาน/ขั้นตอน
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? cases.filter((c) => [c.formTitle, c.title, c.id.slice(0, 8), c.stepTitle, c.teamName || "", c.holderName || ""].join(" ").toLowerCase().includes(n)) : cases;
    const ts = (c: CaseListItem) => new Date(c.waitingSince).getTime() || 0;
    return [...list].sort((a, b) => (sort === "oldest" ? ts(a) - ts(b) : ts(b) - ts(a)));
  }, [cases, q, sort]);
  const waitLabel = (m: number) => (m < 60 ? tt("wf.waitMin", { n: m }) : m < 1440 ? tt("wf.waitHr", { n: Math.floor(m / 60) }) : tt("wf.waitDay", { n: Math.floor(m / 1440) }));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; msg: string } | null>(null);
  // ลิงก์ที่หน้าตาเป็นปุ่ม (ไม่ซ้อน <button> ใน <a>)
  const linkBtn = (primary: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40, padding: "8px 14px", borderRadius: 8, fontSize: ".85rem", fontWeight: 600,
    textDecoration: "none", border: `1px solid ${primary ? "var(--accent)" : "var(--line)"}`,
    background: primary ? "var(--accent)" : "var(--surface)", color: primary ? "#fff" : "var(--ink)",
  });

  async function claim(c: CaseListItem) {
    setBusy(c.id);
    setErr(null);
    const r = await claimCaseAction(c.id).catch(() => ({ error: t("wf.netError") }));
    setBusy(null);
    if ("error" in r) { setErr({ id: c.id, msg: r.error }); router.refresh(); return; }
    router.push(`/fill/${c.formId}?case=${c.id}`);
  }

  if (cases.length === 0)
    return <Card><EmptyState icon={<Icon icon={ClipboardList} className="h-7 w-7" />} title={t("wf.tasksEmpty")} hint={t("wf.tasksEmptyHint")} /></Card>;

  const groups: { k: CaseListItem["kind"]; label: string }[] = [
    { k: "mine", label: t("wf.groupMine") },
    { k: "pool", label: t("wf.groupPool") },
    { k: "watch", label: t("wf.groupWatch") },
  ];

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
          <Field type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("wf.searchPh")} aria-label={t("wf.searchPh")} style={{ width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "oldest" | "newest")} aria-label={t("list.sortBy")} className="krok-listsort"
          style={{ padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", flex: "0 0 auto" }}>
          <option value="oldest">{t("wf.sortOldest")}</option>
          <option value="newest">{t("wf.sortNewest")}</option>
        </select>
      </div>
      {shown.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: ".9rem", padding: "20px 0" }}>
          <span style={{ display: "inline-flex" }}><Icon icon={SearchX} className="h-6 w-6" /></span>
          <p style={{ margin: "6px 0 0" }}>{t("list.noMatch")}</p>
        </div>
      )}
      {groups.map((g) => {
        const items = shown.filter((c) => c.kind === g.k);
        if (!items.length) return null;
        return (
          <section key={g.k}>
            <h3 style={{ fontSize: ".85rem", color: "var(--ink-2)", margin: "0 0 8px", fontWeight: 600 }}>{g.label} ({items.length})</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, border: c.returned ? "1px solid #d97706" : "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--surface)", flexWrap: "wrap" }}>
                  <FormIcon value={c.formIcon} size={44} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <b style={{ fontFamily: "var(--font-anuphan)" }}>{c.formTitle}</b>
                    <span style={{ fontFamily: "monospace", fontSize: ".72rem", color: "var(--ink-3)", marginLeft: 8 }}>#{c.id.slice(0, 8).toUpperCase()}</span>
                    {c.title && <div style={{ fontSize: ".85rem", color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>}
                    <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", color: "var(--ink-2)" }}>
                        {t("wf.stepOf").replace("{n}", String(c.stepIdx + 1)).replace("{total}", String(c.steps))} · {c.stepTitle}
                      </span>
                      {c.kind !== "mine" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Icon icon={Users} className="h-3 w-3" />
                          {c.holderName ? t("wf.heldBy").replace("{name}", c.holderName) : t("wf.waitingTeam").replace("{team}", c.teamName ? `${t("wf.team")} ${c.teamName}` : t("wf.admins"))}
                        </span>
                      )}
                      {(() => {
                        // รอเกิน 1 วัน = สีส้ม, เกิน 3 วัน = สีแดง
                        const m = waitMinutes(c.waitingSince, now);
                        const color = m >= 4320 ? "var(--fail)" : m >= 1440 ? "#d97706" : "var(--ink-3)";
                        return (
                          <span title={fmtWhen(c.waitingSince, lang)} style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontWeight: m >= 1440 ? 600 : 400 }}>
                            <Icon icon={Hourglass} className="h-3 w-3" /> {waitLabel(m)}
                          </span>
                        );
                      })()}
                    </div>
                    {err?.id === c.id && <div role="alert" style={{ fontSize: ".8rem", color: "var(--fail)", marginTop: 4 }}>⚠ {err.msg}</div>}
                    {c.returned && (
                      <div style={{ fontSize: ".8rem", color: "#d97706", marginTop: 4, display: "flex", gap: 4, alignItems: "flex-start" }}>
                        <Icon icon={CornerUpLeft} className="h-3.5 w-3.5" />
                        <span>{t("wf.returnedBy").replace("{name}", c.returned.name)}: {c.returned.note}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {c.kind === "pool" ? (
                      <>
                        <Link href={`/fill/${c.formId}?case=${c.id}`} aria-label={t("wf.view")} title={t("wf.view")} style={{ ...linkBtn(false), padding: "8px 12px" }}>
                          <Icon icon={Eye} className="h-4 w-4" />
                        </Link>
                        <Button variant="primary" onClick={() => claim(c)} loading={busy === c.id} style={{ fontSize: ".85rem", padding: "8px 14px" }}>{t("wf.claim")}</Button>
                      </>
                    ) : (
                      <Link href={`/fill/${c.formId}?case=${c.id}`} style={linkBtn(c.kind === "mine")}>
                          {c.kind === "mine" ? t("wf.continue") : t("wf.view")} <Icon icon={ArrowRight} className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
