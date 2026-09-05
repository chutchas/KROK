"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, TextArea, Field, Notice, Spinner, Pill } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import { Sparkles, FileUp, Pencil, Save, CheckCircle2, Tag, HardHat, Smartphone, FileText } from "lucide-react";
import FormPreview from "@/components/FormPreview";
import FormPaperEditor from "@/components/FormPaperEditor";
import FormEditor from "@/components/FormEditor";
import { countFields, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { SAMPLE_FORM, CHIP_PROMPTS } from "@/lib/sample-form";
import { saveForm, updateForm, deleteForm, saveDraft, setFormStatus } from "./actions";
import type { FormRow } from "./page";
import type { ApprovalStep } from "@/lib/approval";

interface Member { user_id: string; name: string; role: string }
interface Team { id: string; name: string }
type VisMode = "all" | "teams" | "users";
type ViewMode = "mobile" | "paper" | "edit";

export default function StudioClient({ initialForms, members, teams }: { initialForms: FormRow[]; members: Member[]; teams: Team[] }) {
  const { t, tt } = useT();
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ t: string; err?: boolean } | null>(null);
  const [listFilter, setListFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [tab, setTab] = useState<"new" | "edit" | "all">("new");
  const fileRef = useRef<HTMLInputElement>(null);

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
      setView("edit");
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
    callGenerate({ prompt }, t("studio.busyGenerate"));
  }

  function refineDraft() {
    if (!refine.trim() || !draft) return;
    callGenerate({ schema: draft, instruction: refine }, t("studio.busyRefine"));
    setRefine("");
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
      setView("edit");
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
    setRequiresApproval(false);
    setChain([]);
    setVisMode("all");
    setVisTeams([]);
    setVisUsers([]);
    setStatus(null);
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
    setView("edit");
    setRequiresApproval(f.requires_approval);
    setChain(f.approval_chain || []);
    setVisMode(f.visibility || "all");
    setVisTeams(f.visible_teams || []);
    setVisUsers(f.visible_users || []);
    setStatus(null);
    setView("edit");
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
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("studio.title")}</h2>
            <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("studio.subtitle")}</p>
          </div>
          <button
            onClick={() => { setDraft(JSON.parse(JSON.stringify(SAMPLE_FORM))); setEditingId(null); setStatus(null); setView("edit"); setTab("edit"); }}
            disabled={!!busy}
            style={{ background: "none", border: "none", color: "var(--brand-ink)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", flex: "0 0 auto" }}
          >
            {t("studio.sample")}
          </button>
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
            <TextArea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("studio.promptPlaceholder")} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              {CHIP_PROMPTS.map((p) => (
                <button key={p} onClick={() => setPrompt(p)} style={{ fontSize: ".8rem", padding: "5px 12px", borderRadius: 20, background: "var(--code-bg)", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}>
                  {p}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={generate} disabled={!!busy}>
              <Icon icon={Sparkles} className="h-4 w-4" /> {t("studio.generate")}
            </Button>
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
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flex: "0 0 auto", flexWrap: "wrap" }}>
              {([
                { m: "mobile" as ViewMode, icon: Smartphone, label: t("studio.viewMobile") },
                { m: "paper" as ViewMode, icon: FileText, label: t("studio.viewPaper") },
                { m: "edit" as ViewMode, icon: Pencil, label: t("studio.editFields") },
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
          </div>

          {view === "edit" ? (
            <div style={{ marginTop: 12 }}>
              <FormEditor value={draft} onChange={(s) => setDraft(s)} />
            </div>
          ) : view === "paper" ? (
            <FormPaperEditor schema={draft} onChange={(s) => setDraft(s)} />
          ) : (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              <div style={{ width: "100%", maxWidth: 390, border: "10px solid var(--ink)", borderRadius: 30, padding: "10px 12px 16px", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
                <div style={{ width: 90, height: 5, background: "var(--line)", borderRadius: 3, margin: "2px auto 10px" }} />
                <FormPreview schema={draft} />
              </div>
            </div>
          )}

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 14 }}>
            <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.refineTitle")}</b>
            <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 8px" }}>
              {t("studio.refineSub")}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field value={refine} onChange={(e) => setRefine(e.target.value)} placeholder={t("studio.refinePlaceholder")} style={{ flex: 1, minWidth: 200 }} />
              <Button onClick={refineDraft} disabled={!!busy}>{t("studio.refineBtn")}</Button>
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
              {(["all", "teams", "users"] as VisMode[]).map((m) => {
                const on = visMode === m;
                const label = m === "all" ? t("studio.visAll") : m === "teams" ? t("studio.visTeams") : t("studio.visUsers");
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
            <Button variant="primary" onClick={publish} disabled={!!busy}><Icon icon={editingId ? Save : CheckCircle2} className="h-4 w-4" /> {editingId ? t("studio.saveChanges") : t("studio.publish")}</Button>
            {!editingId && <Button onClick={saveAsDraft} disabled={!!busy}><Icon icon={FileText} className="h-4 w-4" /> {t("studio.saveDraft")}</Button>}
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

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 14px" }}>
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
          {initialForms.filter((f) => listFilter === "all" || f.status === listFilter).map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--surface)", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>{f.icon}</div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>{" "}
                {f.status === "published" ? <Pill kind="pass">{t("studio.stPublished")}</Pill> : f.status === "draft" ? <Pill kind="na">{t("studio.stDraft")}</Pill> : <Pill kind="fail">{t("studio.stArchived")}</Pill>}
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {tt("forms.stepsFields", { steps: f.schema.steps.length, fields: countFields(f.schema) })}
                </small>
              </div>
              <Button onClick={() => editExisting(f)}><Icon icon={Pencil} className="h-4 w-4" /> {t("common.edit")}</Button>
              {f.status === "published" ? (
                <>
                  <Button onClick={() => router.push(`/fill/${f.id}`)}>{t("studio.openFill")}</Button>
                  <Button onClick={() => changeStatus(f.id, "archived")}>{t("studio.cancelForm")}</Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => changeStatus(f.id, "published")}><Icon icon={CheckCircle2} className="h-4 w-4" /> {f.status === "draft" ? t("studio.publishNow") : t("studio.restore")}</Button>
              )}
              <Button variant="danger" onClick={() => onDelete(f.id, f.title)}>{t("common.delete")}</Button>
            </div>
          ))}
        </div>
      </Card>
      )}
    </div>
  );
}
