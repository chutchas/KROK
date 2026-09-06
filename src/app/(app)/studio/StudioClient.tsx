"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, AsyncButton, Card, TextArea, Field, Notice, Spinner, Pill } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import { Sparkles, FileUp, Pencil, Save, CheckCircle2, Tag, HardHat, Smartphone, FileText, Globe, QrCode, Share2, Layers, Factory, Printer, Archive, Trash2, Search as SearchIcon } from "lucide-react";
import FormPreview from "@/components/FormPreview";
import FormPaperEditor from "@/components/FormPaperEditor";
import FormPaperView from "@/components/FormPaperView";
import FieldSettingsPanel from "@/components/FieldSettingsPanel";
import QrModal from "@/components/QrModal";
import ShareScopeModal, { type ShareValue } from "@/components/ShareScopeModal";
import { countFields, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { PROMPTS_BY_TASK, PROMPTS_BY_INDUSTRY } from "@/lib/prompt-library";
import { FORM_CATEGORIES, isPresetCategory, categoryLabel } from "@/lib/form-categories";
import { saveForm, updateForm, deleteForm, saveDraft, setFormStatus } from "./actions";
import type { FormRow } from "./page";
import type { ApprovalStep } from "@/lib/approval";

interface Member { user_id: string; name: string; role: string }
interface Team { id: string; name: string }
type VisMode = "public" | "all" | "teams" | "users";
type ViewMode = "mobile" | "paper";

export default function StudioClient({ initialForms, members, teams }: { initialForms: FormRow[]; members: Member[]; teams: Team[] }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [createMode, setCreateMode] = useState<"prompt" | "file">("prompt");
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [chain, setChain] = useState<ApprovalStep[]>([]);
  const [visMode, setVisMode] = useState<VisMode>("all");
  const [visTeams, setVisTeams] = useState<string[]>([]);
  const [visUsers, setVisUsers] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>("mobile");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ t: string; err?: boolean } | null>(null);
  const [listFilter, setListFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [customCat, setCustomCat] = useState(false);
  const [tab, setTab] = useState<"new" | "edit" | "all">("new");
  const [promptGroupBy, setPromptGroupBy] = useState<"task" | "industry">("task");
  const [qrForm, setQrForm] = useState<FormRow | null>(null);
  const [shareForm, setShareForm] = useState<FormRow | null>(null);
  const [origin, setOrigin] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const fillUrl = (f: FormRow) => `${origin}${f.visibility === "public" ? "/f/" : "/fill/"}${f.id}`;
  const studioCats = Array.from(new Set(initialForms.map((f) => f.schema.category).filter((c): c is string => !!c)));

  async function saveAsDraft() {
    if (!draft) return;
    setBusy(t("studio.busyPublish"));
    const visibility = { mode: visMode, teamIds: visTeams, userIds: visUsers };
    const res = editingId
      ? await updateForm(editingId, draft, requiresApproval, requiresApproval ? chain : [], visibility)
      : await saveDraft(draft, requiresApproval, requiresApproval ? chain : [], visibility);
    setBusy(null);
    if ("error" in res) { setStatus({ t: res.error, err: true }); return; }
    resetDraft();
    setTab("all");
    router.refresh();
  }

  async function changeStatus(id: string, s: "published" | "archived" | "draft") {
    const res = await setFormStatus(id, s);
    if ("error" in res) alert(res.error);
    else router.refresh();
  }

  async function callGenerate(payload: Record<string, unknown>, busyMsg: string) {
    setBusy(busyMsg);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("studio.errAiFail"));
      setDraft(sanitizeSchema(json.schema));
      setEditingId(null);
      setView("mobile");
      setSelKey(null);
      setTab("edit");
    } catch (e) {
      setStatus({ t: e instanceof Error ? e.message : t("studio.errAiFail"), err: true });
    } finally {
      setBusy(null);
    }
  }

  function generate() {
    if (!prompt.trim()) {
      setStatus({ t: t("studio.errPrompt"), err: true });
      return;
    }
    return callGenerate({ prompt }, t("studio.busyGenerate"));
  }

  function refineDraft() {
    if (!refine.trim() || !draft) return;
    const p = callGenerate({ schema: draft, instruction: refine }, t("studio.busyRefine"));
    setRefine("");
    return p;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setBusy(isPdf ? t("studio.busyPdf") : t("studio.busyImage"));
    setStatus(null);
    try {
      let toSend: File = file;
      if (isPdf) {
        const { pdfToImageFile } = await import("@/lib/pdf-to-image");
        toSend = await pdfToImageFile(file);
      }
      const fd = new FormData();
      fd.append("file", toSend);
      const res = await fetch("/api/ai/from-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("studio.errReadFail"));
      setDraft(sanitizeSchema(json.schema));
      setEditingId(null);
      setView("mobile");
      setSelKey(null);
      setTab("edit");
    } catch (err) {
      setStatus({ t: err instanceof Error ? err.message : t("studio.errReadFail"), err: true });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publish() {
    if (!draft) return;
    if (requiresApproval && chain.length > 0 && chain.some((s) => !s.user_id)) {
      setStatus({ t: t("studio.errNoApprover"), err: true });
      return;
    }
    if (visMode === "teams" && visTeams.length === 0) {
      setStatus({ t: t("studio.visPickTeam"), err: true });
      return;
    }
    if (visMode === "users" && visUsers.length === 0) {
      setStatus({ t: t("studio.visPickUser"), err: true });
      return;
    }
    setBusy(t("studio.busyPublish"));
    const visibility = { mode: visMode, teamIds: visTeams, userIds: visUsers };
    const res = editingId
      ? await updateForm(editingId, draft, requiresApproval, requiresApproval ? chain : [], visibility)
      : await saveForm(draft, requiresApproval, requiresApproval ? chain : [], visibility);
    setBusy(null);
    if ("error" in res) {
      setStatus({ t: res.error, err: true });
      return;
    }
    resetDraft();
    setTab("all");
    router.refresh();
  }

  function resetDraft() {
    setDraft(null);
    setPrompt("");
    setEditingId(null);
    setView("mobile");
    setSelKey(null);
    setCustomCat(false);
    setRequiresApproval(false);
    setChain([]);
    setVisMode("all");
    setVisTeams([]);
    setVisUsers([]);
    setStatus(null);
  }

  function doPrint() {
    if (typeof window !== "undefined") window.print();
  }

  // ยกเลิก/ปิดการแก้ไข → กลับไปแท็บที่เหมาะสม
  function cancelDraft() {
    const wasEditing = !!editingId;
    resetDraft();
    setTab(wasEditing ? "all" : "new");
  }

  function editExisting(f: FormRow) {
    setDraft(f.schema);
    setEditingId(f.id);
    setView("mobile");
    setSelKey(null);
    setRequiresApproval(f.requires_approval);
    setChain(f.approval_chain || []);
    setVisMode(f.visibility || "all");
    setVisTeams(f.visible_teams || []);
    setVisUsers(f.visible_users || []);
    setStatus(null);
    setView("mobile");
    setTab("edit");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onDelete(id: string, title: string) {
    if (!confirm(tt("studio.deleteConfirm", { title }))) return;
    const res = await deleteForm(id);
    if ("error" in res) alert(res.error);
    else router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* แท็บหลัก 3 แท็บ */}
      <div style={{ display: "flex", gap: 4, border: "1px solid var(--line)", borderRadius: 12, padding: 4, background: "var(--surface-2)", flexWrap: "wrap" }}>
        {([
          { k: "new" as const, icon: Sparkles, label: t("studio.tabNew") },
          { k: "edit" as const, icon: Pencil, label: t("studio.tabEdit") },
          { k: "all" as const, icon: FileText, label: `${t("studio.tabAll")} (${initialForms.length})` },
        ]).map((tb) => {
          const on = tab === tb.k;
          return (
            <button
              key={tb.k}
              onClick={() => setTab(tb.k)}
              className="inline-flex items-center justify-center gap-1.5"
              style={{ flex: 1, minWidth: 120, padding: "10px 14px", border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: ".92rem", fontWeight: on ? 700 : 500, background: on ? "var(--surface)" : "transparent", color: on ? "var(--accent)" : "var(--ink-2)", boxShadow: on ? "var(--shadow)" : "none" }}
            >
              <Icon icon={tb.icon} className="h-4 w-4" /> {tb.label}
            </button>
          );
        })}
      </div>

      {tab === "new" && (
      <>
      <Card>
        <div>
          <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("studio.title")}</h2>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("studio.subtitle")}</p>
        </div>

        {/* โหมดสร้าง: พิมพ์ prompt หรือ อัพโหลดไฟล์ */}
        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", margin: "12px 0" }}>
          {(["prompt", "file"] as const).map((m) => {
            const on = createMode === m;
            return (
              <button
                key={m}
                onClick={() => setCreateMode(m)}
                className="inline-flex items-center gap-1.5"
                style={{ padding: "9px 16px", border: "none", borderLeft: m === "file" ? "1px solid var(--line)" : "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".9rem", fontWeight: on ? 600 : 500, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)" }}
              >
                <Icon icon={m === "prompt" ? Sparkles : FileUp} className="h-4 w-4" /> {m === "prompt" ? t("studio.modePrompt") : t("studio.modeFile")}
              </button>
            );
          })}
        </div>

        {createMode === "prompt" ? (
          <div>
            <TextArea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("studio.promptPlaceholder")} style={{ minHeight: 200 }} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <AsyncButton variant="primary" onClick={generate} disabled={!!busy} style={{ padding: "12px 30px", fontSize: "1rem" }}>
                <Icon icon={Sparkles} className="h-[18px] w-[18px]" /> {t("studio.generate")}
              </AsyncButton>
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              style={{ width: "100%", border: "2px dashed var(--line)", borderRadius: 12, background: "var(--surface-2)", padding: "28px 16px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-2)" }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon={FileUp} className="h-6 w-6" />
              </span>
              <b style={{ fontFamily: "var(--font-anuphan)", color: "var(--ink)" }}>{t("studio.fileDrop")}</b>
              <span style={{ fontSize: ".82rem" }}>{t("studio.fileHint")}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onUpload} />
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", marginTop: 8 }}>{t("studio.pdfNote")}</p>
          </div>
        )}

        {busy && (
          <Notice>
            <Spinner /> {busy} — {t("studio.aiWait")}
          </Notice>
        )}
        {status && <Notice kind={status.err ? "error" : "info"}>{status.t}</Notice>}
      </Card>

      {createMode === "prompt" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1rem" }}>{t("studio.libTitle")}</b>
              <p style={{ color: "var(--ink-2)", fontSize: ".84rem", margin: "2px 0 0" }}>{t("studio.libSub")}</p>
            </div>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", flex: "0 0 auto" }}>
              {([
                { k: "task" as const, icon: Layers, label: t("studio.libByTask") },
                { k: "industry" as const, icon: Factory, label: t("studio.libByIndustry") },
              ]).map((g, i) => {
                const on = promptGroupBy === g.k;
                return (
                  <button key={g.k} onClick={() => setPromptGroupBy(g.k)} className="inline-flex items-center gap-1.5"
                    style={{ padding: "8px 14px", border: "none", borderLeft: i === 1 ? "1px solid var(--line)" : "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", fontWeight: on ? 600 : 500, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)" }}>
                    <Icon icon={g.icon} className="h-4 w-4" /> {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {(promptGroupBy === "task" ? PROMPTS_BY_TASK : PROMPTS_BY_INDUSTRY).map((group) => (
              <div key={group.key}>
                <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--ink-3)", letterSpacing: ".02em", marginBottom: 7 }}>
                  {lang === "en" ? group.en : group.th}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.items.map((it, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(lang === "en" ? it.en : it.th)}
                      style={{ fontSize: ".82rem", padding: "7px 13px", borderRadius: 20, background: "var(--code-bg)", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.35 }}
                    >
                      {lang === "en" ? it.en : it.th}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      </>
      )}

      {tab === "edit" && (draft ? (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {editingId && <Icon icon={Pencil} className="h-4 w-4" />}{draft.icon} {draft.title}
              </h2>
              <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 2 }}>
                {editingId ? t("studio.editingForm") + " · " : ""}{tt("forms.stepsFields", { steps: draft.steps.length, fields: countFields(draft) })}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flex: "0 0 auto" }}>
                {([
                  { m: "mobile" as ViewMode, icon: Smartphone, label: t("studio.viewMobile") },
                  { m: "paper" as ViewMode, icon: FileText, label: t("studio.viewPaper") },
                ]).map((v, i) => {
                  const on = view === v.m;
                  return (
                    <button
                      key={v.m}
                      onClick={() => setView(v.m)}
                      className="inline-flex items-center gap-1.5"
                      style={{ padding: "7px 13px", border: "none", borderLeft: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 400 }}
                    >
                      <Icon icon={v.icon} className="h-4 w-4" /> {v.label}
                    </button>
                  );
                })}
              </div>
              <button onClick={doPrint} title={t("paper.print")} className="inline-flex items-center gap-1.5"
                style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem" }}>
                <Icon icon={Printer} className="h-4 w-4" /> {t("paper.print")}
              </button>
            </div>
          </div>

          {/* ตั้งค่าฟอร์ม: ไอคอน/ชื่อ/คำอธิบาย/ประเภท */}
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 8, alignItems: "start" }}>
              <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value.slice(0, 4) })} aria-label="icon"
                style={{ textAlign: "center", fontSize: "1.4rem", padding: "6px 4px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)" }} />
              <div style={{ display: "grid", gap: 8 }}>
                <Field value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("editor.formTitle")} />
                <Field value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("editor.formDesc")} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: ".85rem", color: "var(--ink-2)", fontWeight: 600 }}>{t("studio.category")}</label>
              <select
                value={draft.category ? (isPresetCategory(draft.category) ? draft.category : "__custom") : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom") { setCustomCat(true); setDraft({ ...draft, category: isPresetCategory(draft.category) || !draft.category ? "" : draft.category }); }
                  else { setCustomCat(false); setDraft({ ...draft, category: v || undefined }); }
                }}
                style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem" }}
              >
                <option value="">{t("studio.categoryNone")}</option>
                {FORM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{lang === "en" ? c.en : c.th}</option>)}
                <option value="__custom">{t("studio.categoryCustom")}</option>
              </select>
              {(customCat || (!!draft.category && !isPresetCategory(draft.category))) && (
                <Field value={!isPresetCategory(draft.category) ? (draft.category || "") : ""} onChange={(e) => setDraft({ ...draft, category: e.target.value || undefined })} placeholder={t("studio.categoryCustomPh")} style={{ maxWidth: 220 }} maxLength={60} />
              )}
            </div>
          </div>

          <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "10px 0 0" }}>{t("studio.clickToEdit")}</p>

          <div className="krok-editgrid" style={{ display: "grid", gridTemplateColumns: selKey ? "1fr 330px" : "1fr", gap: 14, marginTop: 8, alignItems: "start" }}>
            <div>
              {view === "paper" ? (
                <FormPaperEditor schema={draft} onChange={(s) => setDraft(s)} selectedKey={selKey} onSelect={setSelKey} onPrint={doPrint} />
              ) : (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <div style={{ width: "100%", maxWidth: 390, border: "10px solid var(--ink)", borderRadius: 30, padding: "10px 12px 16px", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
                    <div style={{ width: 90, height: 5, background: "var(--line)", borderRadius: 3, margin: "2px auto 10px" }} />
                    <FormPreview schema={draft} selectedKey={selKey} onSelect={setSelKey} />
                  </div>
                </div>
              )}
            </div>
            {selKey && (
              <div className="krok-editpanel">
                <FieldSettingsPanel schema={draft} selectedKey={selKey} onChange={(s) => setDraft(s)} onSelect={setSelKey} />
              </div>
            )}
          </div>

          {/* เอกสารสำหรับพิมพ์ (ซ่อนบนจอ แสดงเฉพาะตอนพิมพ์) */}
          <div className="krok-print-root"><FormPaperView schema={draft} /></div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 14 }}>
            <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.refineTitle")}</b>
            <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 8px" }}>
              {t("studio.refineSub")}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field value={refine} onChange={(e) => setRefine(e.target.value)} placeholder={t("studio.refinePlaceholder")} style={{ flex: 1, minWidth: 200 }} />
              <AsyncButton onClick={refineDraft} disabled={!!busy}>{t("studio.refineBtn")}</AsyncButton>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }} />
              <span>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.approvalTitle")}</b>
                <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".85rem" }}>
                  {t("studio.approvalSub")}
                </span>
              </span>
            </label>

            {requiresApproval && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
                <div style={{ fontSize: ".88rem", fontWeight: 600, marginBottom: 4 }}>{t("studio.approverOrder")}</div>
                <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "0 0 8px" }}>
                  {chain.length === 0 ? t("studio.approverHintEmpty") : t("studio.approverHintSet")}
                </p>
                {chain.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "3px 8px" }}>{t("editor.step")} {i + 1}</span>
                    <select
                      value={s.user_id}
                      onChange={(e) => {
                        const m = members.find((x) => x.user_id === e.target.value);
                        setChain((c) => c.map((x, xi) => (xi === i ? { ...x, user_id: e.target.value, name: m?.name || "" } : x)));
                      }}
                      style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", flex: 1, minWidth: 140 }}
                    >
                      <option value="">{t("studio.pickApprover")}</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                    </select>
                    <Field value={s.label} onChange={(e) => setChain((c) => c.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))} placeholder={t("studio.rolePlaceholder")} style={{ width: 120, flex: "0 0 auto" }} />
                    <Button variant="danger" onClick={() => setChain((c) => c.filter((_, xi) => xi !== i))} style={{ padding: "8px 12px" }}>{t("common.delete")}</Button>
                  </div>
                ))}
                {chain.length < 6 && (
                  <Button onClick={() => setChain((c) => [...c, { user_id: "", name: "", label: "" }])} style={{ padding: "8px 14px", fontSize: ".88rem" }}>+ {t("studio.addApprovalStep")}</Button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
            <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.visTitle")}</b>
            <p style={{ display: "block", color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 10px" }}>{t("studio.visSub")}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(["public", "all", "teams", "users"] as VisMode[]).map((m) => {
                const on = visMode === m;
                const label = m === "public" ? t("share.public") : m === "all" ? t("studio.visAll") : m === "teams" ? t("studio.visTeams") : t("studio.visUsers");
                return (
                  <button
                    key={m}
                    onClick={() => setVisMode(m)}
                    style={{
                      padding: "8px 14px", borderRadius: 20, fontSize: ".85rem", cursor: "pointer", fontFamily: "inherit",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                      color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {visMode === "teams" && (
              teams.length === 0 ? (
                <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: 0 }}>{t("studio.visNoTeams")}</p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {teams.map((tm) => {
                    const on = visTeams.includes(tm.id);
                    return (
                      <label key={tm.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".9rem" }}>
                        <input type="checkbox" checked={on} onChange={(e) => setVisTeams((ids) => (e.target.checked ? [...ids, tm.id] : ids.filter((x) => x !== tm.id)))} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                        <Icon icon={Tag} className="h-4 w-4" /> {tm.name}
                      </label>
                    );
                  })}
                </div>
              )
            )}

            {visMode === "users" && (
              <div style={{ display: "grid", gap: 6 }}>
                {members.map((m) => {
                  const on = visUsers.includes(m.user_id);
                  return (
                    <label key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".9rem" }}>
                      <input type="checkbox" checked={on} onChange={(e) => setVisUsers((ids) => (e.target.checked ? [...ids, m.user_id] : ids.filter((x) => x !== m.user_id)))} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                      <Icon icon={HardHat} className="h-4 w-4" /> {m.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <AsyncButton variant="primary" onClick={publish} disabled={!!busy}><Icon icon={editingId ? Save : CheckCircle2} className="h-4 w-4" /> {editingId ? t("studio.saveChanges") : t("studio.publish")}</AsyncButton>
            {!editingId && <AsyncButton onClick={saveAsDraft} disabled={!!busy}><Icon icon={FileText} className="h-4 w-4" /> {t("studio.saveDraft")}</AsyncButton>}
            <Button onClick={cancelDraft} disabled={!!busy}>{editingId ? t("common.cancel") : t("studio.discard")}</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-2)" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)", marginBottom: 10 }}><Icon icon={Pencil} className="h-10 w-10" strokeWidth={1.4} /></div>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 6px" }}>{t("studio.editEmptyTitle")}</h2>
            <p style={{ fontSize: ".9rem", color: "var(--ink-3)", margin: "0 0 16px" }}>{t("studio.editEmptySub")}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => setTab("new")}><Icon icon={Sparkles} className="h-4 w-4" /> {t("studio.tabNew")}</Button>
              <Button onClick={() => setTab("all")}><Icon icon={FileText} className="h-4 w-4" /> {t("studio.tabAll")}</Button>
            </div>
          </div>
        </Card>
      ))}

      {tab === "all" && (
      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("studio.allFormsTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("studio.allFormsSub")}</p>

        {/* ค้นหา + กรองประเภท */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 10px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("studio.searchForm")} style={{ width: "100%", paddingLeft: 32 }} />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            style={{ padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", minWidth: 180, flex: "0 0 auto" }}>
            <option value="all">{t("studio.allCategories")}</option>
            {studioCats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 14px" }}>
          {(["all", "published", "draft", "archived"] as const).map((k) => {
            const on = listFilter === k;
            const n = k === "all" ? initialForms.length : initialForms.filter((f) => f.status === k).length;
            const label = k === "all" ? t("studio.stAll") : k === "published" ? t("studio.stPublished") : k === "draft" ? t("studio.stDraft") : t("studio.stArchived");
            return (
              <button key={k} onClick={() => setListFilter(k)}
                style={{ padding: "6px 13px", borderRadius: 20, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
                {label} ({n})
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {initialForms.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("studio.emptyForms")}</span>}
          {initialForms
            .filter((f) => listFilter === "all" || f.status === listFilter)
            .filter((f) => catFilter === "all" || (f.schema.category || "") === catFilter)
            .filter((f) => !search.trim() || f.title.toLowerCase().includes(search.trim().toLowerCase()))
            .map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--surface)", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>{f.icon}</div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>{" "}
                {f.status === "published" ? <Pill kind="pass">{t("studio.stPublished")}</Pill> : f.status === "draft" ? <Pill kind="na">{t("studio.stDraft")}</Pill> : <Pill kind="fail">{t("studio.stArchived")}</Pill>}
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {f.schema.category && <span style={{ display: "inline-block", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", marginRight: 6, color: "var(--ink-2)" }}>{categoryLabel(f.schema.category, lang)}</span>}
                  {tt("forms.stepsFields", { steps: f.schema.steps.length, fields: countFields(f.schema) })}
                </small>
              </div>
              <div className="krok-row-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* เรียงตามการใช้งาน: แก้ไข → แชร์ → QR → เผยแพร่/ยกเลิก → ลบ */}
                <Button onClick={() => editExisting(f)} title={t("common.edit")}><Icon icon={Pencil} className="h-4 w-4" /><span className="krok-btn-label"> {t("common.edit")}</span></Button>
                <Button onClick={() => setShareForm(f)} title={t("share.title")}>
                  <Icon icon={f.visibility === "public" ? Globe : Share2} className="h-4 w-4" />
                  <span className="krok-btn-label"> {t("share.short")}</span>
                </Button>
                {f.status === "published" && (
                  <Button onClick={() => setQrForm(f)} title={t("qr.title")}>
                    <Icon icon={QrCode} className="h-4 w-4" /><span className="krok-btn-label"> QR</span>
                  </Button>
                )}
                {f.status === "published" ? (
                  <AsyncButton onClick={() => changeStatus(f.id, "archived")} title={t("studio.cancelForm")}><Icon icon={Archive} className="h-4 w-4" /><span className="krok-btn-label"> {t("studio.cancelForm")}</span></AsyncButton>
                ) : (
                  <AsyncButton variant="primary" onClick={() => changeStatus(f.id, "published")} title={f.status === "draft" ? t("studio.publishNow") : t("studio.restore")}><Icon icon={CheckCircle2} className="h-4 w-4" /><span className="krok-btn-label"> {f.status === "draft" ? t("studio.publishNow") : t("studio.restore")}</span></AsyncButton>
                )}
                <AsyncButton variant="danger" onClick={() => onDelete(f.id, f.title)} title={t("common.delete")}><Icon icon={Trash2} className="h-4 w-4" /><span className="krok-btn-label"> {t("common.delete")}</span></AsyncButton>
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {qrForm && (
        <QrModal
          url={fillUrl(qrForm)}
          title={qrForm.title}
          isPublic={qrForm.visibility === "public"}
          onClose={() => setQrForm(null)}
        />
      )}

      {shareForm && (
        <ShareScopeModal
          formId={shareForm.id}
          title={shareForm.title}
          initial={{ mode: (shareForm.visibility as ShareValue["mode"]) || "all", teamIds: shareForm.visible_teams || [], userIds: shareForm.visible_users || [] }}
          teams={teams}
          members={members.map((m) => ({ user_id: m.user_id, name: m.name }))}
          onClose={() => setShareForm(null)}
          onSaved={() => { setShareForm(null); router.refresh(); }}
        />
      )}

      <style>{`
        @media(max-width:640px){
          .krok-btn-label{display:none}
          .krok-row-actions{flex-basis:100%;justify-content:flex-start;margin-top:4px}
        }
        @media(max-width:760px){.krok-editgrid{grid-template-columns:1fr!important}}
      `}</style>
    </div>
  );
}
