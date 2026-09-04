"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, TextArea } from "@/components/ui";
import { reviewSubmission } from "./actions";

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
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>รออนุมัติ</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {subs.length ? `มี ${subs.length} รายการรอการอนุมัติ` : "ไม่มีรายการค้างอนุมัติ"}
        </p>
      </div>

      {subs.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "24px 0" }}>🎉 เคลียร์หมดแล้ว</div>
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
            {s.fails?.length ? <Pill kind="fail">✗ {s.fails.length} ปัญหา</Pill> : <Pill kind="pass">✓ ครบ</Pill>}
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
                    }}>
                      {done ? "✓ " : current ? "▶ " : ""}{st.label || `ขั้น ${i + 1}`}: {st.name}
                    </span>
                    {i < chainOf(s).length - 1 && <span style={{ color: "var(--ink-3)" }}>→</span>}
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
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 14px", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: ".88rem" }}>
                  <div style={{ color: "var(--ink-2)" }}>{a.label}{a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}>{a.note}</div>}</div>
                  <div style={{ fontWeight: 600, textAlign: "right", color: a.fail ? "var(--fail)" : "var(--ink)" }}>{a.type === "photo" || a.type === "signature" ? "📎 มีไฟล์แนบ" : a.display ?? "—"}</div>
                </div>
              ))}
            </div>
            <Link href={`/submission/${s.id}`} style={{ fontSize: ".85rem", display: "inline-block", marginTop: 8 }}>เปิดมุมมองเอกสาร (พร้อมรูป) →</Link>
          </details>

          <TextArea
            value={notes[s.id] || ""}
            onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
            placeholder="ความเห็น / เหตุผล (จำเป็นเมื่อตีกลับ)"
            style={{ marginTop: 12, minHeight: 52 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Button variant="primary" onClick={() => act(s.id, "approved")} disabled={!!busy} style={{ flex: 1, background: "var(--pass)", borderColor: "var(--pass)" }}>
              {busy === s.id + "approved" ? "..." : chainOf(s).length > 1 && (s.approval_step ?? 0) < chainOf(s).length - 1 ? "✓ อนุมัติ → ส่งต่อขั้นถัดไป" : "✓ อนุมัติ"}
            </Button>
            <Button variant="danger" onClick={() => act(s.id, "rejected")} disabled={!!busy} style={{ flex: 1 }}>
              {busy === s.id + "rejected" ? "..." : "✗ ตีกลับ"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
