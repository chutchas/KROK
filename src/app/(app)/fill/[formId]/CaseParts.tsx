"use client";
// ชิ้นส่วนหน้าจอของ "งาน" (ฟอร์มกรอกหลายคน): ช่องแบบอ่านอย่างเดียว, แถบสถานะงาน, หน้าต่างส่งต่อ/ส่งกลับ
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Button } from "@/components/ui";
import { Lock, Users, CornerUpLeft, Send, CheckCircle2, Circle, CircleDot, History, X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import { labelMap, type FormField, type FormSchema } from "@/lib/form-schema";
import { assigneeLabel, caseNo, lastReturn, segmentEnd, type CaseData, type CaseHistoryItem } from "@/lib/case-flow";
import { PaperLabel, paperInputStyle } from "@/components/paper/PaperParts";

type TableRow = Record<string, string>;
type Answer = { value?: string | string[] | TableRow[]; note?: string; ai?: string };

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

/** ค่าที่อ่านง่ายของคำตอบ (ใช้กับช่องที่ล็อก) */
function textOf(f: FormField, a: Answer | undefined): string {
  const v = a?.value;
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
  if (f.type === "pass_fail") return v === "pass" ? "✓ ผ่าน" : v === "fail" ? `✗ ไม่ผ่าน${a?.note ? ` — ${a.note}` : ""}` : String(v);
  if (f.type === "select" || f.type === "checkbox") {
    const names = labelMap(f.options, f.option_labels);
    const vals = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [String(v)];
    return vals.map((x) => names.get(x) ?? x).join(", ");
  }
  if (f.type === "number") return `${v}${f.unit ? " " + f.unit : ""}`;
  if (f.type === "datetime" && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  }
  return typeof v === "string" ? v : "";
}

function MiniTable({ f, rows, paper }: { f: FormField; rows: TableRow[]; paper: boolean }) {
  const cols = f.columns?.length ? f.columns : [{ id: "c0", label: "รายการ", type: "text" as const }];
  const filled = rows.filter((r) => r && Object.values(r).some((x) => String(x ?? "").trim() !== ""));
  if (!filled.length) return <span style={{ color: paper ? "#888" : "var(--ink-3)" }}>—</span>;
  const bd = paper ? "1px solid #d4d7db" : "1px solid var(--line)";
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78rem" }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.id} style={{ textAlign: "left", padding: "3px 6px", border: bd, background: paper ? "#eee" : "var(--code-bg)", fontWeight: 600 }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {filled.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const raw = r[c.id] ?? "";
                const name = "option_labels" in c && c.option_labels ? labelMap(c.options, c.option_labels).get(raw) : undefined;
                return <td key={c.id} style={{ padding: "3px 6px", border: bd }}>{name ?? raw}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ช่องของขั้นที่ไม่ใช่ของเรา — แสดงค่าอย่างเดียว แก้ไม่ได้ */
export function ReadonlyField({ field: f, answer, photo, sig, paper = false, compact = false, pending = false }: {
  field: FormField;
  answer?: Answer;
  photo?: string;
  sig?: string;
  paper?: boolean;
  compact?: boolean;
  /** ขั้นที่ยังมาไม่ถึง */
  pending?: boolean;
}) {
  const muted = paper ? "#888" : "var(--ink-3)";
  const dash = <span style={{ color: muted }}>{pending ? "รอขั้นถัดไป" : "—"}</span>;
  const rows = Array.isArray(answer?.value) && typeof answer?.value[0] === "object" ? (answer!.value as TableRow[]) : [];

  let body: React.ReactNode;
  if (f.type === "photo") body = photo ? <img src={photo} alt={f.label} style={{ maxHeight: compact ? 44 : 140, maxWidth: "100%", borderRadius: 6, display: "block" }} /> : dash;
  else if (f.type === "signature") body = sig ? <img src={sig} alt={f.label} style={{ maxHeight: compact ? 40 : 80, maxWidth: "100%", background: "#fff", display: "block" }} /> : dash;
  else if (f.type === "table") body = <MiniTable f={f} rows={rows} paper={paper} />;
  else {
    const txt = textOf(f, answer);
    const fail = f.type === "pass_fail" && answer?.value === "fail";
    const pass = f.type === "pass_fail" && answer?.value === "pass";
    body = txt ? <span style={{ color: fail ? "#dc2626" : pass ? "#15803d" : undefined, whiteSpace: compact ? "nowrap" : "pre-wrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txt}</span> : dash;
  }

  const lock = <Icon icon={Lock} className="h-3 w-3" />;

  if (compact) {
    const inline = f.type !== "photo" && f.type !== "signature" && f.type !== "table";
    return (
      <div title="ขั้นนี้ไม่ใช่ของคุณ — ดูได้อย่างเดียว">
        <PaperLabel label={f.label} right={<span style={{ color: "#999" }}>{lock}</span>} />
        {inline ? (
          <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", background: "#f3f4f6", borderStyle: "dashed", overflow: "hidden" }}>{body}</div>
        ) : body}
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px", margin: "0 0 10px", borderRadius: 10, background: paper ? "#f7f7f8" : "var(--code-bg)", border: paper ? "1px dashed #c9cdd2" : "1px dashed var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".8rem", fontWeight: 600, color: muted, marginBottom: 4 }}>
        {lock} {f.label}
      </div>
      <div style={{ fontSize: ".92rem" }}>{body}</div>
    </div>
  );
}

// ------------------------------------------------------------
// แถบสถานะงาน: เลขงาน, ภาพรวมขั้นตอน (ใครทำขั้นไหน), เหตุผลที่ถูกส่งกลับ, ประวัติ
// ------------------------------------------------------------
export function CaseBanner({ schema, kase, teams, users, userId, segStart, segEnd, canClaim, claiming, onClaim }: {
  schema: FormSchema;
  kase: CaseData | null;
  teams: Record<string, string>;
  users: Record<string, string>;
  userId: string;
  segStart: number;
  segEnd: number;
  canClaim: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const { t } = useT();
  const [showHist, setShowHist] = useState(false);
  const teamOf = (i: number) => assigneeLabel(schema, i, teams, users);
  // กองงานที่รออยู่ตอนนี้ (ทีมของช่วงปัจจุบัน; ไม่มีทีม = ผู้ดูแลจัดการ)
  const poolLabel = kase?.assigneeTeam ? `${t("wf.team")} ${teams[kase.assigneeTeam] || t("wf.teamMissing")}` : t("wf.admins");
  const ret = kase && kase.claimedBy === userId ? lastReturn(kase) : null;
  const cur = kase ? kase.stepIdx : 0;
  const done = kase?.status === "done";

  // สถานะรายขั้น
  const rows = schema.steps.map((s, i) => {
    const meta = kase?.stepMeta[String(i)];
    let state: "done" | "current" | "todo" = "todo";
    if (done || (kase && i < cur)) state = "done";
    else if (kase ? i >= cur && i <= segmentEnd(schema, cur) : i >= segStart && i <= segEnd) state = kase?.status === "cancelled" ? "todo" : "current";
    let who = "";
    if (state === "done" && meta) who = meta.name;
    else if (state === "current") who = kase?.claimedBy === userId || !kase ? t("wf.you") : kase?.claimedName ? kase.claimedName : `${t("wf.waitClaim")} · ${poolLabel}`;
    else {
      who = teamOf(i) || "";
    }
    return { i, title: s.title, state, who };
  });

  const wrap: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", margin: "10px 0", background: "var(--surface)" };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: ".85rem" }}>
        <Icon icon={Users} className="h-4 w-4" />
        <strong>{kase ? `${t("wf.caseNo")} #${caseNo(kase.id)}` : t("wf.multiForm")}</strong>
        {kase?.title && <span style={{ color: "var(--ink-2)" }}>· {kase.title}</span>}
        {kase && (
          <span style={{ marginLeft: "auto", fontSize: ".74rem", padding: "2px 8px", borderRadius: 999,
            background: kase.status === "done" ? "var(--pass-soft, #e7f7ee)" : kase.status === "cancelled" ? "var(--code-bg)" : "var(--accent-soft)",
            color: kase.status === "done" ? "var(--pass)" : kase.status === "cancelled" ? "var(--ink-3)" : "var(--accent)" }}>
            {kase.status === "done" ? t("wf.stDone") : kase.status === "cancelled" ? t("wf.stCancelled") : t("wf.stOpen")}
          </span>
        )}
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
        {rows.map((r) => (
          <li key={r.i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: r.state === "todo" ? "var(--ink-3)" : "var(--ink)" }}>
            <span style={{ color: r.state === "done" ? "var(--pass)" : r.state === "current" ? "var(--accent)" : "var(--ink-3)", display: "inline-flex" }}>
              <Icon icon={r.state === "done" ? CheckCircle2 : r.state === "current" ? CircleDot : Circle} className="h-4 w-4" />
            </span>
            <span style={{ fontWeight: r.state === "current" ? 600 : 400 }}>{r.i + 1}. {r.title}</span>
            {r.who && <span style={{ marginLeft: "auto", fontSize: ".76rem", color: "var(--ink-3)", textAlign: "right" }}>{r.who}</span>}
          </li>
        ))}
      </ol>

      {!kase && (
        <p style={{ fontSize: ".8rem", color: "var(--ink-2)", margin: "8px 0 0" }}>
          {t("wf.newHint").replace("{to}", String(segEnd + 1)).replace("{team}", teamOf(segEnd + 1) || "-")}
        </p>
      )}

      {ret && (
        <div style={{ marginTop: 8, borderLeft: "3px solid #d97706", background: "rgba(217,119,6,.1)", borderRadius: "0 8px 8px 0", padding: "8px 12px", fontSize: ".85rem" }}>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon icon={CornerUpLeft} className="h-4 w-4" /> {t("wf.returnedBy").replace("{name}", ret.name)}
          </div>
          <div style={{ color: "var(--ink-2)", marginTop: 2 }}>{ret.note}</div>
        </div>
      )}

      {kase && kase.status === "open" && kase.claimedBy !== userId && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: ".85rem" }}>
          <span style={{ color: "var(--ink-2)" }}>
            {kase.claimedBy
              ? t("wf.heldBy").replace("{name}", kase.claimedName || "-")
              : t("wf.waitingTeam").replace("{team}", poolLabel)}
            {" · "}{t("wf.viewOnly")}
          </span>
          {canClaim && (
            <Button variant="primary" onClick={onClaim} loading={claiming} style={{ padding: "7px 14px", fontSize: ".85rem" }}>
              {t("wf.claim")}
            </Button>
          )}
        </div>
      )}
      {kase?.status === "done" && kase.submissionId && (
        <div style={{ marginTop: 8, fontSize: ".85rem" }}>
          <Link href={`/submission/${kase.submissionId}`} style={{ color: "var(--accent)" }}>{t("wf.viewSubmission")} →</Link>
        </div>
      )}

      {kase && kase.history.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowHist((v) => !v)} style={{ border: "none", background: "none", padding: 0, color: "var(--ink-3)", cursor: "pointer", fontFamily: "inherit", fontSize: ".78rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon icon={History} className="h-3.5 w-3.5" /> {showHist ? t("wf.hideHistory") : t("wf.showHistory")} ({kase.history.length})
          </button>
          {showHist && (
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
              {kase.history.map((h, i) => (
                <li key={i} style={{ fontSize: ".78rem", color: "var(--ink-2)" }}>
                  <span style={{ color: "var(--ink-3)" }}>{fmtTime(h.at)}</span> · {histText(h, schema, t)}
                  {h.note ? <span style={{ color: "var(--ink-3)" }}> — “{h.note}”</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function histText(h: CaseHistoryItem, schema: FormSchema, t: (k: MessageKey) => string): string {
  const st = (i?: number) => (i == null ? "" : `${i + 1}. ${schema.steps[i]?.title ?? ""}`);
  const key = `wf.h.${h.action}` as MessageKey;
  return t(key).replace("{name}", h.name).replace("{step}", st(h.step)).replace("{to}", st(h.to));
}

// ------------------------------------------------------------
// หน้าต่างยืนยัน "ส่งต่อ" (หมายเหตุถึงขั้นถัดไป — ไม่บังคับ)
// ------------------------------------------------------------
export function HandoffModal({ nextTitle, teamName, busy, error, onCancel, onConfirm }: {
  nextTitle: string;
  teamName: string | null;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const { t } = useT();
  const [note, setNote] = useState("");
  return (
    <Modal title={t("wf.handoffTitle")} onClose={onCancel} busy={busy} keepOnBackdrop={!!note.trim()}>
      <p style={{ margin: "0 0 10px", fontSize: ".9rem", color: "var(--ink-2)" }}>
        {t("wf.handoffBody").replace("{step}", nextTitle).replace("{team}", teamName || "-")}
      </p>
      <label htmlFor="wf-handoff-note" style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{t("wf.noteOptional")}</label>
      <textarea id="wf-handoff-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3}
        style={{ width: "100%", marginTop: 4, padding: 10, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", resize: "vertical" }} />
      {error && <div style={{ color: "var(--fail)", fontSize: ".85rem", marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Button onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={() => onConfirm(note.trim())} loading={busy}>
          <Icon icon={Send} className="h-4 w-4" /> {t("wf.handoff")}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// หน้าต่าง "ส่งกลับ" — เลือกขั้นก่อนหน้า + เหตุผล (บังคับ)
// ------------------------------------------------------------
export function ReturnModal({ schema, kase, maxStep, busy, error, onCancel, onConfirm }: {
  schema: FormSchema;
  kase: CaseData;
  maxStep: number; // ส่งกลับได้ถึงขั้นนี้ (ไม่รวม)
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (toStep: number, note: string) => void;
}) {
  const { t } = useT();
  const [to, setTo] = useState(maxStep - 1);
  const [note, setNote] = useState("");
  const opts = Array.from({ length: maxStep }, (_, i) => i);
  return (
    <Modal title={t("wf.returnTitle")} onClose={onCancel} busy={busy} keepOnBackdrop={!!note.trim()}>
      <label htmlFor="wf-return-to" style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{t("wf.returnTo")}</label>
      <select id="wf-return-to" value={to} onChange={(e) => setTo(Number(e.target.value))}
        style={{ width: "100%", marginTop: 4, padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }}>
        {opts.map((i) => {
          const who = kase.stepMeta[String(i)]?.name;
          return <option key={i} value={i}>{i + 1}. {schema.steps[i]?.title}{who ? ` — ${who}` : ""}</option>;
        })}
      </select>
      <label htmlFor="wf-return-note" style={{ display: "block", fontSize: ".82rem", color: "var(--ink-2)", marginTop: 10 }}>{t("wf.returnReason")} *</label>
      <textarea id="wf-return-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder={t("wf.returnReasonPh")}
        style={{ width: "100%", marginTop: 4, padding: 10, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", resize: "vertical" }} />
      {error && <div style={{ color: "var(--fail)", fontSize: ".85rem", marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Button onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={() => onConfirm(to, note.trim())} loading={busy} disabled={!note.trim()}>
          <Icon icon={CornerUpLeft} className="h-4 w-4" /> {t("wf.return")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * หน้าต่างกลางจอ: Esc ปิดได้, แตะพื้นหลังปิดได้เฉพาะตอนยังไม่ได้พิมพ์อะไร (กันเหตุผลที่พิมพ์ไว้หาย)
 */
function Modal({ title, onClose, children, busy = false, keepOnBackdrop = false }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
  keepOnBackdrop?: boolean;
}) {
  const { t } = useT();
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={() => { if (!busy && !keepOnBackdrop) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, background: "var(--surface)", color: "var(--ink)", borderRadius: 12, padding: 18, boxShadow: "var(--shadow)", paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 id={titleId} style={{ margin: 0, fontSize: "1.02rem" }}>{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("common.close")}
            style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", display: "inline-flex", minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ยืนยันการกระทำกับงาน (คืนงาน / ยกเลิกงาน) — แทน confirm()/prompt() ของ browser
// ------------------------------------------------------------
export function CaseConfirmModal({ title, body, confirmLabel, danger = false, withNote = false, busy, error, onCancel, onConfirm }: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  /** มีช่องหมายเหตุ (ไม่บังคับ) */
  withNote?: boolean;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const { t } = useT();
  const [note, setNote] = useState("");
  const noteId = useId();
  return (
    <Modal title={title} onClose={onCancel} busy={busy} keepOnBackdrop={!!note.trim()}>
      <p style={{ margin: "0 0 10px", fontSize: ".9rem", color: "var(--ink-2)" }}>{body}</p>
      {withNote && (
        <>
          <label htmlFor={noteId} style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{t("wf.noteOptional2")}</label>
          <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3}
            style={{ width: "100%", marginTop: 4, padding: 10, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", resize: "vertical" }} />
        </>
      )}
      {error && <div style={{ color: "var(--fail)", fontSize: ".85rem", marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Button onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={() => onConfirm(note.trim())} loading={busy}
          style={danger ? { background: "var(--fail)", borderColor: "var(--fail)" } : undefined}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
