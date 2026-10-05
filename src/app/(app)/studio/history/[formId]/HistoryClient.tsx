"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import FormIcon from "@/components/FormIcon";
import Icon from "@/components/Icon";
import BodyPortal from "@/components/BodyPortal";
import { AsyncButton, Button, Card, EmptyState, Field, Notice } from "@/components/ui";
import { ArrowLeft, History, Eye, RotateCcw, X, Pencil, Check, ChevronDown } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { alertDialog, confirmDialog } from "@/components/dialogs";
import { backdropClose } from "@/lib/backdrop";
import { diffCounts, type FormDiff } from "@/lib/form-diff";
import type { FormSchema } from "@/lib/form-schema";
import { getFormVersion, restoreFormVersion, setVersionNote } from "../../version-actions";

const FormPreview = dynamic(() => import("@/components/FormPreview"), { ssr: false });

export interface VersionItem {
  version: number;
  title: string;
  savedAt: string;
  by: string;
  note: string;
  current: boolean;
  first: boolean;
  diff: FormDiff | null;
}

export default function HistoryClient({ formId, formTitle, formIcon, deleted, items, missing, focus }: {
  formId: string; formTitle: string; formIcon: string; deleted: boolean; items: VersionItem[]; missing: boolean; focus: number | null;
}) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [preview, setPreview] = useState<{ version: number; schema: FormSchema } | null>(null);
  const [open, setOpen] = useState<Set<number>>(() => new Set(focus ? [focus] : items.slice(0, 1).map((i) => i.version)));
  const [editing, setEditing] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => { focusRef.current?.scrollIntoView({ block: "center" }); }, []);

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  const err = (m: string) => alertDialog(localizeServerMsg(m, lang));

  async function showPreview(v: number) {
    const r = await getFormVersion(formId, v);
    if ("error" in r) return err(r.error);
    setPreview({ version: v, schema: r.schema });
  }

  async function restore(v: number) {
    if (!(await confirmDialog({ message: tt("ver.restoreConfirm", { v }) }))) return;
    const r = await restoreFormVersion(formId, v);
    if ("error" in r) return err(r.error);
    setPreview(null);
    router.refresh();
  }

  async function saveNote(v: number) {
    const r = await setVersionNote(formId, v, noteDraft);
    if ("error" in r) return err(r.error);
    setEditing(null);
    router.refresh();
  }

  const toggle = (v: number) => setOpen((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <Link href={`/studio?edit=${formId}`} style={{ fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <Icon icon={ArrowLeft} className="h-4 w-4" /> {t("ver.back")}
      </Link>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
          <FormIcon value={formIcon} size={40} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "1.2rem", margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Icon icon={History} className="h-5 w-5" /> {t("ver.title")}</h1>
            <div style={{ color: "var(--ink-2)", fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formTitle}</div>
          </div>
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: "4px 0 0" }}>{t("ver.sub")}</p>
        {missing && <Notice kind="error">{t("ver.needMigration")}</Notice>}
        {deleted && <Notice>{t("ver.deleted")}</Notice>}
      </Card>

      {!missing && items.length === 0 && <Card style={{ marginTop: 12 }}><EmptyState icon={<Icon icon={History} className="h-7 w-7" />} title={t("ver.empty")} /></Card>}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {items.map((it) => {
          const c = it.diff ? diffCounts(it.diff) : null;
          const isOpen = open.has(it.version);
          const isFocus = focus === it.version;
          return (
            <div key={it.version} ref={isFocus ? focusRef : undefined}
              style={{ border: `1px solid ${it.current || isFocus ? "var(--accent)" : "var(--line)"}`, borderRadius: 12, background: "var(--surface)", padding: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: ".9rem", background: it.current ? "var(--accent)" : "var(--code-bg)", color: it.current ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 8px" }}>v{it.version}</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: ".86rem", color: "var(--ink-2)" }}>
                    {fmt(it.savedAt)}{it.by && ` · ${it.by}`}
                    {it.current && <b style={{ color: "var(--accent-text)", marginLeft: 6 }}>{t("ver.current")}</b>}
                  </div>
                  {editing === it.version ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <Field autoFocus value={noteDraft} maxLength={300} onChange={(e) => setNoteDraft(e.target.value)} placeholder={t("ver.notePh")} style={{ flex: 1, minWidth: 0 }}
                        onKeyDown={(e) => { if (e.key === "Enter") void saveNote(it.version); if (e.key === "Escape") setEditing(null); }} />
                      <AsyncButton onClick={() => saveNote(it.version)} aria-label={t("common.save")} style={{ padding: "8px 10px" }}><Icon icon={Check} className="h-4 w-4" /></AsyncButton>
                      <Button onClick={() => setEditing(null)} aria-label={t("common.cancel")} style={{ padding: "8px 10px" }}><Icon icon={X} className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setEditing(it.version); setNoteDraft(it.note); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", padding: "4px 0", minHeight: 30, cursor: "pointer", fontFamily: "inherit", fontSize: ".88rem", color: it.note ? "var(--ink)" : "var(--ink-3)", textAlign: "left" }}>
                      {it.note ? localizeVersionNote(it.note, lang) : t("ver.addNote")} <Icon icon={Pencil} className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {c && !it.first && (
                    <button type="button" onClick={() => toggle(it.version)} aria-expanded={isOpen}
                      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", border: "none", background: "none", padding: "2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", color: "var(--ink-3)", minHeight: 28 }}>
                      {it.diff?.same ? t("ver.noChange") : (
                        <>
                          {c.added > 0 && <span style={{ color: "var(--pass)" }}>+{c.added} {t("ver.fieldsAdded")}</span>}
                          {c.removed > 0 && <span style={{ color: "var(--fail)" }}>−{c.removed} {t("ver.fieldsRemoved")}</span>}
                          {c.changed > 0 && <span style={{ color: "var(--amber)" }}>~{c.changed} {t("ver.fieldsChanged")}</span>}
                          {c.added + c.removed + c.changed === 0 && <span>{t("ver.otherOnly")}</span>}
                        </>
                      )}
                      <span style={{ display: "inline-flex", transform: isOpen ? "rotate(180deg)" : "none" }}><Icon icon={ChevronDown} className="h-3.5 w-3.5" /></span>
                    </button>
                  )}
                  {it.first && <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("ver.firstRecorded")}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <AsyncButton onClick={() => showPreview(it.version)} style={{ padding: "8px 12px", fontSize: ".85rem" }}><Icon icon={Eye} className="h-4 w-4" /> {t("ver.preview")}</AsyncButton>
                  {!it.current && !deleted && (
                    <AsyncButton onClick={() => restore(it.version)} style={{ padding: "8px 12px", fontSize: ".85rem" }}><Icon icon={RotateCcw} className="h-4 w-4" /> {t("ver.restore")}</AsyncButton>
                  )}
                </div>
              </div>
              {isOpen && it.diff && !it.first && !it.diff.same && <DiffDetail d={it.diff} />}
            </div>
          );
        })}
      </div>

      {preview && (
        <BodyPortal>
          <div {...backdropClose(() => setPreview(null))} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 12px", overflowY: "auto" }}>
            <div role="dialog" aria-modal="true" aria-label={tt("ver.previewTitle", { v: preview.version })} style={{ background: "var(--ground)", borderRadius: 14, width: "min(560px, 100%)", border: "1px solid var(--line)", boxShadow: "var(--shadow)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--surface)", borderRadius: "14px 14px 0 0", zIndex: 1 }}>
                <b style={{ flex: 1, fontFamily: "var(--font-anuphan)" }}>{tt("ver.previewTitle", { v: preview.version })}</b>
                {!deleted && !items.find((i) => i.version === preview.version)?.current && (
                  <AsyncButton onClick={() => restore(preview.version)} style={{ padding: "7px 12px", fontSize: ".84rem" }}><Icon icon={RotateCcw} className="h-4 w-4" /> {t("ver.restore")}</AsyncButton>
                )}
                <button type="button" onClick={() => setPreview(null)} aria-label={t("common.close")} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-2)", minWidth: 40, minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon icon={X} className="h-5 w-5" /></button>
              </div>
              <div style={{ padding: 14 }}><FormPreview schema={preview.schema} /></div>
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}

/** หมายเหตุอัตโนมัติที่ระบบเขียน (ภาษาไทย) → แปลตอนแสดง */
function localizeVersionNote(note: string, lang: string): string {
  if (lang !== "en") return note;
  const m = /^กู้คืนจาก v(\d+)$/.exec(note);
  if (m) return `Restored from v${m[1]}`;
  if (note === "เวอร์ชันก่อนเปิดระบบประวัติ") return "Version before history was enabled";
  return note;
}

function DiffDetail({ d }: { d: FormDiff }) {
  const { t } = useT();
  const li: React.CSSProperties = { fontSize: ".82rem", color: "var(--ink-2)", padding: "2px 0" };
  const q = (s?: string) => `“${s || "—"}”`;
  return (
    <ul style={{ margin: "10px 0 0", padding: "10px 0 0 18px", borderTop: "1px dashed var(--line)" }}>
      {d.title && <li style={li}>{t("ver.d.title")}: {q(d.title.from)} → {q(d.title.to)}</li>}
      {d.steps.added.map((s, i) => <li key={`sa${i}`} style={{ ...li, color: "var(--pass)" }}>{t("ver.d.stepAdded")}: {q(s)}</li>)}
      {d.steps.removed.map((s, i) => <li key={`sr${i}`} style={{ ...li, color: "var(--fail)" }}>{t("ver.d.stepRemoved")}: {q(s)}</li>)}
      {d.steps.renamed.map((s, i) => <li key={`sn${i}`} style={li}>{t("ver.d.stepRenamed")}: {q(s.from)} → {q(s.to)}</li>)}
      {d.fields.map((c, i) => (
        <li key={`f${i}`} style={{ ...li, color: c.kind === "added" ? "var(--pass)" : c.kind === "removed" ? "var(--fail)" : "var(--ink-2)" }}>
          {t(`ver.k.${c.kind}`)}: {q(c.label)}
          {c.kind === "label" && <> ({q(c.from)} → {q(c.to)})</>}
          {c.kind === "type" && <> ({c.from} → {c.to})</>}
          {c.kind === "required" && <> ({c.to === "true" ? t("ver.d.nowRequired") : t("ver.d.nowOptional")})</>}
          {c.kind === "moved" && <> ({q(c.from)} → {q(c.to)})</>}
        </li>
      ))}
      {d.other.length > 0 && <li style={li}>{t("ver.d.other")}: {d.other.map((o) => t(`ver.o.${o}`)).join(", ")}</li>}
    </ul>
  );
}
