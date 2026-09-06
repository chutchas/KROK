"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, TextArea } from "@/components/ui";
import Icon from "@/components/Icon";
import { PartyPopper, Check, X, Play, ArrowRight, Paperclip } from "lucide-react";
import { reviewSubmission } from "./actions";
import { useT } from "@/i18n/LanguageProvider";

import type { ApprovalStep } from "@/lib/approval";

export interface PendingSub {
  id: string;
  form_title: string;
  form_icon: string;
  user_name: string;
  result: "pass" | "fail";
  fails: string[];
  answers: { label: string; display?: string; note?: string; fail?: boolean; type: string }[];
  submitted_at: string;
  approval_step: number;
  approval_chain: ApprovalStep[] | unknown[];
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ApprovalsClient({ initial, isOwner }: { initial: PendingSub[]; myId: string; isOwner: boolean }) {
  const { t, tt } = useT();
  const router = useRouter();
  const [subs, setSubs] = useState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, decision: "approved" | "rejected") {
    if (decision === "rejected" && !notes[id]?.trim()) {
      alert("การตีกลับต้องระบุเหตุผล");
      return;
    }
    setBusy(id + decision);
    const res = await reviewSubmission(id, decision, notes[id] || "");
    setBusy(null);
    if ("error" in res) {
      alert(res.error);
      return;
    }
    setSubs((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  function chainOf(s: PendingSub): ApprovalStep[] {
    return (Array.isArray(s.approval_chain) ? s.approval_chain : []).filter(
      (x): x is ApprovalStep => !!x && typeof x === "object" && "user_id" in x
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("appr.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {subs.length ? tt("appr.count", { n: subs.length }) : t("appr.none")}
        </p>
      </div>

      {subs.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "24px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Icon icon={PartyPopper} className="h-5 w-5" /> {t("appr.cleared")}</div>
        </Card>
      )}

      {subs.map((s) => (
        <Card key={s.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>{s.form_icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{s.form_title}</b>
              <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>{s.user_name || "—"} · {fmt(s.submitted_at)}</small>
            </div>
            {s.fails?.length ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {tt("appr.problems", { n: s.fails.length })}</span></Pill> : <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("appr.complete")}</span></Pill>}
          </div>

          {chainOf(s).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
              {chainOf(s).map((st, i) => {
                const done = i < (s.approval_step ?? 0);
                const current = i === (s.approval_step ?? 0);
                return (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: ".76rem", padding: "3px 10px", borderRadius: 20,
                      background: done ? "var(--pass-soft)" : current ? "var(--accent-soft)" : "var(--code-bg)",
                      color: done ? "var(--pass)" : current ? "var(--accent)" : "var(--ink-3)",
                      fontWeight: current ? 700 : 500, border: current ? "1px solid var(--accent)" : "1px solid var(--line)",
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      {done && <Icon icon={Check} className="h-3 w-3" />}{current && <Icon icon={Play} className="h-3 w-3" />}{st.label || `ขั้น ${i + 1}`}: {st.name}
                    </span>
                    {i < chainOf(s).length - 1 && <span style={{ color: "var(--ink-3)", display: "inline-flex" }}><Icon icon={ArrowRight} className="h-3.5 w-3.5" /></span>}
                  </span>
                );
              })}
              {isOwner && chainOf(s)[s.approval_step ?? 0]?.user_id !== undefined && (
                <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>· owner override ได้</span>
              )}
            </div>
          )}

          {s.fails?.length > 0 && (
            <div style={{ borderLeft: "3px solid var(--fail)", background: "var(--fail-soft)", borderRadius: "0 8px 8px 0", padding: "8px 12px", margin: "12px 0 0", fontSize: ".85rem", color: "var(--ink-2)" }}>
              {s.fails.map((f, i) => <div key={i}>• {f}</div>)}
            </div>
          )}

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: ".88rem" }}>ดูคำตอบทั้งหมด</summary>
            <div style={{ marginTop: 8 }}>
              {s.answers.map((a, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 14px", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: ".88rem" }}>
                  <div style={{ color: "var(--ink-2)" }}>{a.label}{a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}>{a.note}</div>}</div>
                  <div style={{ fontWeight: 600, textAlign: "right", color: a.fail ? "var(--fail)" : "var(--ink)" }}>{a.type === "photo" || a.type === "signature" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><Icon icon={Paperclip} className="h-3.5 w-3.5" /> มีไฟล์แนบ</span> : a.display ?? "—"}</div>
                </div>
              ))}
            </div>
            <Link href={`/submission/${s.id}`} style={{ fontSize: ".85rem", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8 }}>{t("appr.openDoc").replace(/[→\s]*$/, "")} <Icon icon={ArrowRight} className="h-3.5 w-3.5" /></Link>
          </details>

          <TextArea
            value={notes[s.id] || ""}
            onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
            placeholder="ความเห็น / เหตุผล (จำเป็นเมื่อตีกลับ)"
            style={{ marginTop: 12, minHeight: 52 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Button variant="primary" onClick={() => act(s.id, "approved")} disabled={!!busy} loading={busy === s.id + "approved"} style={{ flex: 1, background: "var(--pass)", borderColor: "var(--pass)" }}>
              <Icon icon={Check} className="h-4 w-4" /> {chainOf(s).length > 1 && (s.approval_step ?? 0) < chainOf(s).length - 1 ? t("appr.approveNext") : t("appr.approve")}
            </Button>
            <Button variant="danger" onClick={() => act(s.id, "rejected")} disabled={!!busy} loading={busy === s.id + "rejected"} style={{ flex: 1 }}>
              <Icon icon={X} className="h-4 w-4" /> {t("appr.reject")}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
