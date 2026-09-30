"use client";
// แท็บ "งานรอฉัน" — งานของฟอร์มกรอกหลายคน: ที่ฉันถืออยู่ / รอทีมฉันกดรับ / ที่ฉันเคยทำ (ติดตามสถานะ)
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { ClipboardList, CornerUpLeft, Users, ArrowRight, Eye } from "lucide-react";
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
}

function fmtWhen(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function CasesList({ cases }: { cases: CaseListItem[] }) {
  const { t } = useT();
  const router = useRouter();
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
      {groups.map((g) => {
        const items = cases.filter((c) => c.kind === g.k);
        if (!items.length) return null;
        return (
          <section key={g.k}>
            <h3 style={{ fontSize: ".85rem", color: "var(--ink-2)", margin: "0 0 8px", fontWeight: 600 }}>{g.label} ({items.length})</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, border: c.returned ? "1px solid #d97706" : "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--surface)", flexWrap: "wrap" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flex: "0 0 auto" }}>{c.formIcon}</div>
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
                      <span>· {fmtWhen(c.updatedAt)}</span>
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
