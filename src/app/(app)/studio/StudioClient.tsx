"use client";
import OverflowMenu from "@/components/OverflowMenu";
import IconPicker from "@/components/IconPicker";
import FormIcon from "@/components/FormIcon";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, AsyncButton, Card, TextArea, Field, Notice, Spinner, Pill } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import HelpTip from "@/components/HelpTip";
import { getTemplate } from "@/lib/form-templates";
import { Sparkles, FileUp, LayoutTemplate, Pencil, Save, CheckCircle2, Tag, HardHat, Smartphone, FileText, Globe, QrCode, Share2, Layers, Factory, Archive, Trash2, Search as SearchIcon, TabletSmartphone, History, MapPin, Settings2, ChevronLeft, X, Hash, CircleAlert, PanelLeftClose, PanelLeftOpen, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import FormPreview from "@/components/FormPreview";
import { keepClearOnGrow } from "@/lib/paper-layout";
import FormPaperView from "@/components/FormPaperView";
import FieldSettingsPanel from "@/components/FieldSettingsPanel";
import DefectSuggestBanner from "@/components/DefectSuggestBanner";
import { resolveTheme, type WorkspaceBranding } from "@/lib/theme";
import FormDevicePicker from "@/components/FormDevicePicker";
import type { ShareValue } from "@/components/ShareScopeModal";
import { cleanDocPrefix, countFields, docNoPreview, sanitizeSchema, type DocNoConfig, type DocNoEra, type DocNoReset, type FormSchema } from "@/lib/form-schema";
import { assigneeLabel } from "@/lib/case-flow";
import { PROMPTS_BY_TASK, PROMPTS_BY_INDUSTRY, buildPrompt } from "@/lib/prompt-library";
import { FORM_CATEGORIES, isPresetCategory, categoryLabel } from "@/lib/form-categories";
import { saveForm, updateForm, deleteForm, saveDraft, setFormStatus, loadFormSchema } from "./actions";
import type { FormRow } from "./page";
import type { ApprovalStep } from "@/lib/approval";
import { alertDialog, confirmDialog } from "@/components/dialogs";
import dynamic from "next/dynamic";
import { useUndo } from "@/lib/use-undo";
import { blockLabel, duplicateField, moveInOrder, removeBlock } from "@/lib/editor-ops";
import { printWhenReady } from "@/lib/print";

// ส่วนที่เปิดเฉพาะเมื่อใช้งาน — แยก bundle ออกจากหน้า Studio (โหลดหน้าแรกเร็วขึ้น)
const TemplateGallery = dynamic(() => import("./TemplateGallery"), { ssr: false });
const FormPaperEditor = dynamic(() => import("@/components/FormPaperEditor"), { ssr: false, loading: () => <div style={{ padding: 24, display: "flex", justifyContent: "center" }}><Spinner /></div> });
const AttachmentsPanel = dynamic(() => import("@/components/AttachmentsPanel"), { ssr: false });
const QrModal = dynamic(() => import("@/components/QrModal"), { ssr: false });
const ShareScopeModal = dynamic(() => import("@/components/ShareScopeModal"), { ssr: false });
const FormSchedulePanel = dynamic(() => import("@/components/FormSchedulePanel"), { ssr: false });

interface Member { user_id: string; name: string; role: string }
interface Team { id: string; name: string }
type VisMode = "public" | "all" | "teams" | "users";
type ViewMode = "mobile" | "paper";

type FormTab = "access" | "approval" | "fill" | "schedule";

/** คำสั่งตัวอย่างที่แสดงก่อนกด "ดูทั้งหมด" */
const PROMPT_PREVIEW = 6;

export default function StudioClient({ initialForms, members, teams, tenantId, template = null, initialMode = "prompt", branding = null, initialEditId = null, initialView = null }: { initialView?: "all" | null; initialForms: FormRow[]; members: Member[]; teams: Team[]; tenantId: string; template?: unknown; initialMode?: "prompt" | "file" | "template"; branding?: WorkspaceBranding | null; initialEditId?: string | null }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [createMode, setCreateMode] = useState<"prompt" | "file" | "template">(initialMode);
  // เปิดจากคลังเทมเพลต → เริ่มที่หน้าแก้ไขพร้อมร่างจากเทมเพลต (ยังไม่บันทึกจนกว่าจะกดเผยแพร่)
  const [draft, setDraft] = useState<FormSchema | null>(() => (template ? sanitizeSchema(template) : null));
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [requireDevice, setRequireDevice] = useState(false);
  const [deviceScope, setDeviceScope] = useState<"any" | "selected">("any");
  const [chain, setChain] = useState<ApprovalStep[]>([]);
  const [visMode, setVisMode] = useState<VisMode>("all");
  const [visTeams, setVisTeams] = useState<string[]>([]);
  const [visUsers, setVisUsers] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>("mobile");
  const [selKey, setSelKey] = useState<string | null>(null);
  /** โครงฟอร์มด้านซ้าย: auto = กางที่จอ ≥1280 / หุบเป็นแถบเลขขั้นที่ 900–1279 · open/closed = ผู้ใช้เลือกเอง (จำในเบราว์เซอร์) */
  const [outline, setOutline] = useState<"auto" | "open" | "closed">("auto");
  useEffect(() => {
    try {
      const v = localStorage.getItem("krok_studio_outline");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage หลัง mount (SSR ไม่มี)
      if (v === "open" || v === "closed") setOutline(v);
    } catch { /* ไม่มี storage = auto */ }
  }, []);
  /** เลือกขั้นจากโครงฟอร์ม แล้วเลื่อนตัวอย่างไปที่หัวขั้นนั้น (เหมือนกดชื่อช่อง) */
  const selectStep = (sid: string) => {
    setSelKey(`s:${sid}`);
    requestAnimationFrame(() => document.getElementById(`fp-s-${sid}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  /** หัวหน้าแก้ไขตรึงบนจอ (≥900) — วัดความสูงจริงให้แผงซ้าย/ขวาตรึงต่อใต้หัว */
  const editHeadRef = useRef<HTMLDivElement>(null);
  const setOutlinePref = (v: "open" | "closed") => {
    setOutline(v);
    try { localStorage.setItem("krok_studio_outline", v); } catch { /* จำไม่ได้ก็ไม่เป็นไร */ }
  };
  // ตั้งค่าระดับฟอร์ม: แท็บที่เปิดอยู่ · จอแคบ = เปิดเป็นแผงลอยด้วยปุ่ม "ตั้งค่าฟอร์ม"
  const [formTab, setFormTab] = useState<FormTab>("access");
  const [formPanel, setFormPanel] = useState(false);
  // มุมมองมือถือ: ทั้งหมด (แก้ง่าย) / ทีละขั้น (เหมือนหน้ากรอกจริง)
  const [previewPaged, setPreviewPaged] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** schema ตอนเปิดฟอร์มเดิม — draft คนละตัว = มีการแก้ (ใช้ตัดสินว่าต้องเก็บงานค้างไหม) */
  const [loadedSchema, setLoadedSchema] = useState<FormSchema | null>(null);
  // แยกช่องต่อฟอร์ม (เดิมช่องเดียวต่อ workspace — แก้ฟอร์ม B ค้างแล้วทับงานค้างของฟอร์ม A)
  const draftPrefix = `krok_studio_draft:${tenantId}:`;
  const draftKey = draftPrefix + (editingId || "new");
  const [pendingRestore, setPendingRestore] = useState<SavedDraft | null>(null);
  const clearSavedDraft = (key = draftKey) => { try { sessionStorage.removeItem(key); } catch { /* ไม่มีก็ไม่เป็นไร */ } };
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ t: string; err?: boolean } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [listFilter, setListFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  /** ข้อความยืนยันหลังบันทึก (แสดงบนแท็บทั้งหมด) */
  const [flash, setFlash] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [customCat, setCustomCat] = useState(false);
  // ?edit=<id> ที่เจอฟอร์ม → เริ่มที่แท็บแก้ไขเลย (ไม่ให้หน้าสร้างใหม่โผล่ขึ้นก่อนระหว่างโหลดฟอร์ม)
  const urlEditForm = initialEditId ? initialForms.find((x) => x.id === initialEditId) : undefined;
  const [tab, setTab] = useState<"new" | "edit" | "all">(template || urlEditForm ? "edit" : initialView === "all" ? "all" : "new");
  const hasEditHead = tab === "edit" && !!draft;
  useEffect(() => {
    const el = editHeadRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--krok-eh", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--krok-eh"); };
    // รันใหม่เฉพาะตอนหัวหน้าแก้ไขโผล่/หาย — เดิมไม่มี deps ลบตัวแปรทิ้งทุก render (กดขั้นใน outline แล้วชื่อขั้นจมใต้หัว)
  }, [hasEditHead]);
  const [openingFromUrl, setOpeningFromUrl] = useState(!!urlEditForm);
  const [promptGroupBy, setPromptGroupBy] = useState<"task" | "industry">("task");
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [qrForm, setQrForm] = useState<FormRow | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [shareForm, setShareForm] = useState<FormRow | null>(null);
  const [origin, setOrigin] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    // เปิดจากเทมเพลต/ลิงก์โหมดแล้ว เอา ?tpl / ?mode ออกจาก URL — refresh ทีหลังจะไม่เปิดร่างเทมเพลตซ้ำ
    if (/[?&](tpl|mode)=/.test(window.location.search)) window.history.replaceState(null, "", "/studio");
  }, []);

  const fillUrl = (f: FormRow) => `${origin}${f.visibility === "public" ? "/f/" : "/fill/"}${f.id}`;
  const studioCats = Array.from(new Set(initialForms.map((f) => f.summary.category).filter((c): c is string => !!c)));

  async function saveAsDraft() {
    if (!draft) return;
    setStatus(null);
    setBusy(t("studio.busySaveDraft"));
    const visibility = { mode: visMode, teamIds: visTeams, userIds: visUsers };
    let res: { id: string } | { error: string };
    try {
      res = editingId
        ? await updateForm(editingId, draft, requiresApproval, requiresApproval ? chain : [], visibility, requireDevice, deviceScope, versionNote)
        : await saveDraft(draft, requiresApproval, requiresApproval ? chain : [], visibility, requireDevice, deviceScope);
    } catch {
      // เรียก server ไม่สำเร็จ (เน็ต/ข้อมูลใหญ่เกิน) — เดิมเงียบ ปุ่มกดแล้วไม่มีอะไรเกิดขึ้น
      res = { error: t("studio.saveFailedNet") };
    } finally {
      setBusy(null);
    }
    if ("error" in res) { setStatus({ t: res.error, err: true }); return; }
    const title = draft.title;
    resetDraft();
    setTab("all");
    setFlash(tt("studio.draftSaved", { title }));
    router.refresh();
  }

  async function changeStatus(id: string, s: "published" | "archived" | "draft") {
    const res = await setFormStatus(id, s);
    if ("error" in res) await alertDialog(res.error);
    else router.refresh();
  }

  /** เลือกเทมเพลต → เปิดเป็นร่างในแท็บแก้ไข (เหมือนผลจาก AI — ยังไม่บันทึกจนกดเผยแพร่) */
  function applyTemplate(id: string) {
    const tpl = getTemplate(id);
    if (!tpl) return;
    setDraft(sanitizeSchema(tpl.schema));
    setEditingId(null);
    setView("mobile");
    setSelKey(null);
    setStatus(null);
    setTab("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // ปรับแก้ฟอร์มที่เปิดอยู่ด้วย AI — คงฟอร์มเดิมไว้ (เดิมล้าง editingId → กดบันทึกแล้วกลายเป็นฟอร์มใหม่ซ้ำอีกใบ)
  async function refineDraft() {
    const instruction = refine.trim();
    if (!instruction || !draft) return;
    setBusy(t("studio.busyRefine"));
    setStatus(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: draft, instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("studio.errAiFail"));
      history.checkpoint(); // ผล AI = 1 ขั้นย้อนกลับ
      const next = sanitizeSchema(json.schema);
      const d = diffFields(draft, next);
      const parts = [d.added && tt("studio.diffAdd", { n: d.added }), d.removed && tt("studio.diffDel", { n: d.removed }), d.changed && tt("studio.diffChg", { n: d.changed })].filter(Boolean);
      setDraft(next);
      setSelKey(null);
      setRefine("");
      showToast(parts.length ? tt("studio.refineDiff", { parts: parts.join(" · ") }) : t("studio.refineDone"), true, next);
    } catch (e) {
      setStatus({ t: e instanceof Error ? e.message : t("studio.errAiFail"), err: true });
    } finally {
      setBusy(null);
    }
  }

  // เลือกไฟล์ → ยังไม่ส่ง AI ทันที เก็บไว้ให้ผู้ใช้ยืนยันก่อน
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setStatus(null);
    setPendingFile(file);
  }

  // ยืนยันแล้วค่อยแปลงเป็นดิจิทัล
  async function runFromFile() {
    const file = pendingFile;
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setBusy(isPdf ? t("studio.busyPdf") : t("studio.busyImage"));
    setStatus(null);
    try {
      const fd = new FormData();
      if (isPdf) {
        // รูปแต่ละหน้า + ข้อความจริงในไฟล์ (AI ใช้สะกดชื่อช่องตามต้นฉบับ)
        const { pdfToPages } = await import("@/lib/pdf-to-image");
        const pages = await pdfToPages(file);
        for (const p of pages.files) fd.append("file", p);
        if (pages.text.some(Boolean)) fd.append("pdf_text", JSON.stringify(pages.text));
      } else {
        // รูปถ่ายจากมือถือมักใหญ่หลาย MB → ย่อให้ส่งผ่าน (ยังคมพอให้อ่านตัวหนังสือ)
        const { fitUploadBudget } = await import("@/lib/pdf-to-image");
        for (const f of await fitUploadBudget([file])) fd.append("file", f);
      }
      const res = await fetch("/api/ai/from-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("studio.errReadFail"));
      setDraft(sanitizeSchema(json.schema));
      setPendingFile(null);
      setEditingId(null);
      setView("mobile");
      setSelKey(null);
      setTab("edit");
    } catch (err) {
      setStatus({ t: err instanceof Error ? err.message : t("studio.errReadFail"), err: true });
    } finally {
      setBusy(null);
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
    setStatus(null);
    setBusy(t("studio.busyPublish"));
    const visibility = { mode: visMode, teamIds: visTeams, userIds: visUsers };
    let res: { id: string } | { error: string };
    try {
      res = editingId
        ? await updateForm(editingId, draft, requiresApproval, requiresApproval ? chain : [], visibility, requireDevice, deviceScope, versionNote)
        : await saveForm(draft, requiresApproval, requiresApproval ? chain : [], visibility, requireDevice, deviceScope);
    } catch {
      res = { error: t("studio.saveFailedNet") };
    } finally {
      setBusy(null);
    }
    if ("error" in res) {
      setStatus({ t: res.error, err: true });
      return;
    }
    const title = draft.title;
    resetDraft();
    setTab("all");
    setFlash(tt(editingId ? "studio.formSaved" : "studio.formPublished", { title }));
    router.refresh();
  }

  function resetDraft() {
    clearSavedDraft();
    setLoadedSchema(null);
    setDraft(null);
    setVersionNote("");
    setPrompt("");
    setEditingId(null);
    setView("mobile");
    setSelKey(null);
    setCustomCat(false);
    setRequiresApproval(false);
    setRequireDevice(false);
    setDeviceScope("any");
    setChain([]);
    setVisMode("all");
    setVisTeams([]);
    setVisUsers([]);
    setStatus(null);
  }

  function doPrint() {
    if (typeof window !== "undefined") void printWhenReady();
  }

  // สร้าง id ใหม่แบบไม่ชน
  const newKey = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // เพิ่มฟิลด์ใหม่ (เข้าขั้นตอนที่กำลังโฟกัส หรือขั้นตอนสุดท้าย) — ไม่ต้องเลือกฟิลด์เดิมก่อน
  function addField(stepIndex?: number) {
    if (!draft) return;
    if (draft.steps.length === 0) { addStep(); return; }
    // ปลายทาง: ขั้นตอนที่ระบุ → ขั้นตอนที่กำลังโฟกัสจาก selKey → ขั้นตอนสุดท้าย
    let si = draft.steps.length - 1;
    if (stepIndex != null && stepIndex >= 0 && stepIndex < draft.steps.length) {
      si = stepIndex;
    } else if (selKey) {
      if (selKey.startsWith("s:")) {
        const idx = draft.steps.findIndex((s) => s.id === selKey.slice(2));
        if (idx >= 0) si = idx;
      } else {
        const idx = draft.steps.findIndex((s) => s.fields.some((f) => f.id === selKey));
        if (idx >= 0) si = idx;
      }
    }
    const fid = newKey("f");
    setDraft({ ...draft, steps: draft.steps.map((s, i) => (i === si ? { ...s, fields: [...s.fields, { id: fid, type: "text", label: "", required: true }] } : s)) });
    setSelKey(fid);
  }

  // เพิ่มขั้นตอนใหม่ — ไม่ต้องเลือกฟิลด์เดิมก่อน
  // มุมมองมือถือ: ลากย้ายฟิลด์ (ในขั้นตอนเดียวกันหรือข้ามขั้นตอน) · toIndex นับในรายการเดิมของขั้นตอนปลายทาง
  function moveField(fieldId: string, toStep: number, toIndex: number) {
    if (!draft || toStep < 0 || toStep >= draft.steps.length) return;
    const fromStep = draft.steps.findIndex((st) => st.fields.some((f) => f.id === fieldId));
    if (fromStep < 0) return;
    const fromIndex = draft.steps[fromStep].fields.findIndex((f) => f.id === fieldId);
    let idx = toIndex;
    if (fromStep === toStep && fromIndex < toIndex) idx -= 1;
    if (fromStep === toStep && idx === fromIndex) return;
    const field = draft.steps[fromStep].fields[fromIndex];
    const steps = draft.steps.map((st) => ({ ...st, fields: st.fields.filter((f) => f.id !== fieldId) }));
    const target = steps[toStep].fields;
    steps[toStep] = { ...steps[toStep], fields: [...target.slice(0, idx), field, ...target.slice(idx)] };
    setDraft({ ...draft, steps });
    // จอ ≥900: เลือกช่องที่เพิ่งย้าย (แผงขวาแสดงตาม) · จอ <900 การเลือก = เปิดแผ่นตั้งค่าบังจอ → ไม่เลือก ไม่ต้องคอยปิดหลังลากทุกครั้ง
    if (!narrow) setSelKey(fieldId);
  }

  function addStep() {
    if (!draft) return;
    const id = newKey("s");
    setDraft({ ...draft, steps: [...draft.steps, { id, title: "", fields: [{ id: newKey("f"), type: "text", label: "", required: true }] }] });
    setSelKey(`s:${id}`);
  }

  // ---- ย้อนกลับ/ทำซ้ำ + คีย์ลัดที่ใช้ได้ทั้งมุมมองมือถือและกระดาษ ----
  const history = useUndo(draft, setDraft);
  const [toast, setToast] = useState<{ msg: string; undo?: boolean; base?: FormSchema } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string, undo = false, base?: FormSchema) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, undo, base });
    // มี base = ค้างไว้จนกดปิด/แก้ต่อ (ผล AI ต้องมีเวลาตรวจ) · ไม่มี = หายเองใน 5 วิ
    if (!base) toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  const doUndo = useCallback(() => { if (history.undo()) { setSelKey(null); setToast(null); } }, [history]);
  const doRedo = useCallback(() => { if (history.redo()) setSelKey(null); }, [history]);
  /** ลบบล็อก (ฟิลด์ / ขั้นตอน / ซ่อนหัวเอกสาร) แล้วให้เลิกทำได้จากแถบแจ้งเตือน */
  const deleteKey = useCallback((key: string) => {
    if (!draft) return;
    const next = removeBlock(draft, key);
    if (!next) { showToast(t("kb.lastStep")); return; }
    const name = blockLabel(draft, key);
    history.checkpoint();
    setDraft(next);
    setSelKey(null);
    showToast(name ? tt("kb.deletedNamed", { name }) : t("kb.deleted"), true);
  }, [draft, showToast, t, tt, history]);
  const moveKey = useCallback((key: string, dir: -1 | 1) => {
    if (!draft) return;
    const next = moveInOrder(draft, key, dir);
    if (next) { history.checkpoint(); setDraft(next); }
  }, [draft, history]);
  /** ทำสำเนาช่องต่อท้ายต้นฉบับ แล้วเลือกช่องใหม่ (เลิกทำได้) */
  const duplicateKey = useCallback((key: string) => {
    if (!draft) return;
    const id = newKey("f");
    const next = duplicateField(draft, key, id);
    if (next) { history.checkpoint(); setDraft(next); setSelKey(id); }
  }, [draft, history]);

  useEffect(() => {
    if (tab !== "edit" || !draft) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      // กำลังพิมพ์ในช่อง / มีหน้าต่างซ้อนเปิดอยู่ → ไม่ยุ่ง
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog]:not(.krok-aside), [role=alertdialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && k === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (mod && !e.altKey && k === "y") { e.preventDefault(); doRedo(); return; }
      if (!selKey || mod) return;
      if (k === "delete" || k === "backspace") { e.preventDefault(); deleteKey(selKey); return; }
      if (k === "escape") { setSelKey(null); return; }
      if (e.altKey && (k === "arrowup" || k === "arrowdown")) { e.preventDefault(); moveKey(selKey, k === "arrowup" ? -1 : 1); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tab, draft, selKey, doUndo, doRedo, deleteKey, moveKey]);

  // จอ <900: แผงตั้งค่าเป็นแผ่นเลื่อนขึ้น = modal จริง — โฟกัสเข้าแผ่น, Tab วนในแผ่น, หน้าด้านหลังไม่เลื่อน, ปิดแล้วคืนโฟกัส
  const asideRef = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const sheetOpen = narrow && tab === "edit" && !!draft && (!!selKey || formPanel);
  useEffect(() => {
    if (!sheetOpen) return;
    const el = asideRef.current;
    if (!el) return;
    const back = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (document.querySelector("[role=dialog]:not(.krok-aside), [role=alertdialog]")) return; // dialog ยืนยันซ้อนอยู่
      if (e.key === "Escape") { e.preventDefault(); setSelKey(null); setFormPanel(false); return; }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
        .filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === el || !el.contains(cur))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (cur === last || !el.contains(cur))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [sheetOpen]);

  // ปิดแผงตั้งค่าฟิลด์อัตโนมัติเมื่อคลิกที่ว่างนอกแผง (เดสก์ท็อป)
  useEffect(() => {
    if (!selKey) return;
    function onDown(e: PointerEvent) {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      // คลิกในแผงตั้งค่า (ทั้งคอลัมน์ขวา) / หน้าต่างลอยที่เปิดจากแผง (dialog) → คงการเลือกไว้
      if (el.closest(".krok-aside, .krok-settings, [data-krok-keep], [role=dialog], [role=alertdialog]")) return;
      setSelKey(null);
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selKey]);

  // ค่าตั้งที่อยู่นอก schema (สายอนุมัติ/การมองเห็น/อุปกรณ์) — undo ไม่ได้จับ จึงเทียบกับตอนเปิดฟอร์มเอง
  const [settingsBase, setSettingsBase] = useState<string | null>(null);
  const settingsSnap = () => JSON.stringify([requiresApproval, requireDevice, deviceScope, chain, visMode, visTeams, visUsers, versionNote.trim()]);

  // ยกเลิก/ปิดการแก้ไข → กลับไปแท็บที่เหมาะสม
  async function cancelDraft() {
    const wasEditing = !!editingId;
    // มีงานที่ยังไม่บันทึก (ฟอร์มใหม่ทั้งฟอร์ม หรือแก้ฟอร์มเดิมไปแล้ว) → ถามก่อน (ปุ่มนี้อยู่ติดปุ่มบันทึก)
    const unsaved = !wasEditing || history.canUndo() || settingsBase !== settingsSnap();
    if (unsaved && !(await confirmDialog({
      title: wasEditing ? t("studio.cancelConfirmTitle") : t("studio.discardConfirmTitle"),
      message: wasEditing ? t("studio.cancelConfirm") : t("studio.discardConfirm"),
      confirmLabel: wasEditing ? t("studio.cancelConfirmBtn") : t("studio.discard"),
      cancelLabel: t("studio.keepEditing"),
      danger: true,
    }))) return;
    resetDraft();
    setTab(wasEditing ? "all" : "new");
  }

  async function editExisting(f: FormRow) {
    let schema = f.schema;
    if (!schema) {
      // เน็ตหลุด/ค้าง → ไม่ปล่อยปุ่มหมุนค้างเงียบๆ: ตัดที่ 20 วินาทีแล้วบอกให้ลองใหม่
      let res: Awaited<ReturnType<typeof loadFormSchema>>;
      try {
        res = await Promise.race([
          loadFormSchema(f.id),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20_000)),
        ]);
      } catch {
        await alertDialog(t("studio.loadFormFailed"));
        return;
      }
      if ("error" in res) { await alertDialog(res.error); return; }
      schema = res.schema;
    }
    setDraft(schema);
    history.reset(schema); // ไม่ให้ Ctrl+Z ย้อนไปเป็นฟอร์มที่เปิดก่อนหน้า
    setLoadedSchema(schema);
    setEditingId(f.id);
    setView("mobile");
    setSelKey(null);
    setRequiresApproval(f.requires_approval);
    setRequireDevice(!!f.require_approved_device);
    setDeviceScope(f.device_scope === "selected" ? "selected" : "any");
    setChain(f.approval_chain || []);
    setVisMode(f.visibility || "all");
    setVisTeams(f.visible_teams || []);
    setVisUsers(f.visible_users || []);
    setVersionNote("");
    setSettingsBase(JSON.stringify([f.requires_approval, !!f.require_approved_device, f.device_scope === "selected" ? "selected" : "any", f.approval_chain || [], f.visibility || "all", f.visible_teams || [], f.visible_users || [], ""]));
    setStatus(null);
    setView("mobile");
    setTab("edit");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- งานที่ยังไม่บันทึก: เก็บไว้ในแท็บนี้ (sessionStorage) — refresh/ปิดเปิดหน้าแล้วกู้คืนได้ ----
  // เดิม refresh = draft ใหม่/การแก้ที่ยังไม่บันทึกหายเงียบ ๆ (ตอนนี้มี URL จริงแล้ว คนกด refresh/Back บ่อยขึ้น)
  const dirty = tab === "edit" && !!draft && !openingFromUrl && (!editingId || draft !== loadedSchema || settingsBase !== settingsSnap());
  useEffect(() => {
    if (!dirty || !draft) return;
    const t = window.setTimeout(() => {
      const saved: SavedDraft = { v: 1, at: Date.now(), editingId, draft, settings: { requiresApproval, requireDevice, deviceScope, chain, visMode, visTeams, visUsers, versionNote } };
      try { sessionStorage.setItem(draftKey, JSON.stringify(saved)); } catch { /* เต็ม/ปิดใช้ — เตือนก่อนออกยังทำงาน */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [dirty, draft, editingId, requiresApproval, requireDevice, deviceScope, chain, visMode, visTeams, visUsers, versionNote, draftKey]);
  // คอม: เตือนก่อนปิดแท็บ/refresh (Safari บน iPhone มักไม่ถาม — ตัวกันงานหายจริงคือที่เก็บไว้ด้านบน)
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);
  // เปิดหน้าใหม่แล้วเจองานค้าง → ถามก่อน (ไม่กู้คืนเงียบ ๆ — อาจมีคนบันทึกฟอร์มนี้จากเครื่องอื่นไปแล้ว)
  useEffect(() => {
    // งานค้างล่าสุดของ workspace นี้ (ทุกฟอร์ม) — เสนอกู้คืนทีละชิ้น
    let best: SavedDraft | null = null;
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !k.startsWith(draftPrefix)) continue;
        const v = JSON.parse(sessionStorage.getItem(k) || "null") as SavedDraft | null;
        if (v && v.v === 1 && v.draft && (!best || v.at > best.at)) best = v;
      }
    } catch { best = null; }
    if (!best) return;
    const found = best;
    void Promise.resolve().then(() => setPendingRestore(found));
  }, [draftPrefix]);
  function restoreSaved(saved: SavedDraft) {
    const f = saved.editingId ? initialForms.find((x) => x.id === saved.editingId) : undefined;
    const schema = sanitizeSchema(saved.draft);
    setDraft(schema);
    history.reset(schema);
    setLoadedSchema(null); // งานที่กู้มา = ยังไม่บันทึก
    setEditingId(f ? f.id : null);
    setSettingsBase(f ? JSON.stringify([f.requires_approval, !!f.require_approved_device, f.device_scope === "selected" ? "selected" : "any", f.approval_chain || [], f.visibility || "all", f.visible_teams || [], f.visible_users || [], ""]) : null);
    const st = saved.settings;
    setRequiresApproval(st.requiresApproval); setRequireDevice(st.requireDevice); setDeviceScope(st.deviceScope);
    setChain(st.chain); setVisMode(st.visMode); setVisTeams(st.visTeams); setVisUsers(st.visUsers); setVersionNote(st.versionNote);
    setView("mobile"); setSelKey(null); setStatus(null);
    setPendingRestore(null);
    setOpeningFromUrl(false);
    setTab("edit");
  }

  // ?edit=<id> (ลิงก์จากคลังรูป ฯลฯ) → เปิดฟอร์มนั้นในหน้าแก้ไขครั้งเดียว
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || !initialEditId) return;
    openedFromUrl.current = true;
    const f = initialForms.find((x) => x.id === initialEditId);
    if (f) void Promise.resolve().then(() => editExisting(f)).finally(() => setOpeningFromUrl(false));
  });

  async function onDelete(id: string, title: string) {
    if (!(await confirmDialog({ message: tt("studio.deleteConfirm", { title }), danger: true }))) return;
    const res = await deleteForm(id);
    if ("error" in res) await alertDialog(res.error);
    else router.refresh();
  }

  // ชื่อผู้รับผิดชอบขั้น (ปุ่ม "ส่งต่อให้ …" ในมุมมองทีละขั้น)
  const stepLabel = (i: number) => draft ? assigneeLabel(draft, i,
    Object.fromEntries(teams.map((x) => [x.id, x.name])), Object.fromEntries(members.map((m) => [m.user_id, m.name])),
    { team: (name: string) => tt("wf.teamName", { name }), deletedTeam: t("wf.deletedTeam"), goneUser: t("wf.goneUser") }) : null;

  // ===== ตั้งค่าระดับฟอร์ม (แผงขวา · แบ่งแท็บ) — ทุกแท็บ mount ค้างไว้ (ซ่อนด้วย display) ค่าที่กรอกค้างในแผงย่อยจึงไม่หายตอนสลับแท็บ
  const formTabs: { k: FormTab; label: string; on: boolean }[] = [
    { k: "access", label: t("fs.tab.access"), on: visMode !== "all" || requireDevice },
    { k: "approval", label: t("fs.tab.approval"), on: requiresApproval },
    { k: "fill", label: t("fs.tab.fill"), on: !!draft?.geo || !!draft?.watermark || !!draft?.doc_no || !!draft?.review },
    { k: "schedule", label: t("fs.tab.schedule"), on: false },
  ];
  // ชื่อแท็บเบราว์เซอร์ตอนแก้ฟอร์ม = ชื่อฟอร์ม (เดิมเป็น "สร้างฟอร์ม" ทุกฟอร์ม)
  useEffect(() => {
    if (tab !== "edit" || !draft?.title) return;
    const prev = document.title;
    document.title = `${draft.title} — ${editingId ? t("studio.crumbEdit") : t("studio.crumbNew")} · KROK`;
    // คืนชื่อเดิมเฉพาะเมื่อยังอยู่ใน Studio — ออกไปหน้าอื่นแล้วไม่ทับชื่อของหน้าใหม่
    return () => { if (window.location.pathname.startsWith("/studio")) document.title = prev; };
  }, [tab, draft?.title, editingId, t]);
  useEffect(() => {
    if (tab !== "all") return;
    const prev = document.title;
    document.title = `${t("studio.allFormsTitle")} · KROK`;
    // คืนชื่อเดิมเฉพาะเมื่อยังอยู่ใน Studio — ออกไปหน้าอื่นแล้วไม่ทับชื่อของหน้าใหม่
    return () => { if (window.location.pathname.startsWith("/studio")) document.title = prev; };
  }, [tab, t]);

  // หน้ารายการ/แก้ไข มี URL ของตัวเอง — refresh/Back/ส่งลิงก์ได้ (สร้างใหม่ = /studio · ทั้งหมด = ?view=all · แก้ไข = ?edit=<id>)
  const syncedTab = useRef<string | null>(null);
  useEffect(() => {
    if (openingFromUrl) return;
    const want = tab === "all" ? "/studio?view=all" : tab === "edit" && draft ? (editingId ? `/studio?edit=${editingId}` : "/studio?view=edit") : "/studio";
    const cur = window.location.pathname + window.location.search;
    if (cur !== want) {
      // เปลี่ยนหน้า (แท็บ) = รายการใหม่ในประวัติ · อย่างอื่น (เปิดครั้งแรก/ได้ id หลังบันทึก) = แทนที่
      if (syncedTab.current !== null && syncedTab.current !== tab) window.history.pushState(null, "", want);
      else window.history.replaceState(null, "", want);
    }
    syncedTab.current = tab;
  }, [tab, editingId, draft, openingFromUrl]);
  useEffect(() => {
    function onPop() {
      const q = new URLSearchParams(window.location.search);
      // Back จากหน้าแก้ไข → ร่างยังอยู่ (ปุ่ม "กลับไปแก้ต่อ") ไม่ทิ้งงาน
      const next = q.get("view") === "all" ? "all" : (q.get("edit") || q.get("view") === "edit") && draft ? "edit" : "new";
      syncedTab.current = next;
      setTab(next);
      setFlash(null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [draft]);
  const formSettings = draft && (
    <div className="krok-fs">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon icon={Settings2} className="h-4 w-4" />
        <h2 style={{ fontFamily: "var(--font-anuphan)", flex: 1, fontSize: "var(--fs-h2)", margin: 0 }}>{t("fs.title")}</h2>
        {formPanel && (
          <button type="button" className="krok-fs-close" onClick={() => setFormPanel(false)} aria-label={t("common.close")}
            style={{ border: "none", background: "none", color: "var(--ink-2)", cursor: "pointer", display: "flex", padding: 4 }}><Icon icon={X} className="h-5 w-5" /></button>
        )}
      </div>
      <p style={{ fontSize: ".78rem", color: "var(--ink-2)", margin: "0 0 10px" }}>{t("fs.hint")}</p>
          {/* ข้อมูลฟอร์ม: ไอคอน/ชื่อ + ประเภท / คำอธิบาย — อยู่ในตั้งค่าฟอร์ม (หน้าแก้ไขเหลือแต่ตัวอย่างฟอร์ม) */}
          <div className="krok-fs-sec" style={{ display: "grid", gap: 8, paddingTop: 0 }}>
            <h3 style={{ fontSize: ".9rem", margin: 0 }}>{t("studio.formInfo")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <IconPicker value={draft.icon} onChange={(icon) => setDraft({ ...draft, icon })} />
              <Field value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("editor.formTitle")} aria-label={t("editor.formTitle")} style={{ flex: 1, minWidth: 160 }} />
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)" }}>
              {t("studio.category")}
              <select
                className="krok-typefilter"
                value={draft.category ? (isPresetCategory(draft.category) ? draft.category : "__custom") : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom") { setCustomCat(true); setDraft({ ...draft, category: isPresetCategory(draft.category) || !draft.category ? "" : draft.category }); }
                  else { setCustomCat(false); setDraft({ ...draft, category: v || undefined }); }
                }}
                style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 400, width: "100%" }}
              >
                <option value="">{t("studio.categoryNone")}</option>
                {FORM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{lang === "en" ? c.en : c.th}</option>)}
                <option value="__custom">{t("studio.categoryCustom")}</option>
              </select>
            </label>
            {(customCat || (!!draft.category && !isPresetCategory(draft.category))) && (
              <Field value={!isPresetCategory(draft.category) ? (draft.category || "") : ""} onChange={(e) => setDraft({ ...draft, category: e.target.value || undefined })} placeholder={t("studio.categoryCustomPh")} maxLength={60} />
            )}
            <label style={{ display: "grid", gap: 4, fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)" }}>
              {t("studio.descLabel")}
              <Field value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("editor.formDesc")} style={{ fontWeight: 400 }} />
            </label>
          </div>

      <div role="tablist" aria-label={t("fs.title")} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 2, border: "1px solid var(--line)", borderRadius: 10, padding: 3, background: "var(--surface-2)" }}>
        {formTabs.map((x) => {
          const on = formTab === x.k;
          return (
            <button key={x.k} type="button" role="tab" aria-selected={on} onClick={() => setFormTab(x.k)}
              style={{ position: "relative", padding: "7px 4px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                background: on ? "var(--surface)" : "transparent", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500, boxShadow: on ? "0 1px 3px rgba(10,14,18,.12)" : "none" }}>
              {x.label}
              {x.on && <span aria-label={t("fs.tabOn")} style={{ position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" style={{ display: formTab === "access" ? "block" : "none" }}>
          <div className="krok-fs-sec">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.visTitle")}</b>
              <HelpTip id="visibility" />
            </div>
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
                      color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
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
          {/* ล็อคให้กรอกได้เฉพาะเครื่องที่อนุมัติแล้ว */}
          <div className="krok-fs-sec">
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: visMode === "public" ? "not-allowed" : "pointer", opacity: visMode === "public" ? 0.55 : 1 }}>
              <input
                type="checkbox"
                checked={requireDevice && visMode !== "public"}
                disabled={visMode === "public"}
                onChange={(e) => setRequireDevice(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }}
              />
              <span>
                <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon icon={TabletSmartphone} className="h-4 w-4" /> {t("studio.devLock")}
                </b>
                <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".85rem" }}>
                  {visMode === "public"
                    ? t("studio.devLockPublic")
                    : t("studio.devLockHint")}
                </span>
              </span>
            </label>
            <HelpTip id="devices" />

            {requireDevice && visMode !== "public" && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  {([
                    { v: "any" as const, label: t("studio.devAny"), sub: t("studio.devAnySub") },
                    { v: "selected" as const, label: t("studio.devSelected"), sub: t("studio.devSelectedSub") },
                  ]).map((o) => (
                    <label key={o.v} style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", borderRadius: 8, border: `1px solid ${deviceScope === o.v ? "var(--accent)" : "var(--line)"}`, background: deviceScope === o.v ? "var(--accent-soft)" : "var(--surface)" }}>
                      <input type="checkbox" checked={deviceScope === o.v} onChange={() => setDeviceScope(o.v)} style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--accent)" }} />
                      <span>
                        <b style={{ fontSize: ".88rem", fontFamily: "var(--font-anuphan)" }}>{o.label}</b>
                        <span style={{ display: "block", fontSize: ".78rem", color: "var(--ink-3)" }}>{o.sub}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {deviceScope === "selected" && <FormDevicePicker formId={editingId} />}
              </div>
            )}
          </div>
      </div>

      <div role="tabpanel" style={{ display: formTab === "approval" ? "block" : "none" }}>
          <div className="krok-fs-sec">
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }} />
              <span>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("studio.approvalTitle")}</b>
                <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".85rem" }}>
                  {t("studio.approvalSub")}
                </span>
              </span>
            </label>
            <HelpTip id="approval" />

            {requiresApproval && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
                <div style={{ fontSize: ".88rem", fontWeight: 600, marginBottom: 4 }}>{t("studio.approverOrder")}</div>
                <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "0 0 8px" }}>
                  {chain.length === 0 ? t("studio.approverHintEmpty") : t("studio.approverHintSet")}
                </p>
                {chain.map((s, i) => (
                  <div key={i} className="krok-appr-row" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "3px 8px" }}>{t("editor.step")} {i + 1}</span>
                    <select
                      className="krok-appr-select"
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
                    <div className="krok-appr-roleline" style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                      <Field className="krok-appr-role" value={s.label} onChange={(e) => setChain((c) => c.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))} placeholder={t("studio.rolePlaceholder")} style={{ width: 120, flex: "0 0 auto" }} />
                      <Button variant="danger" onClick={() => setChain((c) => c.filter((_, xi) => xi !== i))} style={{ padding: "8px 12px", flex: "0 0 auto" }}>{t("common.delete")}</Button>
                    </div>
                  </div>
                ))}
                {chain.length < 6 && (
                  <Button onClick={() => setChain((c) => [...c, { user_id: "", name: "", label: "" }])} style={{ padding: "8px 14px", fontSize: ".88rem" }}>+ {t("studio.addApprovalStep")}</Button>
                )}
              </div>
            )}
          </div>
      </div>

      <div role="tabpanel" style={{ display: formTab === "fill" ? "block" : "none" }}>
            <div className="krok-fs-sec">
              <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon icon={MapPin} className="h-4 w-4" /> {t("geo.title")}</b>
              <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 10px" }}>{t("geo.sub")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label={t("geo.title")}>
                {([["off", t("geo.mode.off")], ["optional", t("geo.mode.optional")], ["required", t("geo.mode.required")]] as const).map(([m, label]) => {
                  const on = (draft.geo ?? "off") === m;
                  return (
                    <button key={m} type="button" role="radio" aria-checked={on}
                      onClick={() => setDraft((d) => { if (!d) return d; const n = { ...d }; if (m === "off") delete n.geo; else n.geo = m; return n; })}
                      style={{ padding: "8px 14px", borderRadius: 20, fontSize: ".85rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {draft.geo === "required" && <small style={{ display: "block", color: "var(--warn)", fontSize: ".78rem", marginTop: 6 }}>{t("geo.requiredHint")}</small>}
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginTop: 12 }}>
                <input type="checkbox" checked={!!draft.watermark}
                  onChange={(e) => setDraft((d) => { if (!d) return d; const n = { ...d }; if (e.target.checked) n.watermark = true; else delete n.watermark; return n; })}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }} />
                <span>
                  <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".92rem" }}>{t("geo.watermark")}</b>
                  <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".82rem" }}>{draft.geo ? t("geo.watermarkSubGeo") : t("geo.watermarkSub")}</span>
                </span>
              </label>
            </div>
          <div className="krok-fs-sec">
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={!!draft.review}
                onChange={(e) => setDraft((d) => { if (!d) return d; const n = { ...d }; if (e.target.checked) n.review = true; else delete n.review; return n; })}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }} />
              <span>
                <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".92rem" }}>{t("review.setting")}</b>
                <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".82rem" }}>{t("review.settingSub")}</span>
              </span>
            </label>
          </div>
          <div className="krok-fs-sec">
            <DocNoSettings key={editingId || "new"} value={draft.doc_no} onChange={(v) => setDraft((d) => { if (!d) return d; const n = { ...d }; if (v) n.doc_no = v; else delete n.doc_no; return n; })} />
            <HelpTip id="doc-no" />
          </div>
          <div className="krok-fs-sec krok-fs-nest"><AttachmentsPanel formId={editingId} tenantId={tenantId} /></div>
      </div>

      <div role="tabpanel" style={{ display: formTab === "schedule" ? "block" : "none" }}>
          <div className="krok-fs-sec krok-fs-nest"><FormSchedulePanel key={editingId || "new"} formId={editingId} teams={teams} members={members} /></div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, maxWidth: "100%", minWidth: 0, overflowX: "clip" }}>
      {/* ซ่อนเมื่อเริ่มแก้ต่อแล้ว (งานใหม่ทับที่เก็บไว้) */}
      {pendingRestore && !dirty && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)", background: "var(--warn-soft, var(--surface-2))" }}>
          <span style={{ flex: "1 1 220px", fontSize: ".9rem" }}>
            {tt("studio.restoreMsg", { title: pendingRestore.draft.title || t("editor.formTitle"), time: new Date(pendingRestore.at).toLocaleTimeString(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) })}
          </span>
          <Button variant="primary" onClick={() => restoreSaved(pendingRestore)} style={{ minHeight: 44 }}>{t("studio.restoreBtn")}</Button>
          <Button onClick={() => { clearSavedDraft(draftPrefix + (pendingRestore.editingId || "new")); setPendingRestore(null); }} style={{ minHeight: 44 }}>{t("studio.restoreDiscard")}</Button>
        </div>
      )}
      {toast && (!toast.base || toast.base === draft) && (
        <div role="status" data-krok-keep="" style={{ position: "fixed", left: "50%", bottom: "calc(24px + var(--krok-tabbar-h))", transform: "translateX(-50%)", zIndex: 95, display: "flex", alignItems: "center", gap: 12, background: "var(--ink)", color: "var(--surface)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.25)", fontSize: ".88rem", maxWidth: "calc(100vw - 32px)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: toast.base ? "normal" : "nowrap" }}>{toast.msg}</span>
          {toast.undo && (
            <button type="button" onClick={doUndo} style={{ minHeight: 44, padding: "0 10px", border: "none", background: "transparent", color: "var(--brand-stop-2)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: ".88rem", whiteSpace: "nowrap" }}>
              {t("kb.undo")}<span className="krok-kbd"> (Ctrl+Z)</span>
            </button>
          )}
          {toast.base && (
            <button type="button" onClick={() => setToast(null)} aria-label={t("common.close")} style={{ minWidth: 44, minHeight: 44, margin: "-6px -8px -6px 0", border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon={X} className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {/* หัวหน้าแบบเดียวกับหน้าอื่น (เดิมเป็นแถบแท็บ สร้างใหม่/แก้ไข/ทั้งหมด): ชื่อหน้าซ้าย · ปุ่มไปอีกหน้าขวา */}
      {(tab === "new" || tab === "all") && (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px 8px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "var(--fs-h1)", margin: 0, minWidth: 0 }}>
            {tab === "all" ? t("studio.allFormsTitle") : t(createMode === "file" ? "studio.titleFile" : createMode === "template" ? "studio.titleTemplate" : "studio.title")}
          </h1>
          {/* วิธีใช้ข้างชื่อหน้า (กติกาเดียวกับทุกหน้า) — panel กางเต็มบรรทัดใต้หัว */}
          {tab === "new" && <HelpTip id="create-form" compact panelOrder={2} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
            {draft && (
              <Button onClick={() => { setTab("edit"); setFlash(null); }} style={{ minHeight: 44, padding: "0 14px" }}>
                <Icon icon={Pencil} className="h-4 w-4" /> {t("studio.resumeEdit")}
              </Button>
            )}
            {tab === "new" ? (initialForms.length > 0 && (
              <Button data-tour="studio-tabs" aria-label={tt("studio.allFormsAria", { n: initialForms.length })} onClick={() => { setTab("all"); setFlash(null); }} style={{ minHeight: 44, padding: "0 14px", fontWeight: 600 }}>
                <span style={{ display: "inline-flex", color: "var(--accent-text)" }}><Icon icon={FileText} className="h-4 w-4" /></span> {t("studio.allFormsBtn")}
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", boxSizing: "border-box", borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: ".78rem", fontWeight: 700 }}>{initialForms.length}</span>
              </Button>
            )) : (
              <Button variant="primary" onClick={() => { setTab("new"); setFlash(null); }} style={{ minHeight: 44, padding: "0 16px" }}>
                <Icon icon={Plus} className="h-4 w-4" /> {t("studio.createNew")}
              </Button>
            )}
          </div>
          <p style={{ flexBasis: "100%", order: 1, color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
            {tab === "all" ? t("studio.allFormsSub") : t(createMode === "file" ? "studio.subtitleFile" : createMode === "template" ? "studio.subtitleTemplate" : "studio.subtitle")}
          </p>
        </div>
      </div>
      )}

      {tab === "new" && (
      <>
      <Card>
        {/* โหมดสร้าง: พิมพ์ prompt หรือ อัพโหลดไฟล์ */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "0 0 12px" }}>
        <div className="krok-seg krok-seg-modes" data-tour="studio-modes" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", margin: 0 }}>
          {([
            { m: "prompt" as const, icon: Sparkles, label: t("studio.modePrompt"), short: t("studio.modePromptShort") },
            { m: "file" as const, icon: FileUp, label: t("studio.modeFile"), short: t("studio.modeFileShort") },
            { m: "template" as const, icon: LayoutTemplate, label: t("studio.modeTemplate"), short: t("studio.modeTemplateShort") },
          ]).map(({ m, icon, label, short }, i) => {
            const on = createMode === m;
            return (
              <button
                key={m}
                onClick={() => setCreateMode(m)}
                aria-pressed={on}
                aria-label={label}
                className="inline-flex items-center gap-1.5 krok-seg-btn"
                style={{ padding: "9px 16px", border: "none", borderLeft: i > 0 ? "1px solid var(--line)" : "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".9rem", fontWeight: on ? 600 : 500, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)" }}
              >
                <Icon icon={icon} className="h-4 w-4" /> <span className="krok-lbl-long">{label}</span><span className="krok-lbl-short">{short}</span>
              </button>
            );
          })}
        </div>
        </div>

        {createMode === "template" ? (
          <TemplateGallery onUse={applyTemplate} />
        ) : createMode === "prompt" ? (
          <div>
            <TextArea ref={promptRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("studio.promptPlaceholder")} aria-label={t("studio.promptLabel")}
              // คำสั่งจากตัวอย่างยาวหลายบรรทัด → ขยายกล่องให้เห็นทั้งหมด (สูงสุด ~520px แล้วเลื่อนในกล่อง)
              style={{ minHeight: Math.max(200, Math.min(prompt.split("\n").length * 23 + 28, 520)) }} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <AsyncButton variant="primary" onClick={generate} disabled={!!busy} style={{ padding: "12px 30px", fontSize: "1rem" }}>
                <Icon icon={Sparkles} className="h-[18px] w-[18px]" /> {t("studio.generate")}
              </AsyncButton>
            </div>
          </div>
        ) : (
          <div>
            {pendingFile ? (
              // เลือกไฟล์แล้ว — โชว์ชื่อไฟล์ + ยืนยันก่อนแปลง
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon icon={FileText} className="h-5 w-5" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: ".92rem", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</b>
                    <small style={{ color: "var(--ink-3)", fontSize: ".78rem" }}>
                      {(pendingFile.size / 1024 / 1024).toFixed(2)} MB · {/\.pdf$/i.test(pendingFile.name) || pendingFile.type === "application/pdf" ? "PDF" : t("studio.fileKindImage")}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={runFromFile} disabled={!!busy}>
                    <Icon icon={Sparkles} className="h-4 w-4" /> {t("studio.fileConfirm")}
                  </Button>
                  <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>{t("studio.fileChange")}</Button>
                  <Button variant="ghost" onClick={() => setPendingFile(null)} disabled={!!busy}>{t("common.cancel")}</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                style={{ width: "100%", border: "2px dashed var(--line)", borderRadius: 12, background: "var(--surface-2)", padding: "28px 16px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-2)" }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={FileUp} className="h-6 w-6" />
                </span>
                <b style={{ fontFamily: "var(--font-anuphan)", color: "var(--ink)" }}>{t("studio.fileDrop")}</b>
                <span style={{ fontSize: ".82rem" }}>{t("studio.fileHint")}</span>
              </button>
            )}
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
            <div className="krok-seg" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", flex: "0 0 auto" }}>
              {([
                { k: "task" as const, icon: Layers, label: t("studio.libByTask") },
                { k: "industry" as const, icon: Factory, label: t("studio.libByIndustry") },
              ]).map((g, i) => {
                const on = promptGroupBy === g.k;
                return (
                  <button key={g.k} onClick={() => setPromptGroupBy(g.k)} aria-pressed={on} className="inline-flex items-center gap-1.5 krok-seg-btn"
                    style={{ minHeight: 44, padding: "0 14px", border: "none", borderLeft: i === 1 ? "1px solid var(--line)" : "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", fontWeight: on ? 600 : 500, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)" }}>
                    <Icon icon={g.icon} className="h-4 w-4" /> {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {(() => {
              // ยุบไว้ 6 ปุ่มแรก (เดิมราว 32 ปุ่ม ยาวครึ่งหน้าบนมือถือ) · กด "ดูตัวอย่างทั้งหมด" เพื่อขยาย
              const groups = promptGroupBy === "task" ? PROMPTS_BY_TASK : PROMPTS_BY_INDUSTRY;
              const total = groups.reduce((n, g) => n + g.items.length, 0);
              let left = showAllPrompts ? Infinity : PROMPT_PREVIEW;
              const shown = groups.map((g) => { const items = g.items.slice(0, Math.max(0, left)); left -= items.length; return { ...g, items }; }).filter((g) => g.items.length);
              return (<>
            {shown.map((group) => (
              <div key={group.key}>
                <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--ink-3)", letterSpacing: ".02em", marginBottom: 7 }}>
                  {lang === "en" ? group.en : group.th}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.items.map((it) => (
                    <button
                      key={it.id}
                      // เติมคำสั่งเต็ม (ขั้นตอน + ฟิลด์) ไม่ใช่แค่ชื่อ — ผู้ใช้แก้ต่อได้ก่อนกดสร้าง
                      onClick={() => {
                        setCreateMode("prompt");
                        setPrompt(buildPrompt(it.id, lang));
                        // ปุ่มอยู่ใต้กล่องคำสั่ง → เลื่อนขึ้นไปให้เห็นคำสั่งที่เติม แล้วกดสร้างได้เลย
                        requestAnimationFrame(() => {
                          promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                          promptRef.current?.focus({ preventScroll: true });
                        });
                      }}
                      className="krok-touch44"
                      style={{ fontSize: ".82rem", minHeight: 44, padding: "7px 14px", borderRadius: 22, background: "var(--code-bg)", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.35 }}
                    >
                      {lang === "en" ? it.en : it.th}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {total > PROMPT_PREVIEW && (
              <button type="button" onClick={() => setShowAllPrompts((v) => !v)} aria-expanded={showAllPrompts}
                style={{ justifySelf: "start", minHeight: 44, padding: "0 4px", border: "none", background: "none", color: "var(--accent-text)", fontWeight: 600, fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer" }}>
                {showAllPrompts ? t("studio.libLess") : tt("studio.libMore", { n: total })}
              </button>
            )}
              </>);
            })()}
          </div>
        </Card>
      )}
      </>
      )}

      {tab === "edit" && (draft ? (
        // จอกว้าง: ฟอร์มซ้าย + แผงตั้งค่าขวาแบบถาวร (ฟอร์มไม่ยืด-หดตอนเลือกฟิลด์) · จอแคบ: แผงลอย/แผ่นเลื่อนขึ้น
        <div>
                  <div ref={editHeadRef} className="krok-edithead" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="krok-eh-title">
              {/* หัวหน้าเหมือนหน้าอื่น: h1 อยู่นอกการ์ด ไม่มีไอคอน (ไอคอนฟอร์มอยู่ในช่องชื่อด้านล่าง) */}
              <nav aria-label={t("studio.crumbLabel")} style={{ fontSize: ".84rem", color: "var(--ink-2)", marginBottom: 2 }}>
                <button type="button" onClick={() => setTab("all")} style={{ border: "none", background: "none", padding: "0 2px", minHeight: 44, color: "var(--accent-text)", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer" }}>{t("studio.crumbAll")}</button>
                <span aria-hidden> / </span><span className="krok-eh-cur" aria-current="page">{editingId ? t("studio.crumbEdit") : t("studio.crumbNew")}</span>
              </nav>
              <h1 style={{ fontSize: "var(--fs-h1)", margin: 0 }}>{draft.title || t("editor.formTitle")}</h1>
              <p className="krok-eh-sub" style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 2 }}>
                {editingId ? t("studio.editingForm") + " · " : ""}{tt("forms.stepsFields", { steps: draft.steps.length, fields: countFields(draft) })}
              </p>
            </div>
            <div className="krok-edithead-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" data-krok-keep onClick={() => { setSelKey(null); setFormPanel(true); }}
                className="inline-flex items-center gap-1.5"
                style={{ minHeight: 44, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", background: !selKey ? "var(--accent-soft)" : "var(--surface)", color: !selKey ? "var(--accent-text)" : "var(--ink-2)", fontWeight: !selKey ? 600 : 400 }}>
                <Icon icon={Settings2} className="h-4 w-4" /> {t("fs.title")}
              </button>
              <div className="krok-viewtoggle" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flex: "0 0 auto" }}>
                {([
                  { m: "mobile" as ViewMode, icon: Smartphone, label: t("studio.viewMobile") },
                  { m: "paper" as ViewMode, icon: FileText, label: t("studio.viewPaper") },
                ]).map((v, i) => {
                  const on = view === v.m;
                  return (
                    <button
                      key={v.m}
                      onClick={() => setView(v.m)}
                      aria-pressed={view === v.m}
                      aria-label={v.label}
                      title={v.label}
                      className="inline-flex items-center gap-1.5"
                      style={{ minHeight: 44, padding: "0 14px", border: "none", borderLeft: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 400 }}
                    >
                      <Icon icon={v.icon} className="h-4 w-4" /><span className="krok-vt-lbl"> {v.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="krok-editbtns" data-tour="studio-publish" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AsyncButton variant="primary" onClick={publish} disabled={!!busy || (!!editingId && !dirty)} title={editingId && !dirty ? t("studio.noChanges") : undefined}><Icon icon={editingId ? Save : CheckCircle2} className="h-4 w-4" /> {editingId ? t("studio.saveChanges") : t("studio.publish")}</AsyncButton>
            {!editingId && <AsyncButton onClick={saveAsDraft} disabled={!!busy}><Icon icon={FileText} className="h-4 w-4" /> {t("studio.saveDraft")}</AsyncButton>}
            <Button onClick={cancelDraft} disabled={!!busy}>{editingId ? t("common.cancel") : t("studio.discard")}</Button>
          </div>
            </div>
          </div>
          {/* ผลการบันทึก/เผยแพร่ — ใต้หัวหน้า (ปุ่มอยู่บนหัวหน้า) */}
          {busy && <div style={{ marginBottom: 12 }}><Notice><Spinner /> {busy}</Notice></div>}
          {status && !busy && <div role="alert" style={{ marginBottom: 12 }}><Notice kind={status.err ? "error" : "info"}>{status.t}</Notice></div>}
        <div className={`krok-editgrid ol-${outline}`}>
        {/* โครงฟอร์ม (จอ ≥900): แบบกาง = รายชื่อขั้น/ช่อง กดเพื่อเลือกและเลื่อนไปที่ช่องนั้น · แบบหุบ = แถบเลขขั้น */}
        <nav className="krok-outline" aria-label={t("studio.outline")}>
          <div className="krok-ol-rail">
            <button type="button" data-krok-keep="" onClick={() => setOutlinePref("open")} aria-label={t("studio.outlineOpen")} title={t("studio.outlineOpen")}
              aria-expanded={false} className="krok-ol-railbtn"><Icon icon={PanelLeftOpen} className="h-5 w-5" /></button>
            {draft.steps.map((st, si) => (
              <button key={st.id} type="button" data-krok-keep="" onClick={() => selectStep(st.id)}
                aria-label={`${t("editor.step")} ${si + 1} ${st.title}`} title={st.title}
                aria-current={selKey === `s:${st.id}` || st.fields.some((f) => f.id === selKey) ? "true" : undefined}
                className={selKey === `s:${st.id}` || st.fields.some((f) => f.id === selKey) ? "krok-ol-railbtn krok-ol-railon" : "krok-ol-railbtn"}>
                {si + 1}
              </button>
            ))}
          </div>
          <div className="krok-ol-full">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, margin: "0 0 6px" }}>
            <h2 style={{ fontSize: "var(--fs-h2)", margin: "0 0 0 6px" }}>{t("studio.outline")}</h2>
            <button type="button" data-krok-keep="" onClick={() => setOutlinePref("closed")} aria-label={t("studio.outlineClose")} title={t("studio.outlineClose")}
              aria-expanded={true} className="krok-ol-railbtn" style={{ border: "none" }}><Icon icon={PanelLeftClose} className="h-5 w-5" /></button>
          </div>
          {draft.steps.map((st, si) => (
            <div key={st.id} style={{ marginBottom: 6 }}>
              <button type="button" data-krok-keep="" onClick={() => selectStep(st.id)} aria-current={selKey === `s:${st.id}` ? "true" : undefined}
                className={selKey === `s:${st.id}` ? "krok-ol-item krok-ol-on" : "krok-ol-item"} style={{ fontWeight: 600, color: "var(--ink-2)" }}>
                {si + 1}. {st.title || t("editor.stepTitle")}
              </button>
              {st.fields.map((f) => (
                <button key={f.id} type="button" data-krok-keep="" aria-current={selKey === f.id ? "true" : undefined}
                  onClick={() => { setSelKey(f.id); requestAnimationFrame(() => document.getElementById(`fp-${f.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })); }}
                  className={selKey === f.id ? "krok-ol-item krok-ol-field krok-ol-on" : "krok-ol-item krok-ol-field"}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label || t("fw.noName")}</span>
                  {f.required && <span aria-hidden style={{ color: "var(--fail-text)", flex: "0 0 auto" }}>*</span>}
                </button>
              ))}
            </div>
          ))}
          </div>
        </nav>
        <Card>
          {/* ตัวเลือกที่ดูเหมือนข้อบกพร่องแต่ยังไม่ได้ตั้ง (ฟอร์มที่สร้างก่อนมีตัวเลือกนี้) → เสนอให้ยืนยัน */}
          <DefectSuggestBanner key={editingId ?? "new"} schema={draft} onApply={(s) => setDraft(s)} />

          {/* ปรับแก้ทั้งฟอร์มด้วย AI — ช่องแถวเดียวแบบช่องแชต: ✨ ในช่อง · ปุ่มส่งไอคอนชิดขวา · Enter ส่ง */}
          <form onSubmit={(e) => { e.preventDefault(); if (!busy && refine.trim()) void refineDraft(); }} title={t("studio.refineSub")}
            style={{ position: "relative", marginTop: 10 }}>
            <span aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--accent-text)", display: "inline-flex", pointerEvents: "none" }}><Icon icon={Sparkles} className="h-4 w-4" /></span>
            <Field value={refine} onChange={(e) => setRefine(e.target.value)} placeholder={t("studio.refinePlaceholderShort")} title={t("studio.refinePlaceholder")} aria-label={t("studio.refineTitle")} aria-describedby="krok-refine-hint" maxLength={500} enterKeyHint="send"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 52, paddingLeft: 38, paddingRight: 56 }} />
            <span id="krok-refine-hint" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("studio.refineHint")}</span>
            <button type="submit" disabled={!!busy || !refine.trim()} aria-label={t("studio.refineBtn")} title={t("studio.refineBtn")}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 8, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: busy || !refine.trim() ? "default" : "pointer",
                background: refine.trim() && !busy ? "var(--accent)" : "var(--surface-2)", color: refine.trim() && !busy ? "var(--accent-ink)" : "var(--ink-3)" }}>
              {busy === t("studio.busyRefine") ? <span aria-hidden style={{ width: 16, height: 16, border: "2px solid currentColor", borderRightColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "krok-spin .8s linear infinite" }} /> : <Icon icon={ArrowUp} className="h-4 w-4" />}
            </button>
          </form>


          <div className="krok-canvaswrap" data-tour="studio-canvas" style={{ position: "relative", marginTop: 8, overflow: "hidden" }}>
            {view === "paper" ? (
              <FormPaperEditor schema={draft} onChange={(s) => setDraft((prev) => (prev ? keepClearOnGrow(prev, s) : s))} selectedKey={selKey} onSelect={setSelKey} onPrint={doPrint} onAddField={() => addField()} onAddStep={() => addStep()}
                onDeleteKey={deleteKey} onUndo={doUndo} onRedo={doRedo} canUndo={history.canUndo} canRedo={history.canRedo} onCheckpoint={history.checkpoint} theme={resolveTheme(branding, draft.theme)} tenantId={tenantId} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8 }}>
                <div role="radiogroup" aria-label={t("studio.prevMode")} style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                  {([[false, t("studio.prevAll")], [true, t("studio.prevPaged")]] as const).map(([v, label], i) => {
                    const on = previewPaged === v;
                    return (
                      <button key={label} type="button" role="radio" aria-checked={on} data-krok-keep="" onClick={() => setPreviewPaged(v)}
                        style={{ minHeight: 44, padding: "0 16px", border: "none", borderLeft: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 400 }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ width: "100%", maxWidth: 390, border: "10px solid var(--ink)", borderRadius: 30, padding: "10px 12px 16px", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
                  <div style={{ width: 90, height: 5, background: "var(--line)", borderRadius: 3, margin: "2px auto 10px" }} />
                  <FormPreview schema={draft} selectedKey={selKey} onSelect={setSelKey} onAddField={(i) => addField(i)} onAddStep={addStep} onMoveField={moveField} fieldActions={{ move: moveKey, duplicate: duplicateKey, remove: deleteKey }} theme={resolveTheme(branding, draft.theme)}
                    paged={previewPaged} stepLabel={stepLabel} />
                </div>
              </div>
            )}
          </div>

          {/* เอกสารสำหรับพิมพ์ (ซ่อนบนจอ แสดงเฉพาะตอนพิมพ์) */}
          <div className="krok-print-root"><FormPaperView schema={draft} theme={resolveTheme(branding, draft.theme)} /></div>

          {editingId && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
              <Field value={versionNote} maxLength={300} onChange={(e) => setVersionNote(e.target.value)} placeholder={t("ver.notePh")} aria-label={t("ver.notePh")} style={{ flex: "1 1 240px", minWidth: 0 }} />
              <Link href={`/studio/history/${editingId}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".86rem", color: "var(--accent-text)", minHeight: 44, whiteSpace: "nowrap" }}>
                <Icon icon={History} className="h-4 w-4" /> {t("ver.history")}
              </Link>
            </div>
          )}

        </Card>
        {(selKey || formPanel) && <div className="krok-settings-backdrop" onClick={() => { setSelKey(null); setFormPanel(false); }} />}
        <aside ref={asideRef} data-tour="studio-aside" className={selKey || formPanel ? "krok-aside krok-aside-sel" : "krok-aside"} aria-label={selKey ? t("editor.fieldSettings") : t("fs.title")}
          {...(sheetOpen ? { role: "dialog", "aria-modal": true, tabIndex: -1 } : {})}>
          {selKey ? (
            <>
              <button type="button" onClick={() => { setSelKey(null); setFormPanel(true); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44, border: "none", background: "none", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".88rem", padding: "0 4px 0 0", marginBottom: 4 }}>
                <Icon icon={ChevronLeft} className="h-4 w-4" /> {t("fs.title")}
              </button>
              <FieldSettingsPanel schema={draft} selectedKey={selKey} onChange={(s) => setDraft((prev) => (prev ? keepClearOnGrow(prev, s) : s))} onSelect={setSelKey} formId={editingId} tenantId={tenantId} teams={teams} members={members} branding={branding} hideFieldActions={view === "mobile"} />
            </>
          ) : null}
          {/* ซ่อนไว้ (ไม่ unmount) ตอนเลือกฟิลด์ — ค่าที่กรอกค้างในแผงย่อยไม่หาย */}
          <div style={{ display: selKey ? "none" : "block" }}>{formSettings}</div>
        </aside>
        </div>
        </div>
      ) : openingFromUrl ? (
        <Card>
          <div role="status" style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-3)", fontSize: ".9rem" }}>{t("common.loading")}</div>
        </Card>
      ) : (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-2)" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)", marginBottom: 10 }}><Icon icon={Pencil} className="h-10 w-10" strokeWidth={1.4} /></div>
            <h1 style={{ fontSize: "var(--fs-h1)", margin: "0 0 6px" }}>{t("studio.editEmptyTitle")}</h1>
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
        {flash && <div role="status" style={{ marginBottom: 12 }}><Notice>{flash}</Notice></div>}

        {/* ค้นหา + กรองประเภท */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 10px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("studio.searchForm")} style={{ width: "100%", paddingLeft: 32 }} />
          </div>
          <select aria-label={t("studio.category")} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="krok-typefilter"
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
                aria-pressed={on}
                style={{ minHeight: 44, padding: "0 14px", borderRadius: 22, fontSize: ".85rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
                {label} ({n})
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {initialForms.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("studio.emptyForms")}</span>}
          {initialForms
            .filter((f) => listFilter === "all" || f.status === listFilter)
            .filter((f) => catFilter === "all" || (f.summary.category || "") === catFilter)
            .filter((f) => !search.trim() || f.title.toLowerCase().includes(search.trim().toLowerCase()))
            .map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--surface)", flexWrap: "wrap" }}>
              <FormIcon value={f.icon} size={40} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>{" "}
                {f.status === "published" ? <Pill kind="pass">{t("studio.stPublished")}</Pill> : f.status === "draft" ? <Pill kind="na">{t("studio.stDraft")}</Pill> : <Pill kind="na">{t("studio.stArchived")}</Pill>}
                {/* ตัวเลือกที่ดูเหมือนข้อบกพร่องแต่ยังไม่ได้ตั้ง → ชวนเปิดแก้ (แถบเสนอจะขึ้นในหน้าแก้ไข) */}
                {f.summary.defect_hint && f.status !== "archived" && (
                  <button type="button" onClick={() => void editExisting(f)} title={t("defect.listHint")}
                    style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, padding: "0 8px", borderRadius: 999, border: "1px solid color-mix(in srgb, var(--warn) 45%, transparent)", background: "color-mix(in srgb, var(--warn) 10%, var(--surface))", color: "var(--ink)", fontFamily: "inherit", fontSize: ".74rem", fontWeight: 600, cursor: "pointer", verticalAlign: "middle" }}>
                    <Icon icon={CircleAlert} className="h-3.5 w-3.5" /> {t("defect.listBadge")}
                  </button>
                )}
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {f.summary.category && <span style={{ display: "inline-block", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", marginRight: 6, color: "var(--ink-2)" }}>{categoryLabel(f.summary.category, lang)}</span>}
                  {tt("forms.stepsFields", { steps: f.summary.steps, fields: f.summary.fields })}
                </small>
              </div>
              <div className="krok-row-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* ปุ่มหลักโชว์ไว้: แก้ไข · แชร์ · เผยแพร่ (เฉพาะร่าง/ยกเลิกแล้ว) — ที่เหลือ (QR · ประวัติ · ยกเลิกเผยแพร่ · ลบ) อยู่ในเมนู ⋯
                    มือถือเห็นได้หลายฟอร์มต่อจอ · ลบอยู่ท้ายเมนูแยกเส้นคั่น ตัวแดง */}
                <AsyncButton onClick={() => editExisting(f)} title={t("common.edit")}><Icon icon={Pencil} className="h-4 w-4" /><span className="krok-btn-label"> {t("common.edit")}</span></AsyncButton>
                <Button onClick={() => setShareForm(f)} title={t("share.title")}>
                  <Icon icon={f.visibility === "public" ? Globe : Share2} className="h-4 w-4" />
                  <span className="krok-btn-label"> {t("share.short")}</span>
                </Button>
                {f.status !== "published" && (
                  <AsyncButton variant="primary" onClick={() => changeStatus(f.id, "published")} title={f.status === "draft" ? t("studio.publishNow") : t("studio.restore")}><Icon icon={CheckCircle2} className="h-4 w-4" /><span className="krok-btn-label"> {f.status === "draft" ? t("studio.publishNow") : t("studio.restore")}</span></AsyncButton>
                )}
                <OverflowMenu outlined label={tt("studio.moreFor", { title: f.title })} items={[
                  ...(f.status === "published" ? [{ key: "qr", label: t("qr.title"), icon: QrCode, onSelect: () => setQrForm(f) }] : []),
                  { key: "hist", label: t("ver.history"), icon: History, onSelect: () => router.push(`/studio/history/${f.id}`) },
                  ...(f.status === "published" ? [{ key: "arch", label: t("studio.cancelForm"), icon: Archive, onSelect: () => void changeStatus(f.id, "archived") }] : []),
                  { key: "del", label: t("common.delete"), icon: Trash2, danger: true, separator: true, onSelect: () => void onDelete(f.id, f.title) },
                ]} />
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
          privacyNotice={shareForm.summary.privacy_notice}
          onSaved={() => { setShareForm(null); router.refresh(); }}
        />
      )}

      <style>{`
        /* ===== หน้าแก้ไขฟอร์ม =====
           >=1280px: โครงฟอร์มซ้าย 220px + ฟอร์ม + แผงตั้งค่าขวา 360px
           900–1279px: ฟอร์ม + แผงตั้งค่าขวา 340px แบบถาวร (เดิมลอยทับการ์ดที่เลือกที่ 1024)
           641–899px: แผงลอยด้านขวาเฉพาะตอนเลือก · <=640px: แผ่นเลื่อนขึ้นจากด้านล่าง
           แผงตรึงตอนเลื่อนหน้า · ฟอร์มไม่ยืด-หดตอนเลือก/ปิด */
        .krok-editgrid{ display:grid; grid-template-columns:minmax(0,1fr); gap:16px; align-items:start; }
        .krok-outline{ display:none; }
        .krok-ol-rail{ display:flex; flex-direction:column; align-items:center; gap:8px; }
        .krok-ol-railbtn{ width:44px; height:44px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line);
          border-radius:10px; background:var(--surface); color:var(--ink-2); font-family:var(--font-anuphan); font-weight:700; cursor:pointer; }
        .krok-ol-railbtn:hover{ background:var(--surface-2); }
        .krok-ol-railon{ background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
        .krok-ol-railon:hover{ background:var(--accent); }
        .krok-ol-item{ display:flex; align-items:center; gap:4px; width:100%; min-height:40px; box-sizing:border-box; padding:6px 10px;
          border:none; border-radius:8px; background:none; color:var(--ink); font-family:inherit; font-size:.86rem; text-align:left; cursor:pointer; }
        .krok-ol-item:hover{ background:var(--surface-2); }
        .krok-ol-field{ padding-left:22px; }
        .krok-ol-on{ background:var(--accent-soft) !important; color:var(--accent-text) !important; font-weight:600; box-shadow:inset 3px 0 0 var(--accent); }
        .krok-settings-backdrop{ display:none; }
        @media (pointer: coarse){ .krok-kbd{ display:none; } }
        /* ตั้งค่าฟอร์ม (แผงขวา): หัวข้อย่อยในแท็บ คั่นด้วยเส้น ไม่ใช่กล่องซ้อนกล่อง */
        .krok-fs{ background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px; }
        .krok-fs-sec{ padding:14px 0; border-bottom:1px solid var(--line); }
        .krok-fs-sec:last-child{ border-bottom:none; }
        .krok-fs [role=tabpanel] > :first-child{ margin-top:4px; }
        .krok-fs-close{ display:none !important; }
        /* ลำดับผู้อนุมัติในแผงแคบ: [ขั้น n][ผู้อนุมัติ] / [บทบาท............][ลบ] */
        .krok-fs .krok-appr-select{ min-width:0 !important; }
        .krok-fs .krok-appr-roleline{ flex:1 1 100% !important; width:100%; }
        .krok-fs .krok-appr-roleline .krok-appr-role{ flex:1 1 auto !important; width:auto !important; }
        /* แผงย่อยที่มีกรอบของตัวเอง (เอกสาร / ตารางเวลา): ถอดกรอบเมื่ออยู่ในแท็บ */
        .krok-fs-nest > div{ border:none !important; padding:0 !important; margin-top:0 !important; border-radius:0 !important; }
        /* ความกว้างโครงฟอร์ม: หุบ 64px · กาง 220px — auto = หุบที่ 900–1279 กางที่ ≥1280 */
        .krok-editgrid.ol-auto, .krok-editgrid.ol-closed{ --ol-w:64px; }
        .krok-editgrid.ol-open{ --ol-w:220px; }
        .ol-auto .krok-ol-full, .ol-closed .krok-ol-full{ display:none; }
        .ol-open .krok-ol-rail{ display:none; }
        @media(min-width:900px){
          .krok-editgrid{ grid-template-columns:var(--ol-w) minmax(0,1fr) 340px; }
          .krok-aside{ position:sticky; top:calc(74px + var(--krok-eh, 0px)); max-height:calc(100vh - 90px - var(--krok-eh, 0px)); overflow:auto; border-radius:12px; }
          /* หัวหน้าแก้ไขตรึงใต้แถบบนของแอป — เลื่อนฟอร์มยาวแล้วปุ่มบันทึกยังอยู่บนจอ */
          .krok-edithead{ position:sticky; top:64px; z-index:15; background:var(--ground); padding:8px 0 10px; margin-bottom:12px !important;
            border-bottom:1px solid var(--line); }
          /* ส่วนหัวตรึงต้องเตี้ย (เดิม 120–177px กินจอ 23–30%): แถวเดียว — [ฟอร์มทั้งหมด / ชื่อฟอร์ม] ......... [ปุ่ม]
             ซ่อนบรรทัดรอง (จำนวนขั้น/ฟิลด์ ดูได้ที่โครงฟอร์มซ้าย) */
          .krok-edithead{ align-items:center !important; flex-wrap:nowrap !important; padding:4px 0 6px; }
          .krok-eh-title{ display:flex; align-items:center; gap:6px; min-width:0; flex:1 1 auto; }
          .krok-eh-title nav{ margin:0 !important; white-space:nowrap; flex:0 0 auto; }
          .krok-eh-title h1{ font-size:var(--fs-h1-compact) !important; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .krok-eh-cur, .krok-eh-sub{ display:none; }
          .krok-edithead-actions{ flex:0 0 auto; flex-wrap:nowrap !important; }
          .krok-outline{ display:block; position:sticky; top:calc(74px + var(--krok-eh, 0px)); max-height:calc(100vh - 90px - var(--krok-eh, 0px)); overflow:auto;
            background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:10px 6px; }
        }
        /* 900–1099: ปุ่มบนแถวเดียวกับชื่อแน่นเกิน → สลับมือถือ/กระดาษเหลือไอคอน (มี aria-label/title) */
        @media(min-width:900px) and (max-width:1099px){
          .krok-vt-lbl{ display:none; }
        }
        @media(min-width:1280px){
          .krok-editgrid{ grid-template-columns:var(--ol-w) minmax(0,1fr) 360px; }
          .krok-editgrid.ol-auto{ --ol-w:220px; }
          .ol-auto .krok-ol-full{ display:block; }
          .ol-auto .krok-ol-rail{ display:none; }
        }
        /* จอ <900: ไม่มีคอลัมน์ขวา → แผงตั้งค่าเป็นแผ่นเลื่อนขึ้นจากด้านล่างเมื่อเลือกฟิลด์ (เดิม 641–899 ลอยทับการ์ดและปุ่มบันทึก)
           แผ่นกว้างไม่เกิน 640 ตรงกลางจอ · มีพื้นหลังมืด กดแล้วปิด */
        @media(max-width:899px){
          .krok-aside{ display:none; }
          .krok-fs-close{ display:flex !important; }
          .krok-aside.krok-aside-sel{ display:block; position:fixed; left:0; right:0; bottom:0; top:auto; width:100%; max-width:640px; margin:0 auto;
            max-height:72vh; max-height:72dvh; overflow:auto; overscroll-behavior:contain; z-index:70; outline:none; box-sizing:border-box; background:var(--surface);
            border-radius:16px 16px 0 0; box-shadow:0 -10px 40px rgba(10,14,18,.25);
            padding:18px 12px calc(16px + env(safe-area-inset-bottom)); }
          /* ขีดจับบนแผ่น — บอกว่าเป็นแผ่นเลื่อนขึ้น (ไม่ใช่หน้าใหม่) และเว้นที่ไม่ให้ปุ่มติดขอบบน */
          .krok-aside.krok-aside-sel::before{ content:""; position:absolute; top:7px; left:50%; width:40px; height:4px; margin-left:-20px; border-radius:2px; background:var(--line-strong); }
          .krok-settings-backdrop{ display:block; position:fixed; inset:0; background:rgba(6,10,14,.45); z-index:69; }
        }
        /* จอ ≥900 (แผงติดขอบ): ปุ่มขึ้น/ลง/ทำซ้ำ/ลบ อยู่ใต้การ์ดในตัวอย่างแล้ว → ไม่ซ้ำในแผง · จอ <900 แผ่นตั้งค่าบังการ์ด จึงแสดงในแผ่น */
        @media(min-width:900px){ .krok-fa-dup{ display:none !important; } }
        @media(max-width:640px){
          .krok-btn-label{display:none}
          /* แถวฟอร์มบนมือถือ: ปุ่มหลัก 2–3 ปุ่มกว้างเท่ากันแถวเดียว (ไอคอน+ชื่อ) + ⋯ ท้ายแถว — ฟอร์มหนึ่งสูงราวครึ่งหนึ่งของเดิม */
          .krok-row-actions{flex-basis:100%;flex-wrap:nowrap !important;margin-top:4px}
          .krok-row-actions>button{flex:1 1 0;min-width:0;justify-content:center;min-height:44px}
          .krok-row-actions .krok-btn-label{display:inline !important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          /* toggle แบบแบ่งครึ่ง: เต็มแถว */
          .krok-seg{display:flex !important;width:100%;flex-basis:100%}
          .krok-seg-btn{flex:1;justify-content:center}
          /* โหมดสร้าง 3 ปุ่ม: แคบเกินจะตัดคำ → เรียงลงแนวตั้ง */
          /* โหมดสร้าง 3 ปุ่ม: แถวเดียว ไอคอนบน ป้ายสั้นล่าง (เดิมเรียงแนวตั้ง กินที่สามแถว) */
          .krok-seg-modes>.krok-seg-btn{flex-direction:column;gap:3px !important;padding:8px 4px !important;font-size:.8rem !important;min-height:52px}
          .krok-lbl-long{display:none}
          .krok-lbl-short{display:inline !important}
          /* dropdown ประเภทฟอร์ม: เต็มแถว */
          .krok-typefilter{width:100%;flex:1 1 100% !important;min-width:0 !important}
          /* ปุ่มบันทึก/ยกเลิก: เต็มแถว แบ่งเท่ากัน */
          .krok-editbtns>button{flex:1 1 0}
          /* หัวหน้าแก้ไข: แถวปุ่มเต็มความกว้าง — [ตั้งค่าฟอร์ม][มือถือ|กระดาษ] / [บันทึก][ยกเลิก] แบ่งเท่ากัน */
          .krok-edithead>div{width:100%}
          .krok-edithead-actions .krok-viewtoggle{flex:1 1 auto !important}
          .krok-viewtoggle>button{flex:1 1 0;justify-content:center}
          .krok-edithead-actions .krok-editbtns{flex:1 1 100%}
          /* ลำดับผู้อนุมัติ: dropdown เต็มแถว, บทบาท+ลบ อยู่แถวเดียวกันเต็มแถว */
          .krok-appr-select{flex:1 1 100% !important;min-width:0 !important}
          .krok-appr-roleline{flex:1 1 100%;width:100%}
          .krok-appr-roleline .krok-appr-role{flex:1 1 auto !important;width:auto !important}
          /* มือถือ: แผ่นตั้งค่าเต็มความกว้าง (กฎหลักอยู่ที่ <900) */
          .krok-aside.krok-aside-sel{ max-width:100%; }
        }
      `}</style>
    </div>
  );
}

/** เลขที่เอกสารแบบรัน: ตัวขึ้นต้น + รอบรีเซ็ต + จำนวนหลัก (ออกเลขตอนบันทึกใบ ฝั่งฐานข้อมูล) */
function DocNoSettings({ value, onChange }: { value?: DocNoConfig; onChange: (v: DocNoConfig | undefined) => void }) {
  const { t, tt } = useT();
  // ช่องตัวขึ้นต้นต้องพิมพ์ว่างได้ระหว่างแก้ — เก็บข้อความไว้เอง แล้วค่อยส่งค่าที่ใช้ได้ออกไป
  const [prefix, setPrefix] = useState(value?.prefix ?? "");
  const reset: DocNoReset = value?.reset ?? "none";
  const digits = value?.digits ?? 4;
  const era: DocNoEra = value?.era ?? "be";
  const set = (p: Partial<DocNoConfig>) => {
    const next: DocNoConfig = { prefix: value?.prefix ?? prefix, reset, digits, era, ...p };
    if (!next.prefix) { onChange(undefined); return; }
    const out: DocNoConfig = { prefix: next.prefix };
    if (next.reset && next.reset !== "none") out.reset = next.reset;
    if (next.digits && next.digits !== 4) out.digits = next.digits;
    if (next.era === "ce") out.era = "ce";
    onChange(out);
  };
  const pill = (on: boolean): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 20, fontSize: ".85rem", cursor: "pointer", fontFamily: "inherit", minHeight: 40,
    border: on ? "1px solid var(--accent)" : "1px solid var(--line-strong)", background: on ? "var(--accent-soft)" : "var(--surface)",
    color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
  });
  const preview = prefix ? docNoPreview({ prefix, reset, digits, era }) : "";
  return (
    <>
      <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon icon={Hash} className="h-4 w-4" /> {t("docno.title")}</b>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 10px" }}>{t("docno.sub")}</p>
      <label style={{ display: "block", fontSize: ".85rem", fontWeight: 600, marginBottom: 10 }}>
        {t("docno.prefix")}
        <Field value={prefix} placeholder={t("docno.prefixPh")} maxLength={20} autoComplete="off" spellCheck={false}
          onChange={(e) => { const p = cleanDocPrefix(e.target.value); setPrefix(p); set({ prefix: p }); }}
          style={{ marginTop: 4, fontFamily: "var(--font-anuphan)", letterSpacing: ".02em" }} />
      </label>
      {prefix && (
        <>
          <div style={{ fontSize: ".85rem", fontWeight: 600, marginBottom: 6 }} id="docno-reset">{t("docno.reset")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }} role="radiogroup" aria-labelledby="docno-reset">
            {(["none", "year", "month"] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reset === r} onClick={() => set({ reset: r })} style={pill(reset === r)}>
                {t(`docno.reset.${r}`)}
              </button>
            ))}
          </div>
          {reset !== "none" && (
            <>
              <div style={{ fontSize: ".85rem", fontWeight: 600, marginBottom: 6 }} id="docno-era">{t("docno.era")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }} role="radiogroup" aria-labelledby="docno-era">
                {(["be", "ce"] as const).map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={era === e} onClick={() => set({ era: e })} style={pill(era === e)}>
                    {t(`docno.era.${e}`)}
                  </button>
                ))}
              </div>
            </>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".85rem", fontWeight: 600, marginBottom: 12 }}>
            {t("docno.digits")}
            <select value={digits} onChange={(e) => set({ digits: Number(e.target.value) })}
              style={{ minHeight: 40, padding: "6px 10px", border: "1px solid var(--line-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }}>
              {[3, 4, 5, 6].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("docno.preview")}</span>
            <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.1rem" }}>{preview}</div>
          </div>
          <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem", marginTop: 8, lineHeight: 1.55 }}>
            {tt("docno.hint", { prefix })}
          </small>
        </>
      )}
    </>
  );
}

/** นับช่องที่ AI เพิ่ม/ลบ/แก้ (เทียบด้วย id) — บอกผู้ใช้ว่าผลปรับแก้เปลี่ยนอะไรไป */
function diffFields(before: FormSchema, after: FormSchema) {
  const map = (s: FormSchema) => new Map(s.steps.flatMap((st) => st.fields.map((f) => [f.id, JSON.stringify(f)] as const)));
  const a = map(before), b = map(after);
  let added = 0, removed = 0, changed = 0;
  for (const [id, v] of b) { const old = a.get(id); if (old === undefined) added++; else if (old !== v) changed++; }
  for (const id of a.keys()) if (!b.has(id)) removed++;
  return { added, removed, changed };
}

type SavedDraft = {
  v: 1; at: number; editingId: string | null; draft: FormSchema;
  settings: { requiresApproval: boolean; requireDevice: boolean; deviceScope: "any" | "selected"; chain: ApprovalStep[]; visMode: VisMode; visTeams: string[]; visUsers: string[]; versionNote: string };
};
