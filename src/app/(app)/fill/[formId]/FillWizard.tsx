"use client";
import { InlineFormIcon } from "@/components/FormIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { Printer, Clock, CheckCircle2, AlertTriangle, Lightbulb, Check, X, Camera, ScanLine, Sparkles, Lock, CloudOff, Plus, Trash2, TabletSmartphone, ShieldAlert, RefreshCw, Save, Send, CornerUpLeft, Users } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { labelMap, type FormField, type FormSchema, type FormStep, type TableColumn } from "@/lib/form-schema";
import { deleteDraft, loadDraftMedia, saveDraft, type DraftData } from "@/lib/drafts";
import FormPaperFill from "@/components/FormPaperFill";
import BodyPortal from "@/components/BodyPortal";
import OptionPicker from "@/components/OptionPicker";
import { PaperAddRow, PaperChoices, PaperLabel, PaperPassFail, PaperPhoto, PaperSignature, PaperTable, paperInputStyle } from "@/components/paper/PaperParts";
import { filterOptions } from "@/lib/datasets";
import { notifySubmission } from "./actions";
import { advanceCaseAction, cancelCaseAction, claimCaseAction, completeCaseAction, releaseCaseAction, returnCaseAction } from "./case-actions";
import { CaseBanner, CaseConfirmModal, HandoffModal, ReadonlyField, ReturnModal } from "./CaseParts";
import { assigneeLabel, segmentEnd, type CaseData, type CaseDocExtract } from "@/lib/case-flow";
import { fieldStepMap, loadCaseMedia, saveCase } from "@/lib/cases";
import LiveScanner from "@/components/LiveScanner";
import TableCell from "@/components/TableCell";
import { computeFormulas, computeRow, formatNumber, outOfRange } from "@/lib/formula";
import { cellPhotoKey, finalizeTableRows, mediaFieldId, newRowPhotoKey } from "@/lib/table-rows";
import FillSourceBar, { type AppliedValue, type DocExtractRecord, type FillSrcTag } from "@/components/FillSourceBar";
import { enqueue, pushSubmission, type PendingSubmission } from "@/lib/offline-queue";
import AttachmentChips from "@/components/AttachmentView";
import { groupAttachments, type Attachment } from "@/lib/attachments";
import {
  defaultDeviceName,
  deviceShortCode,
  freshApproved,
  freshFormAllow,
  getDeviceKey,
  guessPlatform,
  writeDeviceState,
  writeFormAllow,
  type DeviceStatus,
} from "@/lib/device-client";
import { registerDevice } from "@/app/(app)/settings/devices/actions";
import { confirmDialog } from "@/components/dialogs";

type TableRow = Record<string, string>;
/** รูปถ่ายต่อแถวของตาราง: key → dataURL (เก็บรวมกับรูปของฟิลด์ใน state photos) */
type MediaPhotos = { get: (key: string) => string | undefined; set: (key: string, dataUrl: string | null) => void };
const asRows = (v: unknown): TableRow[] => (Array.isArray(v) && v.length && typeof v[0] === "object" ? (v as TableRow[]) : []);

type Answer = { value?: string | string[] | TableRow[]; note?: string; ai?: string; src?: FillSrcTag | "api" };
type Props = {
  formId: string;
  title: string;
  icon: string;
  version: number;
  requiresApproval: boolean;
  approvalChain: unknown[];
  schema: FormSchema;
  tenantId: string;
  userId: string;
  userName: string;
  publicMode?: boolean;
  /** เอกสารที่เกี่ยวข้อง (ระดับฟอร์ม + ระดับฟิลด์) */
  attachments?: Attachment[];
  /** ฟอร์มนี้กรอกได้เฉพาะเครื่องที่ผู้ดูแลอนุมัติแล้ว */
  requireDevice?: boolean;
  /** กรอกต่อจากแบบร่าง */
  draft?: DraftData | null;
  /** งานที่เปิดอยู่ (ฟอร์มกรอกหลายคน) */
  caseData?: CaseData | null;
  /** ฟอร์มนี้กรอกหลายคน: ชื่อทีม + สิทธิ์ของผู้ใช้ (null = ฟอร์มคนเดียวแบบเดิม) */
  workflow?: { teams: Record<string, string>; users: Record<string, string>; canStart: boolean; canClaim: boolean; manager: boolean } | null;
};
type DocRec = DocExtractRecord & { step?: number; path?: string | null };

// ---- client image shrink to jpeg data-url ----
function shrinkImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const r = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => rej(new Error("อ่านรูปไม่ได้"));
    img.src = URL.createObjectURL(file);
  });
}
async function detectBarcode(file: File): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new () => { detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const bmp = await createImageBitmap(file);
    const codes = await new BD().detect(bmp);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function FillWizard(props: Props) {
  const { schema } = props;
  const { t, tt, lang } = useT();
  const router = useRouter();
  const supabase = createClient();
  const nSteps = schema.steps.length;
  // ---- งาน (ฟอร์มกรอกหลายคน) ----
  // ช่วงที่ผู้ใช้คนนี้แก้ได้ [segStart, segEnd] — ขั้นอื่นแสดงแบบอ่านอย่างเดียว; -1 = ดูอย่างเดียวทั้งฟอร์ม
  const wf = !props.publicMode && !!props.workflow;
  const kase = wf ? props.caseData ?? null : null;
  const caseMine = !!kase && kase.status === "open" && kase.claimedBy === props.userId;
  const [segStart, segEnd] = !wf
    ? [0, nSteps - 1]
    : kase
    ? (caseMine ? [kase.stepIdx, segmentEnd(schema, kase.stepIdx)] : [-1, -1])
    : (props.workflow!.canStart ? [0, segmentEnd(schema, 0)] : [-1, -1]);
  const viewOnly = segStart < 0;
  const maxIdx = viewOnly ? nSteps - 1 : segEnd;
  const lockedStep = (i: number) => viewOnly || i < segStart || i > segEnd;
  const initialDraft = props.publicMode || kase ? null : props.draft ?? null;
  const [idx, setIdx] = useState(() => {
    const start = kase ? (viewOnly ? Math.min(kase.stepIdx, nSteps - 1) : segStart) : initialDraft?.stepIdx ?? 0;
    return Math.min(Math.max(start, 0), maxIdx);
  });
  // เริ่มจากคำตอบในร่าง/งาน (ตั้งก่อน render แรก — FieldControl อ่านค่าเริ่มต้นตอน mount)
  const answers = useRef<Record<string, Answer>>(((kase?.answers ?? initialDraft?.answers) as Record<string, Answer>) ?? {});
  const [photos, setPhotos] = useState<Record<string, string>>({}); // fieldId -> dataUrl
  const docExtracts = useRef<DocRec[]>(((kase?.docExtracts ?? initialDraft?.docExtracts) as DocRec[]) ?? []); // หลักฐานการอ่านเอกสารด้วย AI
  const [sigs, setSigs] = useState<Record<string, string>>({});
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [startedAt] = useState(() => Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"mobile" | "paper">(initialDraft?.mode ?? "mobile");
  const [done, setDone] = useState<{ result: "pass" | "fail"; fails: string[]; dur: number; pending: boolean; offline: boolean; handoff?: { step: string; team: string | null }; returned?: string; caseWarn?: string } | null>(null);
  const [caseModal, setCaseModal] = useState<null | "handoff" | "return" | "release" | "cancel">(null);
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseErr, setCaseErr] = useState<string | undefined>();
  const newCaseId = useRef<string | null>(null); // id ของงานที่กำลังเริ่ม (เรียกซ้ำได้ถ้าส่งต่อไม่สำเร็จ)
  const stepOfField = useMemo(() => fieldStepMap(schema), [schema]);
  // คำตอบของขั้นที่ล็อก (ไม่เปลี่ยนระหว่างเปิดหน้านี้) — ใช้แสดงแบบอ่านอย่างเดียว
  const [lockedAnswers] = useState<Record<string, Answer>>(() => ({ ...((kase?.answers as Record<string, Answer>) ?? {}) }));

  // ---- เอกสารที่เกี่ยวข้อง ----
  const [attForm, attByField] = (() => {
    const g = groupAttachments(props.attachments || []);
    return [g.form, g.byField] as const;
  })();

  // ---- ตัวตนของเครื่อง (เฉพาะฟอร์มที่ล็อค) ----
  const deviceLocked = !!props.requireDevice && !props.publicMode;
  const [device, setDevice] = useState<{ id: string | null; status: DeviceStatus | "checking" | "error" | "notlinked"; msg?: string }>(
    () => (deviceLocked ? { id: null, status: "checking" } : { id: null, status: "approved" })
  );
  const [deviceName, setDeviceName] = useState(() => defaultDeviceName(props.userName));
  const [registering, setRegistering] = useState(false);

  // ออฟไลน์/เรียก server ไม่ได้ → ใช้ผลที่แคชไว้ (อนุมัติแล้ว + ผูกกับฟอร์มนี้แล้ว ภายใน 24 ชม.)
  const offlineFallback = useCallback((): { id: string | null; status: DeviceStatus | "error"; msg?: string } => {
    const cached = freshApproved(props.tenantId);
    if (!cached) return { id: null, status: "error", msg: t("fw.offlineNotApproved") };
    if (!freshFormAllow(props.formId))
      return { id: cached.deviceId, status: "error", msg: t("fw.offlineNoForm") };
    return { id: cached.deviceId, status: "approved" };
  }, [props.tenantId, props.formId, t]);

  const checkDevice = useCallback(async (name?: string) => {
    if (!deviceLocked) return;
    const key = getDeviceKey();

    // ออฟไลน์: ใช้ผลอนุมัติที่แคชไว้ (ไม่เกิน 24 ชม.) เพื่อไม่ให้งานหยุดตอนสัญญาณหลุด
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setDevice(offlineFallback());
      return;
    }

    setRegistering(true);
    try {
      const res = await registerDevice(key, name || defaultDeviceName(props.userName), guessPlatform(), props.formId);
      if ("error" in res) {
        const fb = offlineFallback();
        setDevice(fb.status === "approved" ? fb : { id: null, status: "error", msg: res.error });
        return;
      }
      writeDeviceState(props.tenantId, { deviceId: res.deviceId, status: res.status, name: res.name, at: Date.now() });

      // อนุมัติแล้วแต่ยังไม่ถูกผูกกับฟอร์มนี้ (ฟอร์มตั้งเป็น "เฉพาะเครื่องที่เลือก")
      if (res.status === "approved" && res.allowedForForm === false) {
        writeFormAllow(props.formId, false);
        setDevice({ id: res.deviceId, status: "notlinked" });
        return;
      }
      if (res.status === "approved") writeFormAllow(props.formId, true);
      setDevice({ id: res.deviceId, status: res.status });
    } catch {
      const fb = offlineFallback();
      setDevice(fb.status === "approved" ? fb : { id: null, status: "error", msg: t("fw.deviceCheckFailed") });
    } finally {
      setRegistering(false);
    }
  }, [deviceLocked, offlineFallback, props.formId, props.tenantId, props.userName, t]);

  useEffect(() => {
    if (!deviceLocked) return;
    void checkDevice();
  }, [deviceLocked, checkDevice]);

  const step = schema.steps[idx];

  // ฟิลด์สูตร: คำนวณใหม่ทุกครั้งที่ render (เบา) — ช่องตัวเลข/ตารางที่เปลี่ยนจะสั่ง render เมื่อฟอร์มมีสูตร
  const hasFormula = useMemo(() => schema.steps.some((s) => s.fields.some((f) => f.type === "formula")), [schema]);
  const calcFrom = useCallback((ans: Record<string, Answer>) => computeFormulas(schema, { value: (id) => ans[id]?.value, rows: (id) => asRows(ans[id]?.value) }), [schema]);
  // ค่าเริ่มต้นคำนวณจากร่าง/งานที่โหลดมา · หลังจากนั้นคำนวณใหม่ทุกครั้งที่คำตอบเปลี่ยน (patchAnswer / applyFill)
  const [formulaVals, setFormulaVals] = useState<Record<string, number | null>>(() =>
    calcFrom(((kase?.answers ?? initialDraft?.answers) as Record<string, Answer>) ?? {}));
  // รูปถ่ายต่อแถว: อยู่ใน photos เดียวกับรูปของฟิลด์ (แบบร่าง/งาน/ส่งข้อมูลจัดการเหมือนกัน) key = <field>.<col>.<สุ่ม>
  const mediaPhotos = useMemo<MediaPhotos>(() => ({
    get: (k) => photos[k],
    set: (k, d) => {
      dirty.current++;
      setPhotos((prev) => { const n = { ...prev }; if (d) n[k] = d; else delete n[k]; return n; });
    },
  }), [photos]);
  const refreshFormulas = useCallback(() => { if (hasFormula) setFormulaVals(calcFrom(answers.current)); }, [hasFormula, calcFrom]);

  // merge a patch into an answer (ref-owned by this component)
  const patchAnswer = useCallback((id: string, patch: Partial<Answer>, render = false) => {
    const prev = answers.current[id] || {};
    const next: Answer = { ...prev, ...patch };
    // คนแก้ค่าที่ AI เติมไว้ → เปลี่ยนที่มาเป็น ai_edited (ตัวเลขนี้บอกว่า extraction แม่นแค่ไหน)
    // ค่าที่มาจากสแกนถือเป็นการกรอกปกติเมื่อถูกแก้
    if (patch.src === undefined && "value" in patch && prev.src && patch.value !== prev.value) {
      next.src = prev.src === "ai" || prev.src === "ai_edited" ? "ai_edited" : undefined;
    }
    answers.current[id] = next;
    dirty.current++;
    if ("value" in patch) refreshFormulas();
    if (render) rerender();
  }, [rerender, refreshFormulas]);

  // ================= แบบร่าง (บันทึกไว้ก่อน ยังไม่ส่ง) =================
  // บันทึกเมื่อ: กดปุ่ม "บันทึกร่าง", เปลี่ยนขั้นตอน, กดออก, สลับแอป/ปิดแท็บ (หน้าถูกซ่อน)
  // บันทึกอัตโนมัติเฉพาะเมื่อมีคำตอบจริงและมีการเปลี่ยนตั้งแต่บันทึกล่าสุด → ไม่เกิดร่างขยะ
  const draftsOn = !props.publicMode && !viewOnly && (!kase || caseMine);
  const dirty = useRef(0);          // นับการแก้ไข
  const savedAt = useRef(0);        // ค่า dirty ตอนบันทึกล่าสุด
  const draftId = useRef<string | null>(initialDraft?.id ?? null);
  // งาน: media ของทั้งงาน (key → path ใน bucket 'cases') / ร่าง: media ของร่าง
  const draftMedia = useRef<Record<string, string>>(kase?.media ?? initialDraft?.media ?? {});
  const uploadedMedia = useRef(new Map<string, string>());
  const saving = useRef<Promise<boolean> | null>(null);
  const submitLock = useRef(false); // กำลังส่ง/ส่งแล้ว → ห้ามบันทึกร่าง (กันร่างค้างหลังส่ง)
  const [draftState, setDraftState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; at?: number; msg?: string }>(
    initialDraft ? { kind: "saved", at: new Date(initialDraft.updatedAt).getTime() } : { kind: "idle" }
  );
  const [mediaLoading, setMediaLoading] = useState(
    kase ? Object.keys(kase.media || {}).length > 0 || kase.docExtracts.some((d) => !!d.path)
      : !!initialDraft && Object.keys(initialDraft.media || {}).length > 0
  );
  const versionChanged = !!initialDraft && initialDraft.formVersion !== props.version;
  // state ล่าสุดสำหรับ callback ที่ถูกเรียกนอกรอบ render (visibilitychange)
  const latest = useRef({ idx, mode, photos, sigs });
  useEffect(() => { latest.current = { idx, mode, photos, sigs }; }, [idx, mode, photos, sigs]);

  // โหลดรูป/ลายเซ็นของร่างกลับมา
  // งาน: โหลดรูป/ลายเซ็น/รูปเอกสารของทุกขั้นกลับมา (ขั้นก่อนหน้าไว้ดู, ขั้นสุดท้ายใช้ส่ง submission)
  useEffect(() => {
    if (!kase || !mediaLoading) return;
    let alive = true;
    loadCaseMedia(supabase, kase.media, docExtracts.current as CaseDocExtract[]).then((m) => {
      if (!alive) return;
      setPhotos(m.photos);
      setSigs(m.sigs);
      const fpr = (d: string) => `${d.length}:${d.slice(-64)}`;
      for (const [f, d] of Object.entries(m.photos)) uploadedMedia.current.set(`p:${f}`, fpr(d));
      for (const [f, d] of Object.entries(m.sigs)) uploadedMedia.current.set(`s:${f}`, fpr(d));
      setMediaLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialDraft || !mediaLoading) return;
    let alive = true;
    loadDraftMedia(supabase, initialDraft.media).then((m) => {
      if (!alive) return;
      setPhotos(m.photos);
      setSigs(m.sigs);
      for (const [i, d] of Object.entries(m.docs)) if (docExtracts.current[Number(i)]) docExtracts.current[Number(i)].dataUrl = d;
      // ไฟล์ที่โหลดมาคือไฟล์ที่อยู่บน server แล้ว → ไม่ต้องอัปโหลดซ้ำตอนบันทึกครั้งถัดไป
      const fpr = (d: string) => `${d.length}:${d.slice(-64)}`;
      for (const [f, d] of Object.entries(m.photos)) uploadedMedia.current.set(`p:${f}`, fpr(d));
      for (const [f, d] of Object.entries(m.sigs)) uploadedMedia.current.set(`s:${f}`, fpr(d));
      for (const [i, d] of Object.entries(m.docs)) uploadedMedia.current.set(`d:${i}`, fpr(d));
      setMediaLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** มีอะไรที่ผู้กรอกใส่จริงไหม (ไม่นับวันเวลาที่ระบบเติมให้เอง) */
  const hasContent = useCallback(() => {
    const { photos: ph, sigs: sg } = latest.current;
    if (Object.keys(ph).length || Object.keys(sg).length) return true;
    return schema.steps.some((st) => st.fields.some((fl) => {
      if (fl.type === "datetime") return false;
      const v = answers.current[fl.id]?.value;
      if (Array.isArray(v)) return v.some((x) => (typeof x === "string" ? x !== "" : x && Object.values(x).some((c) => String(c ?? "").trim() !== "")));
      return v != null && v !== "";
    }));
  }, [schema]);

  const saveDraftNow = useCallback(async (reason: "manual" | "auto"): Promise<boolean> => {
    if (!draftsOn || submitLock.current) return false;
    if (reason === "auto" && (dirty.current === savedAt.current || !hasContent())) return true;
    if (mediaLoading) return false; // ยังโหลดรูปของร่างไม่เสร็จ — อย่าเขียนทับด้วยข้อมูลไม่ครบ
    if (saving.current) return saving.current;
    const mark = dirty.current;
    const { idx: si, mode: md, photos: ph, sigs: sg } = latest.current;
    let filled = 0, total = 0;
    let title = "";
    for (const st of schema.steps)
      for (const fl of st.fields) {
        total++;
        const v = answers.current[fl.id]?.value;
        const has = fl.type === "photo" ? !!ph[fl.id] : fl.type === "signature" ? !!sg[fl.id]
          : Array.isArray(v) ? v.length > 0 : v != null && v !== "";
        if (has) filled++;
        if (!title && has && ["text", "select", "number"].includes(fl.type) && typeof v === "string") {
          const l = fl.option_labels && fl.options ? fl.option_labels[fl.options.indexOf(v)] : "";
          title = `${fl.label}: ${l || v}`;
        }
      }
    setDraftState({ kind: "saving" });
    const job = (async () => {
      try {
        if (kase) {
          // งาน: บันทึกเฉพาะช่วงที่ถืออยู่ลง form_cases (ไม่ใช่แบบร่าง)
          const res = await saveCase(supabase, {
            tenantId: props.tenantId, caseId: kase.id, schema, segStart, segEnd, title,
            answers: answers.current, photos: ph, sigs: sg, docExtracts: docExtracts.current as CaseDocExtract[], filled, total,
          }, uploadedMedia.current, draftMedia.current);
          const keep = Object.fromEntries(Object.entries(draftMedia.current).filter(([k]) => {
            const st = stepOfField.get(mediaFieldId(k.slice(2)));
            return st === undefined || st < segStart || st > segEnd;
          }));
          draftMedia.current = { ...keep, ...res.media };
          savedAt.current = mark;
          setDraftState({ kind: "saved", at: Date.now() });
          return true;
        }
        const res = await saveDraft(supabase, draftId.current, {
          tenantId: props.tenantId, userId: props.userId, formId: props.formId, formVersion: props.version,
          title, stepIdx: si, mode: md, answers: answers.current, photos: ph, sigs: sg,
          docExtracts: docExtracts.current, filled, total,
        }, uploadedMedia.current, draftMedia.current);
        draftId.current = res.id;
        draftMedia.current = res.media;
        savedAt.current = mark;
        setDraftState({ kind: "saved", at: Date.now() });
        return true;
      } catch (e) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const raw = e instanceof Error ? e.message : "";
        const network = /fetch|network|timeout/i.test(raw);
        setDraftState({
          kind: "error",
          msg: offline ? t("fw.draftOffline")
            : network ? t("fw.draftNetwork")
            : tt("fw.draftFailed", { detail: raw ? ` (${raw})` : "" }),
        });
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = job;
    return job;
  }, [draftsOn, hasContent, mediaLoading, schema, supabase, props.tenantId, props.userId, props.formId, props.version, kase, segStart, segEnd, stepOfField, t, tt]);

  // สลับแอป / ปิดแท็บ / ล็อกจอ → บันทึกร่างอัตโนมัติ
  useEffect(() => {
    if (!draftsOn) return;
    const onHide = () => { if (document.visibilityState === "hidden") void saveDraftNow("auto"); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [draftsOn, saveDraftNow]);

  // เปิดจากร่าง: สิ่งที่โหลดมา (คำตอบ/รูป) ถือว่าบันทึกแล้ว ยังไม่ต้องบันทึกซ้ำจนกว่าจะแก้
  useEffect(() => {
    if (initialDraft && !mediaLoading) savedAt.current = dirty.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaLoading]);

  async function exitForm() {
    if (draftsOn && dirty.current !== savedAt.current && hasContent()) {
      const ok = await saveDraftNow("auto");
      if (!ok && !(await confirmDialog({ message: t("draft.exitUnsaved"), confirmLabel: t("fill.exit"), danger: true }))) return;
    }
    router.push(kase ? "/forms?tab=tasks" : "/forms");
  }

  /** ส่งฟอร์มสำเร็จแล้ว → ลบร่างทิ้ง */
  async function clearDraftAfterSubmit() {
    if (saving.current) await saving.current.catch(() => false); // รอบันทึกร่างที่ค้างอยู่ให้จบก่อน จะได้ลบถูกตัว
    if (!draftId.current) return;
    const id = draftId.current;
    draftId.current = null;
    try { await deleteDraft(supabase, id, draftMedia.current); } catch { /* ร่างค้าง = หมดอายุเองใน 30 วัน */ }
  }

  // ---- dropdown ที่กรองตามกัน (ตัวเลือกจากข้อมูลอ้างอิง) ----
  // parent field id → ฟิลด์ลูกที่ตัวเลือกขึ้นกับค่าของมัน
  const { fieldById, childrenOf } = useMemo(() => {
    const byId = new Map<string, FormField>();
    const kids = new Map<string, FormField[]>();
    for (const st of schema.steps)
      for (const fl of st.fields) {
        byId.set(fl.id, fl);
        const pid = fl.options_source?.parent?.field_id;
        if (pid && fl.options_parents) kids.set(pid, [...(kids.get(pid) || []), fl]);
      }
    return { fieldById: byId, childrenOf: kids };
  }, [schema]);

  // เวอร์ชันของฟิลด์แม่ — เพิ่มทุกครั้งที่ค่าเปลี่ยน ใช้เป็น key ให้ฟิลด์ลูก mount ใหม่
  const [depVer, setDepVer] = useState<Record<string, number>>({});

  /**
   * ค่าฟิลด์แม่เปลี่ยน → ตัดคำตอบของฟิลด์ลูก (และหลาน) ที่ไม่อยู่ในตัวเลือกใหม่ทิ้ง
   * แล้วเพิ่มเวอร์ชันของแม่และลูกหลานทั้งหมด เพื่อให้ช่องที่เกี่ยวข้องแสดงตัวเลือกใหม่
   */
  const pruneChildren = useCallback((rootId: string) => {
    if (!childrenOf.has(rootId)) return;
    const touched: string[] = [];
    const walk = (parentId: string, depth: number) => {
      touched.push(parentId);
      const kids = childrenOf.get(parentId);
      if (!kids || depth > 10) return;
      const pv = answers.current[parentId]?.value;
      for (const c of kids) {
        const allowed = new Set(filterOptions(c.options || [], c.options_parents, pv));
        const cur = answers.current[c.id]?.value;
        if (Array.isArray(cur)) {
          const keep = (cur as unknown[]).filter((x): x is string => typeof x === "string" && allowed.has(x));
          if (keep.length !== cur.length) answers.current[c.id] = { ...answers.current[c.id], value: keep };
        } else if (typeof cur === "string" && cur && !allowed.has(cur)) {
          answers.current[c.id] = { ...answers.current[c.id], value: undefined, src: undefined };
        }
        walk(c.id, depth + 1);
      }
    };
    walk(rootId, 0);
    setDepVer((v) => {
      const n = { ...v };
      for (const id of touched) n[id] = (n[id] ?? 0) + 1;
      return n;
    });
  }, [childrenOf]);

  /** เติมค่าจากแหล่งเติมข้อมูล (สแกน / อ่านเอกสาร) ลงหลายฟิลด์พร้อมกัน */
  const applyFill = useCallback((values: AppliedValue[]) => {
    for (const v of values) {
      answers.current[v.field_id] = { ...answers.current[v.field_id], value: toCode(fieldById.get(v.field_id), v.value), src: v.src };
    }
    for (const v of values) pruneChildren(v.field_id);
    refreshFormulas();
    setErrors((e) => {
      const next = { ...e };
      for (const v of values) delete next[v.field_id];
      return next;
    });
    rerender();
  }, [rerender, pruneChildren, fieldById, refreshFormulas]);

  const fillBar = (st: FormStep) => (
    <FillSourceBar
      step={st}
      publicMode={props.publicMode}
      shrinkImage={shrinkImage}
      dataUrlToBlob={dataUrlToBlob}
      getValue={(id) => {
        const v = answers.current[id]?.value;
        return typeof v === "string" ? v : "";
      }}
      onApply={applyFill}
      onExtract={(rec) => docExtracts.current.push(rec)}
    />
  );

  function validate(fields: FormField[] = step.fields): boolean {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required) continue;
      const a = answers.current[f.id] || {};
      let miss = false;
      if (f.type === "photo") miss = !photos[f.id];
      else if (f.type === "signature") miss = !sigs[f.id];
      else if (f.type === "checkbox") miss = !(Array.isArray(a.value) && a.value.length);
      else if (f.type === "table")
        miss = !(Array.isArray(a.value) && (a.value as TableRow[]).some((r) => r && typeof r === "object" && Object.values(r).some((v) => String(v ?? "").trim() !== "")));
      else miss = a.value == null || a.value === "";
      if (miss) {
        errs[f.id] = t("fill.required");
        continue;
      }
      if (f.type === "pass_fail" && a.value === "fail" && f.on_fail_require_note && !a.note?.trim())
        errs[f.id] = t("fw.failNoteRequired");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /** ฟิลด์ของช่วงที่ผู้ใช้คนนี้กรอก */
  const segFields = () => (viewOnly ? [] : schema.steps.slice(segStart, segEnd + 1).flatMap((s) => s.fields));
  const isLastSeg = !viewOnly && segEnd === nSteps - 1;

  /** จบช่วงของตัวเอง: ตรวจครบแล้วเปิดหน้าต่างยืนยันส่งต่อ */
  function openHandoff() {
    const fs = segFields();
    if (!validate(fs)) {
      const firstErr = fs.find((f) => !answers.current[f.id] && f.required);
      if (firstErr && typeof document !== "undefined") document.getElementById("fld-" + firstErr.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setCaseErr(undefined);
    setCaseModal("handoff");
  }

  async function next() {
    if (!validate(lockedStep(idx) ? [] : step.fields)) return;
    if (viewOnly) {
      if (idx < maxIdx) { setIdx(idx + 1); window.scrollTo(0, 0); }
      return;
    }
    if (wf && !isLastSeg && idx === segEnd) { openHandoff(); return; }
    if (idx < maxIdx) {
      setIdx(idx + 1);
      latest.current.idx = idx + 1;
      window.scrollTo(0, 0);
      void saveDraftNow("auto");
    } else {
      await submit();
    }
  }

  // โหมดกระดาษ: ตรวจทุกฟิลด์ทั้งฟอร์มแล้วส่งครั้งเดียว
  async function submitPaper() {
    if (wf && !isLastSeg) { openHandoff(); return; }
    const all = segFields();
    if (!validate(all)) {
      const firstErr = all.find((f) => errors[f.id]);
      if (firstErr && typeof document !== "undefined") document.getElementById("fld-" + firstErr.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    await submit();
  }

  async function submit() {
    submitLock.current = true;
    setSubmitting(true);
    try {
      const subId = crypto.randomUUID();
      const list: Record<string, unknown>[] = [];
      const fails: string[] = [];
      const photoUploads: { fieldId: string; dataUrl: string; ai?: string }[] = [];
      const fvals = hasFormula ? calcFrom(answers.current) : {};

      for (const s of schema.steps)
        for (const f of s.fields) {
          const a = answers.current[f.id] || {};
          const item: Record<string, unknown> = { id: f.id, label: f.label, type: f.type };
          if (a.src) item.src = a.src; // ที่มาของค่า: scan | ai | ai_edited (ไม่มี = คนกรอกเอง)
          if (f.type === "photo") {
            if (photos[f.id]) {
              photoUploads.push({ fieldId: f.id, dataUrl: photos[f.id], ai: a.ai });
              item.photoField = f.id;
            }
            if (a.ai) item.display = a.ai;
          } else if (f.type === "signature") {
            if (sigs[f.id]) {
              photoUploads.push({ fieldId: f.id, dataUrl: sigs[f.id] });
              item.photoField = f.id;
              item.display = "เซ็นแล้ว";
            }
          } else if (f.type === "pass_fail") {
            item.display = a.value === "pass" ? "ผ่าน" : a.value === "fail" ? "ไม่ผ่าน" : "—";
            if (a.value === "fail") {
              item.fail = true;
              item.note = a.note || "";
              fails.push(f.label);
            }
          } else if (f.type === "checkbox") {
            const vals = (Array.isArray(a.value) ? a.value : []).filter((v): v is string => typeof v === "string");
            const names = labelMap(f.options, f.option_labels);
            item.display = vals.map((v) => names.get(v) ?? v).join(", ") || "—";
            if (names.size && vals.length) item.code = vals.join(", "); // แสดงชื่อ เก็บรหัส
            if (f.options && !f.options_source && vals.length < f.options.length)
              item.note = "ไม่ได้เลือก: " + f.options.filter((o) => !vals.includes(o)).join(", ");
          } else if (f.type === "number") {
            item.display = String(a.value ?? "—") + (f.unit ? " " + f.unit : "");
            const v = parseFloat(String(a.value));
            if (Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) {
              item.fail = true;
              fails.push(f.label + " (ค่านอกช่วง)");
            }
          } else if (f.type === "formula") {
            const v = fvals[f.id] ?? null;
            item.display = v == null ? "—" : formatNumber(v, f.decimals ?? 2) + (f.unit ? " " + f.unit : "");
            if (outOfRange(v, f)) {
              item.fail = true;
              fails.push(f.label + " (ค่านอกช่วง)");
            }
          } else if (f.type === "table") {
            const fin = finalizeTableRows(f, asRows(a.value));
            for (const k of fin.photoKeys) if (photos[k]) photoUploads.push({ fieldId: k, dataUrl: photos[k] });
            item.display = `${fin.rows.length} แถว`;
            item.rows = fin.rows;
            if (fin.fails.length) { item.fail = true; fails.push(...fin.fails); }
            item.columns = (f.columns || []).map((c) => ({ id: c.id, label: c.label, type: c.type }));
          } else if (f.type === "select" && f.option_labels && typeof a.value === "string" && a.value) {
            const name = labelMap(f.options, f.option_labels).get(a.value);
            item.display = name ?? a.value;
            if (name) item.code = a.value; // แสดงชื่อ เก็บรหัส
          } else item.display = String(a.value ?? "—");
          list.push(item);
        }

      const result: "pass" | "fail" = fails.length ? "fail" : "pass";
      // งาน: นับเวลาตั้งแต่เริ่มงาน (ขั้นแรก) จนส่งขั้นสุดท้าย
      const dur = Math.round((Date.now() - (kase ? new Date(kase.createdAt).getTime() : startedAt)) / 1000);

      // โหมดสาธารณะ (ไม่ล็อกอิน) → ส่งผ่าน API ที่ตรวจสิทธิ์ฝั่ง server
      if (props.publicMode) {
        try {
          const fd = new FormData();
          fd.append("form_id", props.formId);
          fd.append("user_name", props.userName);
          fd.append("result", result);
          fd.append("fails", JSON.stringify(fails));
          fd.append("answers", JSON.stringify(list));
          fd.append("duration", String(dur));
          for (const p of photoUploads) fd.append(`photo_${p.fieldId}`, dataUrlToBlob(p.dataUrl), `${p.fieldId}.jpg`);
          const res = await fetch("/api/public/submit", { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || t("fw.submitFailed"));
          }
        } catch (e) {
          setErrors({ [step.fields[0].id]: tt("fw.submitFailedMsg", { msg: e instanceof Error ? e.message : t("fw.error") }) });
          setSubmitting(false);
          submitLock.current = false;
          return;
        }
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: false });
        window.scrollTo(0, 0);
        return;
      }

      const payload: PendingSubmission = {
        subId,
        tenantId: props.tenantId,
        formId: props.formId,
        title: props.title,
        icon: props.icon,
        version: props.version,
        userId: props.userId,
        userName: props.userName,
        requiresApproval: props.requiresApproval,
        approvalChain: props.approvalChain,
        result,
        fails,
        answers: list,
        dur,
        photos: photoUploads,
        docExtracts: docExtracts.current,
        deviceId: device.id,
        queuedAt: 0,
      };

      // งาน (ฟอร์มกรอกหลายคน): ขั้นสุดท้ายต้องออนไลน์ — ส่ง submission แล้วปิดงานทันที (ไม่เข้าคิวออฟไลน์)
      if (wf) {
        if (!kase) throw new Error(t("fw.caseNotFound"));
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(t("fw.offlineFinalStep"));
        await pushSubmission(supabase, payload);
        const r = await completeCaseAction(kase.id, subId);
        void notifySubmission(subId).catch(() => {});
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: false, caseWarn: "error" in r ? r.error : undefined });
        window.scrollTo(0, 0);
        return;
      }

      // ออฟไลน์ → เข้าคิวไว้ก่อน แล้ว sync ทีหลัง
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await enqueue({ ...payload, queuedAt: Date.now() });
        window.dispatchEvent(new Event("krok-queue-changed"));
        // ออฟไลน์ลบร่างบน server ไม่ได้ตอนนี้ — ร่างจะถูกลบเมื่อกลับมาออนไลน์ครั้งถัดไปที่เปิดหน้าแบบร่าง
        // (ถือว่าส่งแล้ว: เก็บ id ไว้ให้หน้าแบบร่างซ่อน/ลบ)
        rememberSubmittedDraft(draftId.current);
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: true });
        window.scrollTo(0, 0);
        return;
      }

      try {
        await pushSubmission(supabase, payload);
      } catch {
        // ส่งไม่ผ่าน (เครือข่ายหลุด) → เก็บเข้าคิวออฟไลน์
        await enqueue({ ...payload, queuedAt: Date.now() });
        window.dispatchEvent(new Event("krok-queue-changed"));
        rememberSubmittedDraft(draftId.current);
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: true });
        window.scrollTo(0, 0);
        return;
      }

      // แจ้ง webhook ภายนอก (best-effort, ไม่บล็อกผู้ใช้)
      void notifySubmission(subId).catch(() => {});
      void clearDraftAfterSubmit();

      setDone({ result, fails, dur, pending: props.requiresApproval, offline: false });
      window.scrollTo(0, 0);
    } catch (e) {
      const fid = (lockedStep(idx) ? segFields()[0] : step.fields[0])?.id ?? step.fields[0].id;
      setErrors({ [fid]: tt("fw.submitFailedMsg", { msg: e instanceof Error ? e.message : t("fw.error") }) });
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  // ================= งาน: ส่งต่อ / ส่งกลับ / รับงาน / คืนงาน / ยกเลิก =================
  /** ผู้รับผิดชอบขั้น i: "ทีม X" หรือชื่อคน (null = คนเดิมกรอกต่อ) */
  const whoOf = (i: number) => assigneeLabel(schema, i, props.workflow?.teams ?? {}, props.workflow?.users ?? {}, { team: (name: string) => tt("wf.teamName", { name }), deletedTeam: t("wf.deletedTeam"), goneUser: t("wf.goneUser") });
  const netErr = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    if (typeof navigator !== "undefined" && navigator.onLine === false) return t("fw.offlineRetry");
    return /fetch|network/i.test(raw) ? t("wf.netError") : raw || t("fw.actionFailed");
  };

  /** บันทึกช่วงของตัวเองลงงาน (งานใหม่ = เริ่มงานก่อน) คืน id งาน */
  async function persistSegment(): Promise<string> {
    let caseId = kase?.id ?? null;
    if (!caseId) {
      caseId = newCaseId.current ?? crypto.randomUUID();
      newCaseId.current = caseId;
      const { error } = await supabase.rpc("case_start", { p_id: caseId, p_form: props.formId });
      if (error) throw new Error(error.message);
    }
    const { photos: ph, sigs: sg } = latest.current;
    let filled = 0, total = 0, title = "";
    for (const st of schema.steps)
      for (const fl of st.fields) {
        total++;
        const v = answers.current[fl.id]?.value;
        const has = fl.type === "photo" ? !!ph[fl.id] : fl.type === "signature" ? !!sg[fl.id] : Array.isArray(v) ? v.length > 0 : v != null && v !== "";
        if (has) filled++;
        if (!title && has && ["text", "select", "number"].includes(fl.type) && typeof v === "string") {
          const l = fl.option_labels && fl.options ? fl.option_labels[fl.options.indexOf(v)] : "";
          title = `${fl.label}: ${l || v}`;
        }
      }
    if (saving.current) await saving.current.catch(() => false);
    const res = await saveCase(supabase, {
      tenantId: props.tenantId, caseId, schema, segStart, segEnd, title,
      answers: answers.current, photos: ph, sigs: sg, docExtracts: docExtracts.current as CaseDocExtract[], filled, total,
    }, uploadedMedia.current, draftMedia.current);
    draftMedia.current = { ...draftMedia.current, ...res.media };
    savedAt.current = dirty.current;
    return caseId;
  }

  async function doHandoff(note: string) {
    setCaseBusy(true);
    setCaseErr(undefined);
    submitLock.current = true;
    try {
      const caseId = await persistSegment();
      const r = await advanceCaseAction(caseId, note || null);
      if ("error" in r) throw new Error(r.error);
      if (!kase) void clearDraftAfterSubmit(); // ร่างของขั้นแรกกลายเป็นงานแล้ว
      const nxt = segEnd + 1;
      setCaseModal(null);
      setDone({ result: "pass", fails: [], dur: 0, pending: false, offline: false, handoff: { step: `${nxt + 1}. ${schema.steps[nxt]?.title ?? ""}`, team: r.holder || (r.teamName ? tt("fw.teamName", { name: r.teamName }) : whoOf(nxt)) } });
      window.scrollTo(0, 0);
    } catch (e) {
      submitLock.current = false;
      setCaseErr(netErr(e));
    } finally {
      setCaseBusy(false);
    }
  }

  async function doReturn(toStep: number, note: string) {
    if (!kase) return;
    setCaseBusy(true);
    setCaseErr(undefined);
    try {
      // เก็บสิ่งที่แก้ในขั้นนี้ไว้ก่อน (ขั้นนี้กลับมาทำต่อได้หลังอีกฝั่งแก้เสร็จ)
      if (dirty.current !== savedAt.current) await persistSegment().catch(() => null);
      submitLock.current = true;
      const r = await returnCaseAction(kase.id, toStep, note);
      if ("error" in r) throw new Error(r.error);
      setCaseModal(null);
      setDone({ result: "pass", fails: [], dur: 0, pending: false, offline: false, returned: r.holder || (r.teamName ? tt("fw.teamName", { name: r.teamName }) : `${toStep + 1}. ${schema.steps[toStep]?.title ?? ""}`) });
      window.scrollTo(0, 0);
    } catch (e) {
      submitLock.current = false;
      setCaseErr(netErr(e));
    } finally {
      setCaseBusy(false);
    }
  }

  async function doClaim() {
    if (!kase) return;
    setCaseBusy(true);
    setCaseErr(undefined);
    const r = await claimCaseAction(kase.id).catch((e) => ({ error: netErr(e) }));
    setCaseBusy(false);
    if ("error" in r) setCaseErr(r.error);
    router.refresh();
  }

  async function doRelease() {
    if (!kase) return;
    setCaseBusy(true);
    setCaseErr(undefined);
    if (dirty.current !== savedAt.current) await persistSegment().catch(() => null);
    submitLock.current = true;
    const r = await releaseCaseAction(kase.id).catch((e) => ({ error: netErr(e) }));
    setCaseBusy(false);
    if ("error" in r) { submitLock.current = false; setCaseErr(r.error); return; }
    router.push("/forms?tab=tasks");
  }

  async function doCancelCase(note: string) {
    if (!kase) return;
    setCaseBusy(true);
    setCaseErr(undefined);
    submitLock.current = true;
    const r = await cancelCaseAction(kase.id, note || null).catch((e) => ({ error: netErr(e) }));
    setCaseBusy(false);
    if ("error" in r) { submitLock.current = false; setCaseErr(r.error); return; }
    router.push("/forms?tab=tasks");
  }

  // ---- ประตูตรวจอุปกรณ์: ฟอร์มที่ล็อค ต้องเป็นเครื่องที่อนุมัติแล้วเท่านั้น ----
  if (deviceLocked && device.status !== "approved") {
    const code = deviceShortCode(typeof window !== "undefined" ? getDeviceKey() : "");
    const box: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "32px 20px", textAlign: "center", boxShadow: "var(--shadow)", maxWidth: 460, margin: "0 auto" };

    if (device.status === "checking")
      return (
        <div style={box}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)" }}><Icon icon={TabletSmartphone} className="h-10 w-10" strokeWidth={1.5} /></div>
          <h2 style={{ margin: "10px 0 4px", fontSize: "1.05rem" }}>{t("fw.device.checking")}</h2>
        </div>
      );

    const title = device.status === "revoked" ? t("fw.device.revoked")
      : device.status === "notlinked" ? t("fw.device.notLinked")
      : device.status === "error" ? t("fw.deviceCheckFailed")
      : t("fw.device.notApproved");
    const sub = device.status === "revoked" ? t("fw.device.revokedSub")
      : device.status === "notlinked" ? tt("fw.device.notLinkedSub", { title: props.title })
      : device.status === "error" ? (device.msg || t("fw.device.retryAgain"))
      : t("fw.device.notApprovedSub");

    return (
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "center", color: device.status === "pending" || device.status === "notlinked" ? "var(--amber)" : "var(--fail)" }}>
          <Icon icon={ShieldAlert} className="h-11 w-11" strokeWidth={1.5} />
        </div>
        <h2 style={{ margin: "10px 0 4px", fontSize: "1.08rem" }}>{title}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem" }}>{sub}</p>

        <div style={{ margin: "16px 0", padding: "12px 14px", borderRadius: 10, background: "var(--code-bg)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>{t("fw.device.code")}</div>
          <div style={{ fontFamily: "monospace", fontSize: "1.5rem", letterSpacing: ".18em", fontWeight: 700 }}>{code}</div>
        </div>

        {device.status === "pending" && (
          <div style={{ display: "grid", gap: 8, textAlign: "left" }}>
            <label style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{t("fw.device.nameLabel")}</label>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value.slice(0, 80))}
              placeholder={t("fw.device.namePh")}
              style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".95rem" }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => checkDevice(deviceName)} loading={registering}>
            <Icon icon={RefreshCw} className="h-4 w-4" /> {device.status === "pending" ? t("fw.device.requestRecheck") : t("fw.device.retry")}
          </Button>
          <Button onClick={() => router.push("/forms")}>{t("fill.backToList")}</Button>
        </div>
      </div>
    );
  }

  // ฟอร์มกรอกหลายคนที่ขั้นแรกจำกัดทีม — ผู้ใช้นี้เริ่มงานไม่ได้
  if (wf && !kase && viewOnly) {
    const tn = whoOf(0);
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "36px 20px", textAlign: "center", boxShadow: "var(--shadow)", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)" }}><Icon icon={Users} className="h-11 w-11" strokeWidth={1.5} /></div>
        <h2 style={{ margin: "10px 0 4px", fontSize: "1.05rem" }}>{t("wf.startTeamOnly")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem" }}>{t("wf.startTeamOnlySub").replace("{team}", tn || "-")}</p>
        <Button onClick={() => router.push("/forms")} style={{ marginTop: 12 }}>{t("fill.backToList")}</Button>
      </div>
    );
  }

  if (done && (done.handoff || done.returned)) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "40px 20px", textAlign: "center", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", justifyContent: "center", color: done.returned ? "#d97706" : "var(--pass)" }}>
          <Icon icon={done.returned ? CornerUpLeft : Send} className="h-12 w-12" strokeWidth={1.6} />
        </div>
        <h2 style={{ margin: "10px 0 4px" }}>{done.returned ? t("wf.doneReturned") : t("wf.doneHandoff")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem" }}>
          {done.returned
            ? t("wf.doneReturnedSub").replace("{to}", done.returned)
            : t("wf.doneHandoffSub").replace("{step}", done.handoff!.step).replace("{team}", done.handoff!.team || "-")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => router.push("/forms?tab=tasks")}>{t("wf.backToTasks")}</Button>
          <Button onClick={() => router.push("/forms")}>{t("fill.backToList")}</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "40px 20px", textAlign: "center", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", justifyContent: "center", color: done.offline ? "var(--amber)" : done.pending ? "var(--amber)" : done.result === "pass" ? "var(--pass)" : "var(--fail)" }}><Icon icon={done.offline ? CloudOff : done.pending ? Clock : done.result === "pass" ? CheckCircle2 : AlertTriangle} className="h-12 w-12" strokeWidth={1.6} /></div>
        <h2 style={{ margin: "10px 0 4px" }}>
          {done.offline
            ? t("fill.doneOffline")
            : done.pending
            ? t("fill.donePending")
            : done.result === "pass"
            ? t("fill.doneOk")
            : tt("fw.doneIssues", { n: done.fails.length })}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem" }}>
          {done.offline
            ? t("fill.doneOfflineSub")
            : tt("fw.doneSub", { title: props.title, sec: done.dur, next: done.pending ? t("fw.doneNotifyAppr") : t("fw.doneOnDash") })}
        </p>
        {done.caseWarn && (
          <p style={{ color: "#d97706", fontSize: ".85rem" }}>⚠ {t("wf.completeWarn")} ({done.caseWarn})</p>
        )}
        {done.fails.length > 0 && (
          <div style={{ borderLeft: "3px solid var(--fail)", background: "var(--fail-soft)", borderRadius: "0 8px 8px 0", padding: "10px 14px", textAlign: "left", color: "var(--ink-2)", fontSize: ".9rem", margin: "14px 0" }}>
            {done.fails.map((f, i) => (
              <div key={i}>• {f}</div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          {props.publicMode ? (
            <Button variant="primary" onClick={() => window.location.reload()}>{t("fill.submitAgain")}</Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => router.push("/forms")}>{t("fill.backToList")}</Button>
              <Button onClick={() => router.push("/dashboard")}>{t("fill.viewDash")}</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const renderField = (f: FormField, paper = false, compact = false) => {
    const fStep = stepOfField.get(f.id) ?? 0;
    if (wf && lockedStep(fStep)) {
      return (
        <div id={"fld-" + f.id} key={f.id}>
          <ReadonlyField field={f} answer={f.type === "formula" ? { value: formulaVals[f.id] == null ? "" : formatNumber(formulaVals[f.id], f.decimals ?? 2) } : lockedAnswers[f.id]} photo={photos[f.id]} sig={sigs[f.id]} paper={paper} compact={compact}
            pending={kase ? kase.status === "open" && fStep > segmentEnd(schema, kase.stepIdx) : fStep > segEnd} />
        </div>
      );
    }
    const parentId = f.options_parents ? f.options_source?.parent?.field_id : undefined;
    // key ผูกกับเวอร์ชันของฟิลด์แม่ → แม่เปลี่ยน ฟิลด์ลูก mount ใหม่และอ่านคำตอบที่ถูกตัดแล้ว
    const k = parentId ? `${f.id}|${depVer[parentId] ?? 0}` : f.id;
    return (
    <div id={"fld-" + f.id} key={k}>
      <FieldControl
        field={f}
        getParentValue={parentId ? () => answers.current[parentId]?.value : undefined}
        parentLabel={parentId ? fieldById.get(parentId)?.label : undefined}
        paper={paper}
        compact={compact}
        attachments={attByField[f.id] || []}
        publicMode={props.publicMode}
        getInitial={() => answers.current[f.id] || {}}
        photo={photos[f.id]}
        hasSig={!!sigs[f.id]}
        sigUrl={sigs[f.id]}
        error={errors[f.id]}
        formulaValue={f.type === "formula" ? formulaVals[f.id] ?? null : undefined}
        media={f.type === "table" ? mediaPhotos : undefined}
        onPatch={(patch, render) => {
          patchAnswer(f.id, patch, render);
          if ("value" in patch) pruneChildren(f.id);
        }}
        setPhoto={(d) => {
          setPhotos((prev) => {
            const nextP = { ...prev };
            if (d) nextP[f.id] = d;
            else delete nextP[f.id];
            return nextP;
          });
          patchAnswer(f.id, { ai: undefined });
        }}
        setSig={(d) => {
          dirty.current++; // ลายเซ็นเปลี่ยน = มีการแก้ไข (รูปถ่ายนับผ่าน patchAnswer แล้ว)
          setSigs((prev) => {
            const nextS = { ...prev };
            if (d) nextS[f.id] = d;
            else delete nextS[f.id];
            return nextS;
          });
        }}
      />
    </div>
    );
  };

  const draftBtn = draftsOn ? (
    <Button data-tour="fill-draft" onClick={() => void saveDraftNow("manual")} loading={draftState.kind === "saving"} disabled={mediaLoading} style={{ fontSize: ".8rem", padding: "6px 12px" }} title={t("fw.draftTitle")}>
      <Icon icon={Save} className="h-4 w-4" /> {kase ? t("common.save") : t("draft.save")}
    </Button>
  ) : null;

  const draftNotice = draftsOn && (draftState.kind !== "idle" || versionChanged || mediaLoading) ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", fontSize: ".78rem", margin: "6px 0 2px", color: draftState.kind === "error" ? "var(--fail)" : "var(--ink-3)" }}>
      {draftState.kind === "saving" && <span>{t("draft.saving")}</span>}
      {draftState.kind === "saved" && draftState.at && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon icon={Check} className="h-3.5 w-3.5" /> {t(kase ? "wf.savedAt" : "draft.savedAt").replace("{t}", new Date(draftState.at).toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit" }))}
        </span>
      )}
      {draftState.kind === "error" && <span>⚠ {draftState.msg}</span>}
      {mediaLoading && <span>{t("draft.loadingMedia")}</span>}
      {versionChanged && <span style={{ color: "var(--amber)" }}>⚠ {t("draft.versionChanged")}</span>}
    </div>
  ) : null;

  const viewToggle = (
    <div data-tour="fill-mode" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flex: "0 0 auto" }}>
      {([
        { m: "mobile" as const, label: t("studio.viewMobile") },
        { m: "paper" as const, label: t("studio.viewPaper") },
      ]).map((v, i) => {
        const on = mode === v.m;
        return (
          <button key={v.m} onClick={() => setMode(v.m)}
            style={{ padding: "6px 13px", border: "none", borderLeft: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: on ? 600 : 400, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)" }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );

  // ---------- งาน: แถบสถานะ + ปุ่มส่งต่อ/ส่งกลับ ----------
  const canCancelCase = !!kase && kase.status === "open" &&
    (!!props.workflow?.manager || (caseMine && kase.createdBy === props.userId && !kase.history.some((h) => h.action === "advance")));
  const nextTeam = wf && !viewOnly && !isLastSeg ? whoOf(segEnd + 1) : null;
  const banner = wf ? (
    <>
      <CaseBanner schema={schema} kase={kase} teams={props.workflow!.teams} users={props.workflow!.users} userId={props.userId} segStart={segStart} segEnd={segEnd}
        canClaim={!!props.workflow?.canClaim} claiming={caseBusy} onClaim={doClaim} />
      {caseErr && !caseModal && <div role="alert" style={{ color: "var(--fail)", fontSize: ".85rem", margin: "-4px 0 8px" }}>⚠ {caseErr}</div>}
    </>
  ) : null;
  const handoffLabel = (
    <><Icon icon={Send} className="h-[18px] w-[18px]" /> {nextTeam ? t("wf.handoffTo").replace("{team}", nextTeam) : t("wf.handoff")}</>
  );
  const caseTools = kase && (caseMine || canCancelCase) ? (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {caseMine && segStart > 0 && (
        <Button onClick={() => { setCaseErr(undefined); setCaseModal("return"); }} style={{ fontSize: ".85rem", padding: "8px 14px" }}>
          <Icon icon={CornerUpLeft} className="h-4 w-4" /> {t("wf.return")}
        </Button>
      )}
      {caseMine && kase.assigneeTeam && (
        <Button variant="ghost" onClick={() => { setCaseErr(undefined); setCaseModal("release"); }} style={{ fontSize: ".85rem", padding: "8px 14px" }}>{t("wf.release")}</Button>
      )}
      {canCancelCase && (
        <Button variant="ghost" onClick={() => { setCaseErr(undefined); setCaseModal("cancel"); }} style={{ fontSize: ".85rem", padding: "8px 14px", color: "var(--fail)" }}>{t("wf.cancelCase")}</Button>
      )}
    </div>
  ) : null;
  const caseModals = (
    <>
      {caseModal === "handoff" && (
        <HandoffModal nextTitle={`${segEnd + 2}. ${schema.steps[segEnd + 1]?.title ?? ""}`} teamName={nextTeam} busy={caseBusy} error={caseErr}
          onCancel={() => setCaseModal(null)} onConfirm={doHandoff} />
      )}
      {caseModal === "release" && kase && (
        <CaseConfirmModal title={t("wf.release")} body={t("wf.releaseBody")} confirmLabel={t("wf.release")} busy={caseBusy} error={caseErr}
          onCancel={() => setCaseModal(null)} onConfirm={() => doRelease()} />
      )}
      {caseModal === "cancel" && kase && (
        <CaseConfirmModal title={t("wf.cancelCase")} body={t("wf.cancelBody")} confirmLabel={t("wf.cancelCase")} danger withNote busy={caseBusy} error={caseErr}
          onCancel={() => setCaseModal(null)} onConfirm={(n) => doCancelCase(n)} />
      )}
      {caseModal === "return" && kase && (
        <ReturnModal schema={schema} kase={kase} maxStep={segStart} busy={caseBusy} error={caseErr}
          onCancel={() => setCaseModal(null)} onConfirm={doReturn} />
      )}
    </>
  );

  // ---------- โหมดกระดาษ: กรอกบนกระดาษ A4 จริง ตามตำแหน่งที่ออกแบบไว้ ----------
  if (mode === "paper") {
    return (
      <div>
        {/* แถบเครื่องมืออยู่นอกกระดาษ (พอดีจอ) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ fontSize: "1.05rem" }}><InlineFormIcon value={props.icon} size={18} />{props.title}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {viewToggle}
            <Button onClick={() => window.print()} style={{ fontSize: ".8rem", padding: "6px 12px" }} title={t("fw.printPaper")} aria-label={t("fw.printPaper")}>
              <Icon icon={Printer} className="h-4 w-4" /> {t("sub.print")}
            </Button>
            {draftBtn}
            {!props.publicMode && <Button variant="ghost" onClick={exitForm} style={{ fontSize: ".8rem" }}>{t("fill.exit")}</Button>}
          </div>
        </div>

        {draftNotice}
        {banner}
        {attForm.length > 0 && <AttachmentChips items={attForm} variant="form" />}

        {schema.steps.map((st, si) => (
          lockedStep(si) ? null : <div key={st.id}>{fillBar(st)}</div>
        ))}

        <FormPaperFill
          schema={schema}
          icon={props.icon}
          title={props.title}
          userName={props.userName}
          renderField={(f) => renderField(f, true, true)}
        />

        {!viewOnly && (
          <div style={{ marginTop: 14 }}>
            <Button data-tour="fill-submit" variant="primary" onClick={submitPaper} loading={submitting} disabled={mediaLoading} style={{ width: "100%", padding: 14, fontSize: "1.02rem" }}>
              {submitting ? t("fill.submitting") : wf && !isLastSeg ? handoffLabel : <><Icon icon={CheckCircle2} className="h-[18px] w-[18px]" /> {t("fill.submit")}</>}
            </Button>
          </div>
        )}
        {caseTools}
        {caseModals}
      </div>
    );
  }

  // ---------- โหมดมือถือ: ทีละขั้นตอน ----------
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 20, boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.05rem" }}><InlineFormIcon value={props.icon} size={18} />{props.title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {viewToggle}
          {draftBtn}
          {!props.publicMode && <Button variant="ghost" onClick={exitForm} style={{ fontSize: ".8rem" }}>{t("fill.exit")}</Button>}
        </div>
      </div>

      {draftNotice}
      {banner}
      {attForm.length > 0 && <AttachmentChips items={attForm} variant="form" />}

      <div style={{ display: "flex", gap: 6, margin: "10px 0 16px" }}>
        {schema.steps.map((s, i) => (
          <span key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: i === idx ? "var(--accent)" : i < idx || (wf && kase && (kase.status === "done" || i < kase.stepIdx)) ? "var(--pass)" : "var(--line)", opacity: wf && lockedStep(i) && i !== idx ? 0.55 : 1 }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
        <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
          STEP {idx + 1}/{schema.steps.length}
        </span>
        <h3 style={{ fontSize: "1.05rem" }}>{step.title}</h3>
      </div>

      {wf && lockedStep(idx) && !viewOnly && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("wf.stepLocked")}
        </div>
      )}
      {!lockedStep(idx) && fillBar(step)}

      {step.fields.map((f) => renderField(f))}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {idx > 0 && <Button onClick={() => { setIdx(idx - 1); latest.current.idx = idx - 1; window.scrollTo(0, 0); void saveDraftNow("auto"); }}>{t("fill.prev")}</Button>}
        {!(viewOnly && idx >= maxIdx) && (
          <Button data-tour="fill-submit" variant="primary" onClick={next} loading={submitting} disabled={mediaLoading && idx === maxIdx} style={{ flex: 1, padding: 14, fontSize: "1.02rem" }}>
            {submitting ? t("fill.submitting")
              : idx < maxIdx || viewOnly ? t("fill.next")
              : wf && !isLastSeg ? handoffLabel
              : <><Icon icon={CheckCircle2} className="h-[18px] w-[18px]" /> {t("fill.submit")}</>}
          </Button>
        )}
      </div>
      {caseTools}
      {caseModals}
      <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
        <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("fill.locked")}
      </div>
    </div>
  );
}

// ============ single field control ============
function useIsNarrow() {
  const [n, setN] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setN(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return n;
}

/**
 * สถานะแถวของตาราง (ใช้ร่วมทั้งหน้ากรอกปกติและกระดาษ)
 * - ทุกครั้งที่แก้: คำนวณคอลัมน์สูตรของแถวนั้นใหม่ แล้วส่งค่าขึ้นไป (คำตอบจึงมีผลสูตรเสมอ)
 * - คอลัมน์สแกน: สแกนต่อเนื่อง ใส่ช่องว่างแรกของคอลัมน์ ไม่มีช่องว่าง → เพิ่มแถวใหม่
 */
function useTableRows(cols: TableColumn[], rows: TableRow[], setRows: React.Dispatch<React.SetStateAction<TableRow[]>>, onChange: (rows: TableRow[]) => void, fieldId = "", media?: MediaPhotos) {
  const [scanOpen, setScanOpen] = useState(false);
  const scanCol = cols.find((c) => c.type === "scan");
  // แถวล่าสุด (สแกนต่อเนื่องเรียกถี่กว่ารอบ render) — แถวเปลี่ยนผ่าน commit เท่านั้น จึงตรงกับ state เสมอ
  const live = useRef(rows);
  const commit = (next: TableRow[]) => { live.current = next; setRows(next); onChange(next); };
  const setCell = (ri: number, cid: string, v: string) =>
    commit(live.current.map((r, i) => (i === ri ? computeRow(cols, { ...r, [cid]: v }) : r)));
  const addRow = () => commit([...live.current, {}]);
  const photoCols = cols.filter((c) => c.type === "photo");
  const dropRowPhotos = (r: TableRow | undefined) => { if (r && media) for (const c of photoCols) { const k = cellPhotoKey(r, c.id); if (k) media.set(k, null); } };
  const delRow = (ri: number) => { dropRowPhotos(live.current[ri]); commit(live.current.length > 1 ? live.current.filter((_, i) => i !== ri) : [{}]); };
  /** รูปของช่อง: ย่อรูป → เก็บด้วย key ของช่อง (มีอยู่แล้วใช้ key เดิม = ถ่ายทับ) */
  const onPhoto = async (ri: number, cid: string, file: File | null) => {
    if (!media) return;
    const cur = live.current[ri] ? cellPhotoKey(live.current[ri], cid) : undefined;
    if (!file) { if (cur) media.set(cur, null); setCell(ri, cid, ""); return; }
    try {
      const data = await shrinkImage(file);
      const key = cur ?? newRowPhotoKey(fieldId, cid);
      media.set(key, data);
      setCell(ri, cid, key);
    } catch { /* อ่านรูปไม่ได้ — ข้าม */ }
  };
  const photoOf = (key: string | undefined) => (key && media ? media.get(key) : undefined);
  const onScanned = (code: string) => {
    if (!scanCol) return;
    const cur = live.current;
    const at = cur.findIndex((r) => !String(r[scanCol.id] ?? "").trim());
    if (at >= 0) commit(cur.map((r, i) => (i === at ? computeRow(cols, { ...r, [scanCol.id]: code }) : r)));
    else commit([...cur, computeRow(cols, { [scanCol.id]: code })]);
  };
  return { commit, setCell, addRow, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf };
}

// ตารางกรอกข้อมูล — desktop = ตาราง, มือถือ = การ์ดต่อแถว
function TableInput({
  columns, minRows, initial, onChange, variant, fieldId, media,
}: {
  fieldId: string;
  media?: MediaPhotos;
  columns: TableColumn[];
  minRows: number;
  initial: TableRow[];
  onChange: (rows: TableRow[]) => void;
  variant: "normal" | "paper" | "compact";
}) {
  const { t, tt } = useT();
  const cols = columns.length ? columns : [{ id: "c0", label: t("fw.colItem"), type: "text" as const }];
  const [rows, setRows] = useState<TableRow[]>(() => {
    const base = initial.length ? initial.map((r) => computeRow(cols, { ...r })) : [];
    while (base.length < Math.max(1, minRows)) base.push({});
    return base;
  });
  const narrow = useIsNarrow();
  const cards = narrow || variant === "compact";
  const small = variant !== "normal";
  // สีกระดาษ (ขาว/ดำ) เฉพาะมุมมองกระดาษ — มุมมองปกติใช้สีตามธีม (โหมดมืดไม่ขาวโพลน)
  const ink = small
    ? { field: "#fff", text: "#111", border: "#c3c8ce", card: "#fafbfc", cardBorder: "#d5d9de", muted: "#555", head: "#444", rule: "#ccc" }
    : { field: "var(--surface)", text: "var(--ink)", border: "var(--line)", card: "var(--code-bg)", cardBorder: "var(--line)", muted: "var(--ink-2)", head: "var(--ink-2)", rule: "var(--line)" };

  const { setCell, addRow, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf } = useTableRows(cols, rows, setRows, onChange, fieldId, media);

  const cellInput = (ri: number, c: TableColumn) => {
    const st: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: small ? "5px 7px" : "8px 9px", border: `1px solid ${ink.border}`, borderRadius: 6, background: ink.field, color: ink.text, fontFamily: "inherit", fontSize: small ? ".82rem" : ".95rem" };
    return <TableCell col={c} value={rows[ri]?.[c.id] ?? ""} onChange={(v) => setCell(ri, c.id, v)} look={small ? "small" : "normal"} style={st} iconOnly={!cards}
      photoUrl={c.type === "photo" ? photoOf(rows[ri] ? cellPhotoKey(rows[ri], c.id) : undefined) : undefined} onPhoto={(f) => void onPhoto(ri, c.id, f)} />;
  };

  const btnSt: React.CSSProperties = { marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 };
  const addBtn = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={addRow} style={btnSt}>
        <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("fw.addRow")}
      </button>
      {scanCol && (
        <button type="button" onClick={() => setScanOpen(true)} style={{ ...btnSt, background: "var(--accent)", color: "var(--accent-ink)" }}>
          <Icon icon={ScanLine} className="h-3.5 w-3.5" /> {t("ctype.scanAdd")}
        </button>
      )}
      {scanOpen && <LiveScanner continuous onResult={onScanned} onClose={() => setScanOpen(false)} />}
    </div>
  );

  if (cards) {
    return (
      <div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((_, ri) => (
            <div key={ri} style={{ border: `1px solid ${ink.cardBorder}`, borderRadius: 10, padding: 10, background: ink.card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <b style={{ fontSize: ".78rem", color: ink.muted }}>{tt("fw.rowN", { n: ri + 1 })}</b>
                <button type="button" onClick={() => delRow(ri)} aria-label={t("fw.deleteRow")} style={{ border: "none", background: "transparent", color: "var(--fail)", cursor: "pointer", minWidth: 36, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon icon={Trash2} className="h-4 w-4" /></button>
              </div>
              <div style={{ display: "grid", gap: 7 }}>
                {cols.map((c) => (
                  <label key={c.id} style={{ display: "grid", gap: 3 }}>
                    <span style={{ fontSize: ".76rem", color: ink.muted, fontWeight: 600 }}>{c.label}</span>
                    {cellInput(ri, c)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {addBtn}
      </div>
    );
  }

  const totalW = cols.reduce((s, c) => s + (c.width || 1), 0);
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: cols.length * 90 + 44 }}>
          <colgroup>
            {cols.map((c) => <col key={c.id} style={{ width: `${((c.width || 1) / totalW) * 96}%` }} />)}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => <th key={c.id} style={{ textAlign: c.type === "formula" ? "right" : "left", fontSize: small ? ".76rem" : ".82rem", color: ink.head, padding: "4px 6px", borderBottom: `1px solid ${ink.rule}`, fontWeight: 700 }}>{c.type === "formula" ? "ƒ " : ""}{c.label}</th>)}
              <th style={{ borderBottom: `1px solid ${ink.rule}` }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((_, ri) => (
              <tr key={ri}>
                {cols.map((c) => <td key={c.id} style={{ padding: "3px 5px", verticalAlign: "top" }}>{cellInput(ri, c)}</td>)}
                <td style={{ padding: "3px 2px", textAlign: "center", verticalAlign: "middle" }}>
                  <button type="button" onClick={() => delRow(ri)} aria-label={t("fw.deleteRow")} style={{ border: "none", background: "transparent", color: "var(--fail)", cursor: "pointer", minWidth: 36, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon icon={Trash2} className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addBtn}
    </div>
  );
}

function FieldControl({
  field: f,
  attachments = [],
  getInitial,
  photo,
  hasSig,
  sigUrl,
  error,
  onPatch,
  setPhoto,
  setSig,
  paper = false,
  compact = false,
  publicMode = false,
  getParentValue,
  parentLabel,
  formulaValue,
  media,
}: {
  field: FormField;
  /** รูปถ่ายต่อแถวของตาราง */
  media?: MediaPhotos;
  /** ผลคำนวณของฟิลด์สูตร (null = ยังคำนวณไม่ได้) */
  formulaValue?: number | null;
  /** อ่านค่าของฟิลด์แม่ (dropdown ที่กรองตามกัน) */
  getParentValue?: () => unknown;
  parentLabel?: string;
  attachments?: Attachment[];
  getInitial: () => Answer;
  photo?: string;
  hasSig: boolean;
  /** รูปลายเซ็นที่เซ็นแล้ว (โหมดกระดาษแสดงในกล่อง) */
  sigUrl?: string;
  error?: string;
  onPatch: (patch: Partial<Answer>, render?: boolean) => void;
  setPhoto: (d: string | null) => void;
  setSig: (d: string | null) => void;
  paper?: boolean;
  compact?: boolean;
  publicMode?: boolean;
}) {
  const { t, tt } = useT();
  const [initial] = useState(getInitial);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(initial.ai || "");
  const [scanMsg, setScanMsg] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [scanValue, setScanValue] = useState<string>(typeof initial.value === "string" ? initial.value : "");
  const photoRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await shrinkImage(file));
      setAiResult("");
    } catch {
      /* ignore */
    }
    e.target.value = "";
  }
  async function aiCheck() {
    if (!photo) return;
    setAiBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", dataUrlToBlob(photo), "photo.jpg");
      fd.append("hint", f.photo_hint || "");
      fd.append("label", f.label);
      const res = await fetch("/api/ai/check-photo", { method: "POST", body: fd });
      const j = await res.json();
      const txt = res.ok ? (j.reason || (j.ok ? "ผ่าน" : "ควรตรวจสอบ")) : j.error || "ตรวจไม่ได้";
      setAiResult(txt);
      onPatch({ ai: txt });
    } catch {
      setAiResult(t("fw.ai.failed"));
    } finally {
      setAiBusy(false);
    }
  }
  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanMsg(t("fw.scan.reading"));
    const code = await detectBarcode(file);
    if (code) {
      onPatch({ value: code });
      setScanValue(code);
      setScanMsg(tt("fw.scan.read", { code }));
    } else setScanMsg(t("fw.scan.fail"));
    e.target.value = "";
  }

  const box: React.CSSProperties = compact
    ? { border: "none", borderRadius: 0, padding: 0, margin: 0, background: "transparent", color: "#111" }
    : paper
    ? { border: "none", borderBottom: "1px solid #e5e5e5", borderRadius: 0, padding: "11px 0 13px", margin: 0, background: "transparent", color: "#111" }
    : { border: "1px solid var(--line)", borderRadius: 10, padding: 14, margin: "10px 0", background: "var(--surface)" };
  const input: React.CSSProperties = compact
    ? { width: "100%", padding: "5px 8px", border: "1px solid #b9bec4", borderRadius: 5, background: "#fff", color: "#111", fontFamily: "inherit", fontSize: ".82rem" }
    : paper
    ? { width: "100%", padding: "8px 11px", border: "1px solid #b9bec4", borderRadius: 6, background: "#fff", color: "#111", fontFamily: "inherit", fontSize: ".95rem" }
    : { width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem" };
  const [numValue, setNumValue] = useState(String(initial.value ?? ""));
  const [pf, setPf] = useState(typeof initial.value === "string" ? initial.value : "");
  const [cbVals, setCbVals] = useState<string[]>(Array.isArray(initial.value) && typeof initial.value[0] === "string" ? (initial.value as string[]) : []);
  const [selVal, setSelVal] = useState<string>(typeof initial.value === "string" ? initial.value : "");
  const [sigOpen, setSigOpen] = useState(false);
  // ตัวเลือกจากข้อมูลอ้างอิง (ดึงไม่ได้ → ใช้ตัวเลือกที่พิมพ์ไว้แทน)
  const parentValue = getParentValue?.();
  const optLabels = useMemo(() => labelMap(f.options, f.option_labels), [f.options, f.option_labels]);
  const dsBound = !!f.options_source && !f.options_error && (f.type === "select" || f.type === "checkbox");
  const dsOptions = dsBound ? filterOptions(f.options || [], f.options_parents, parentValue) : [];
  const waitParent = dsBound && !!f.options_parents && (parentValue == null || parentValue === "" || (Array.isArray(parentValue) && parentValue.length === 0));
  const [dtDefault] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  // seed datetime default so an untouched required field still submits
  useEffect(() => {
    if (f.type === "datetime" && (initial.value == null || initial.value === "")) {
      onPatch({ value: dtDefault });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- โหมดกระดาษ (compact): ใช้ชิ้นส่วนเดียวกับ Editor ให้พอดีกล่องที่ออกแบบ ----------
  // เนื้อหาที่งอกเกินกล่อง (หมายเหตุตอนไม่ผ่าน, error, เอกสารแนบ, แถวตารางที่เพิ่ม)
  // จะดันช่องด้านล่างลงเอง (FormPaperFill.reflow) — ไม่ทับกัน
  if (compact) {
    const staticOpts = f.options || [];
    return (
      <div>
        {f.type !== "table" && <PaperLabel label={f.label} required={f.required} right={(f.type === "number" || f.type === "formula") && f.unit ? <span style={{ fontSize: ".72rem", color: "#666", fontWeight: 400 }}>{f.unit}</span> : undefined} />}
        {f.type === "formula" && (
          <div aria-live="polite" title={t("formula.auto")}
            style={{ ...paperInputStyle, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, background: "#f4f6f8", fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: formulaValue == null ? "#999" : outOfRange(formulaValue, f) ? "#dc2626" : "#111", ...(outOfRange(formulaValue ?? null, f) ? { borderColor: "#dc2626" } : {}) }}>
            <span style={{ marginRight: "auto", fontSize: ".66rem", fontWeight: 400, color: "#999" }}>ƒ</span>
            {formulaValue == null ? t("formula.pending") : formatNumber(formulaValue, f.decimals ?? 2)}
          </div>
        )}
        {f.type === "text" && (
          <input type="text" style={paperInputStyle} defaultValue={String(initial.value ?? "")} placeholder={f.example ? tt("fw.examplePh", { ex: f.example }) : ""} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {f.type === "number" && (
          <input type="number" inputMode="decimal" style={{ ...paperInputStyle, ...(numOut(f, numValue) ? { borderColor: "#dc2626", color: "#dc2626" } : {}) }} value={numValue} placeholder={f.example || ""} title={f.min != null || f.max != null ? tt("fw.rangeTitle", { min: f.min ?? "–", max: f.max ?? "–" }) : undefined} onChange={(e) => { setNumValue(e.target.value); onPatch({ value: e.target.value }); }} />
        )}
        {f.type === "datetime" && (
          <input type="datetime-local" style={paperInputStyle} defaultValue={String(initial.value ?? dtDefault)} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {(f.type === "select" || f.type === "checkbox") && (
          dsBound ? (
            waitParent || dsOptions.length === 0 ? (
              <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", color: "#888", background: "#f7f7f8" }}>
                {waitParent ? tt("fw.pickParentFirst", { label: parentLabel || t("fw.prevField") }) : t("fw.noOptions")}
              </div>
            ) : dsOptions.length <= 6 ? (
              <PaperChoices name={"r_" + f.id} options={dsOptions} labels={optLabels.size ? optLabels : undefined} multiple={f.type === "checkbox"} value={f.type === "checkbox" ? cbVals : selVal}
                onChange={(v) => { if (Array.isArray(v)) { setCbVals(v); onPatch({ value: v }); } else { setSelVal(v); onPatch({ value: v || undefined }); } }} />
            ) : f.type === "select" ? (
              // รายการยาว + เลือกข้อเดียว: dropdown บรรทัดเดียวพอดีกล่อง
              <select style={paperInputStyle} value={selVal} onChange={(e) => { setSelVal(e.target.value); onPatch({ value: e.target.value || undefined }); }}>
                <option value="">{t("fw.selectPh")}</option>
                {dsOptions.map((o) => { const l = optLabels.get(o); return <option key={o} value={o}>{l ? `${l} · ${o}` : o}</option>; })}
              </select>
            ) : (
              <OptionPicker name={"r_" + f.id} options={dsOptions} labels={optLabels.size ? optLabels : undefined} multiple value={cbVals} paper compact
                onChange={(v) => { if (Array.isArray(v)) { setCbVals(v); onPatch({ value: v }); } }} />
            )
          ) : (
            <PaperChoices name={"r_" + f.id} options={staticOpts} multiple={f.type === "checkbox"} value={f.type === "checkbox" ? cbVals : selVal}
              onChange={(v) => { if (Array.isArray(v)) { setCbVals(v); onPatch({ value: v }); } else { setSelVal(v); onPatch({ value: v }); } }} />
          )
        )}
        {f.type === "pass_fail" && (
          <>
            <PaperPassFail value={pf} onChange={(v) => { setPf(v); onPatch({ value: v }, true); }} />
            {pf === "fail" && (
              <textarea style={{ ...paperInputStyle, height: 44, padding: "4px 8px", marginTop: 4, resize: "vertical" }} defaultValue={initial.note || ""} placeholder={t("fw.failNotePh")} onChange={(e) => onPatch({ note: e.target.value })} />
            )}
          </>
        )}
        {f.type === "photo" && (
          <>
            <PaperPhoto photo={photo} onPick={() => photoRef.current?.click()}
              extra={photo && !publicMode ? (
                <button type="button" onClick={aiCheck} disabled={aiBusy} title={aiResult || t("fw.ai.ask")} style={{ height: 28, display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #b9bec4", borderRadius: 4, background: "#fff", color: "#333", fontFamily: "inherit", fontSize: ".74rem", padding: "0 8px", cursor: "pointer", maxWidth: 160, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <Icon icon={Sparkles} className="h-3.5 w-3.5" /> {aiBusy ? t("fw.ai.checking") : aiResult || t("fw.ai.check")}
                </button>
              ) : undefined} />
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
          </>
        )}
        {f.type === "signature" && (
          <>
            <PaperSignature url={sigUrl} onOpen={() => setSigOpen(true)} />
            {sigOpen && <SignatureModal label={f.label} initialUrl={sigUrl} onClose={() => setSigOpen(false)} onSave={(d) => { setSig(d); setSigOpen(false); }} />}
          </>
        )}
        {f.type === "table" && (
          <PaperTableField field={f} media={media}
            initial={Array.isArray(initial.value) && typeof initial.value[0] === "object" ? (initial.value as TableRow[]) : []}
            onChange={(rows) => onPatch({ value: rows }, false)} />
        )}
        {f.options_error && (f.type === "select" || f.type === "checkbox") && (
          <div style={{ fontSize: ".7rem", color: "#b45309", marginTop: 2 }}>⚠ {f.options_error}</div>
        )}
        {attachments.length > 0 && <AttachmentChips items={attachments} paper />}
        {error && <div style={{ fontSize: ".72rem", color: "#dc2626", marginTop: 2 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ ...box, ...(error ? (paper ? { borderBottomColor: "var(--fail)" } : { borderColor: "var(--fail)" }) : {}) }}>
      <div style={{ fontWeight: compact ? 700 : 600, fontSize: compact ? ".78rem" : undefined, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", color: paper ? "#111" : undefined }}>
        {f.label}
        {f.required && <span style={{ color: "var(--fail)", fontWeight: 700 }}>*</span>}
        {!paper && (
          <span style={{ fontFamily: "monospace", fontSize: ".65rem", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>
            {t(`ftype.${f.type}`)}
          </span>
        )}
      </div>
      {!compact && f.tooltip && (
        <div style={{ fontSize: ".83rem", color: paper ? "#555" : "var(--ink-2)", background: paper ? "#f4f5f6" : "var(--code-bg)", borderRadius: 7, padding: "7px 11px", margin: "8px 0", display: "flex", gap: 7, alignItems: "flex-start" }}>
          <span aria-hidden style={{ color: "var(--amber)", marginTop: 1 }}><Icon icon={Lightbulb} className="h-4 w-4" /></span>
          <span>{f.tooltip}</span>
        </div>
      )}
      {attachments.length > 0 && <AttachmentChips items={attachments} paper={paper} />}

      {!compact && f.photo_hint && (
        <div style={{ fontSize: ".8rem", color: paper ? "#777" : "var(--ink-3)", margin: "4px 0" }}>
          {t("fw.photoMustShow")} <code style={{ background: paper ? "#f4f5f6" : "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.photo_hint}</code>
        </div>
      )}

      <div style={{ marginTop: compact ? 4 : 8 }}>
        {f.type === "text" && (
          compact
            ? <input type="text" style={input} defaultValue={String(initial.value ?? "")} placeholder={f.example ? tt("fw.examplePh", { ex: f.example }) : t("fw.answerPh")} onChange={(e) => onPatch({ value: e.target.value })} />
            : <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} rows={2} defaultValue={String(initial.value ?? "")} placeholder={f.example ? tt("fw.examplePh", { ex: f.example }) : t("fw.answerPh")} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {f.type === "number" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" inputMode="decimal" style={{ ...input, flex: 1 }} value={numValue} placeholder={f.example || "0"} onChange={(e) => { setNumValue(e.target.value); onPatch({ value: e.target.value }); }} />
              {f.unit && <span style={{ color: "var(--ink-2)" }}>{f.unit}</span>}
            </div>
            {(f.min != null || f.max != null) && <NumHint field={f} value={numValue} />}
          </>
        )}
        {f.type === "datetime" && (
          <input type="datetime-local" style={input} defaultValue={String(initial.value ?? dtDefault)} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {f.type === "formula" && (() => {
          const bad = outOfRange(formulaValue ?? null, f);
          return (
            <>
              <div aria-live="polite" style={{ ...input, display: "flex", alignItems: "center", gap: 10, background: paper ? "#f4f6f8" : "var(--code-bg)", cursor: "default", ...(bad ? { borderColor: "var(--fail)" } : {}) }}>
                <span style={{ fontSize: ".74rem", color: paper ? "#888" : "var(--ink-3)" }}>ƒ {t("formula.auto")}</span>
                <b className="tabnum" style={{ marginLeft: "auto", fontSize: "1.05rem", color: formulaValue == null ? (paper ? "#999" : "var(--ink-3)") : bad ? "var(--fail)" : undefined }}>
                  {formulaValue == null ? t("formula.pending") : formatNumber(formulaValue, f.decimals ?? 2)}
                </b>
                {f.unit && formulaValue != null && <span style={{ color: paper ? "#555" : "var(--ink-2)" }}>{f.unit}</span>}
              </div>
              {(f.min != null || f.max != null) && <NumHint field={f} value={formulaValue == null ? "" : String(formulaValue)} />}
            </>
          );
        })()}
        {dsBound && (
          waitParent ? (
            <div style={{ fontSize: compact ? ".78rem" : ".88rem", color: paper ? "#777" : "var(--ink-3)", padding: compact ? "2px 0" : "8px 2px" }}>
              {tt("fw.pickParentFirst", { label: parentLabel || t("fw.prevField") })}
            </div>
          ) : dsOptions.length === 0 ? (
            <div style={{ fontSize: compact ? ".78rem" : ".88rem", color: paper ? "#777" : "var(--ink-3)", padding: compact ? "2px 0" : "8px 2px" }}>
              {f.options_parents ? tt("fw.noOptionsFor", { v: Array.isArray(parentValue) ? parentValue.join(", ") : String(parentValue) }) : t("fw.noOptions")}
            </div>
          ) : (
            <OptionPicker
              name={"r_" + f.id}
              options={dsOptions}
              labels={optLabels.size ? optLabels : undefined}
              multiple={f.type === "checkbox"}
              value={f.type === "checkbox" ? cbVals : selVal}
              paper={paper}
              compact={compact}
              onChange={(v) => {
                if (Array.isArray(v)) { setCbVals(v); onPatch({ value: v }); }
                else { setSelVal(v); onPatch({ value: v || undefined }); }
              }}
            />
          )
        )}
        {dsBound && f.options_truncated && !compact && (
          <div style={{ fontSize: ".74rem", color: paper ? "#888" : "var(--ink-3)", margin: "4px 0" }}>{t("fw.truncated")}</div>
        )}
        {f.options_error && (f.type === "select" || f.type === "checkbox") && (
          <div style={{ fontSize: ".76rem", color: "var(--amber)", margin: "4px 0" }}>⚠ {f.options_error}</div>
        )}
        {f.type === "select" && !dsBound &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px" }}>
              <input type="radio" name={"r_" + f.id} value={o} defaultChecked={initial.value === o} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} onChange={() => onPatch({ value: o })} />
              {o}
            </label>
          ))}
        {f.type === "checkbox" && !dsBound &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px" }}>
              <input
                type="checkbox"
                value={o}
                checked={cbVals.includes(o)}
                style={{ width: 20, height: 20, accentColor: "var(--accent)" }}
                onChange={(e) => {
                  const nextVals = e.target.checked ? [...new Set([...cbVals, o])] : cbVals.filter((x) => x !== o);
                  setCbVals(nextVals);
                  onPatch({ value: nextVals });
                }}
              />
              {o}
            </label>
          ))}
        {f.type === "pass_fail" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PfBtn active={pf === "pass"} kind="pass" paper={paper} onClick={() => { setPf("pass"); onPatch({ value: "pass" }, true); }}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon icon={Check} className="h-4 w-4" /> {t("fw.pass")}</span></PfBtn>
              <PfBtn active={pf === "fail"} kind="fail" paper={paper} onClick={() => { setPf("fail"); onPatch({ value: "fail" }, true); }}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon icon={X} className="h-4 w-4" /> {t("fw.fail")}</span></PfBtn>
            </div>
            {pf === "fail" && (
              <textarea style={{ ...input, minHeight: 56, marginTop: 10, resize: "vertical" }} rows={2} defaultValue={initial.note || ""} placeholder={t("fw.failNotePh")} onChange={(e) => onPatch({ note: e.target.value })} />
            )}
          </>
        )}
        {f.type === "photo" && (
          <>
            <div onClick={() => photoRef.current?.click()} style={{ border: paper ? "2px dashed #b9bec4" : "2px dashed var(--line)", borderRadius: 10, padding: compact ? 8 : 18, textAlign: "center", color: paper ? "#777" : "var(--ink-3)", fontSize: compact ? ".8rem" : ".9rem", cursor: "pointer" }}>
              {photo && <img src={photo} alt={t("fw.photoAlt")} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", margin: "0 auto 8px" }} />}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{photo ? t("fw.retake") : <><Icon icon={Camera} className="h-4 w-4" /> {t("fw.takePhoto")}</>}</div>
            </div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
            {/* โหมด public: ไม่มี AI ตรวจรูป (endpoint ต้องล็อกอิน + ใช้เครดิต tenant) */}
            {photo && !publicMode && (
              <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button onClick={aiCheck} disabled={aiBusy}>{aiBusy ? t("fw.ai.checkingLong") : <><Icon icon={Sparkles} className="h-4 w-4" /> {t("fw.ai.ask")}</>}</Button>
                {aiResult && <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{aiResult}</span>}
              </div>
            )}
          </>
        )}
        {f.type === "barcode" && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="text" style={{ ...input, flex: 1, minWidth: 140 }} value={scanValue} placeholder={t("fw.codePh")} onChange={(e) => { setScanValue(e.target.value); onPatch({ value: e.target.value }); }} />
              <Button variant="primary" onClick={() => setLiveOpen(true)}><Icon icon={ScanLine} className="h-4 w-4" /> {t("scan.live")}</Button>
              <Button onClick={() => scanRef.current?.click()}><Icon icon={Camera} className="h-4 w-4" /> {t("scan.fromImage")}</Button>
            </div>
            <input ref={scanRef} type="file" accept="image/*" capture="environment" hidden onChange={onScan} />
            {scanMsg && <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>{scanMsg}</div>}
            {liveOpen && (
              <LiveScanner
                onClose={() => setLiveOpen(false)}
                onResult={(code) => { setLiveOpen(false); setScanValue(code); onPatch({ value: code }); setScanMsg(tt("fw.scan.read", { code })); }}
              />
            )}
          </>
        )}
        {f.type === "signature" && <SignaturePad hasSig={hasSig} onSave={setSig} paper={paper} compact={compact} />}
        {f.type === "table" && (
          <TableInput
            fieldId={f.id}
            media={media}
            columns={f.columns || []}
            minRows={f.min_rows || 1}
            initial={Array.isArray(initial.value) && typeof initial.value[0] === "object" ? (initial.value as TableRow[]) : []}
            onChange={(rows) => onPatch({ value: rows }, false)}
            variant={compact ? "compact" : paper ? "paper" : "normal"}
          />
        )}
      </div>

      {error && <div style={{ fontSize: ".82rem", color: "var(--fail)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function NumHint({ field: f, value }: { field: FormField; value?: string }) {
  const v = parseFloat(String(value));
  const out = Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max));
  const { t, tt } = useT();
  return (
    <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
      {t("fw.rangeLabel")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{tt("fw.rangeVal", { min: f.min ?? "–", max: f.max ?? "–" })} {f.unit || ""}</code>
      {out && <span style={{ color: "var(--fail)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4 }}><Icon icon={AlertTriangle} className="h-3.5 w-3.5" /> {t("fw.outOfRange")}</span>}
    </div>
  );
}

function PfBtn({ active, kind, onClick, children, paper = false }: { active: boolean; kind: "pass" | "fail"; onClick: () => void; children: React.ReactNode; paper?: boolean }) {
  const on = kind === "pass"
    ? { background: "var(--pass-soft)", borderColor: "var(--pass)", color: "var(--pass)" }
    : { background: "var(--fail-soft)", borderColor: "var(--fail)", color: "var(--fail)" };
  const base = paper
    ? { border: "1px solid #b9bec4", background: "#fff", color: "#111" }
    : { border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" };
  return (
    <button onClick={onClick} style={{ padding: 14, fontWeight: 700, fontSize: "1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", ...base, ...(active ? on : {}) }}>
      {children}
    </button>
  );
}

function SignaturePad({ hasSig, onSave, paper = false, compact = false }: { hasSig: boolean; onSave: (d: string | null) => void; paper?: boolean; compact?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number]>([0, 0]);
  const h = compact ? 60 : 140;

  const setup = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = cv.offsetWidth * 2;
    cv.height = h * 2;
    const ctx = cv.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = paper ? "#111" : getComputedStyle(document.body).color;
  }, [paper, h]);
  useEffect(() => { setup(); }, [setup]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  return (
    <>
      <canvas
        ref={ref}
        style={{ width: "100%", height: h, border: paper ? "1px dashed #b9bec4" : "1px dashed var(--line)", borderRadius: 10, background: paper ? "#fff" : "var(--surface)", touchAction: "none", display: "block" }}
        onPointerDown={(e) => { drawing.current = true; last.current = pos(e); ref.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(last.current[0], last.current[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
          last.current = p;
          onSave(ref.current!.toDataURL("image/png"));
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div style={{ marginTop: 6 }}>
        <Button onClick={() => { const ctx = ref.current!.getContext("2d")!; ctx.clearRect(0, 0, ref.current!.width, ref.current!.height); onSave(null); }}>{t("fw.sig.clear")}</Button>
        {hasSig && <span style={{ marginLeft: 10, color: "var(--pass)", fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={Check} className="h-3.5 w-3.5" /> {t("fw.sig.signed")}</span>}
      </div>
    </>
  );
}

/**
 * ค่าที่สแกน/AI อ่านได้ → ค่าที่ต้องบันทึก สำหรับ dropdown ที่ "แสดงชื่อ เก็บรหัส"
 * ตรงกับรหัสอยู่แล้ว = ใช้เลย · ตรงกับชื่อ (ไม่สนตัวพิมพ์) = แปลงเป็นรหัส · ไม่ตรง = คงค่าเดิมให้คนแก้
 */
function toCode(f: FormField | undefined, value: string): string {
  if (!f?.option_labels || !f.options || f.options.includes(value)) return value;
  const v = value.trim().toLowerCase();
  const i = f.option_labels.findIndex((l) => l && l.trim().toLowerCase() === v);
  return i >= 0 ? f.options[i] : value;
}

/** ค่าตัวเลขนอกช่วงที่กำหนด */
function numOut(f: FormField, value: string): boolean {
  const v = parseFloat(value);
  return Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max));
}

/** ตารางในโหมดกระดาษ: ชื่อช่อง + ปุ่ม "+ แถว" ในบรรทัดเดียว แล้วตารางจริงแถวสูงเท่าที่ออกแบบ */
function PaperTableField({ field: f, initial, onChange, media }: { field: FormField; initial: TableRow[]; onChange: (rows: TableRow[]) => void; media?: MediaPhotos }) {
  const [rows, setRows] = useState<TableRow[]>(() => {
    const base = initial.length ? initial.map((r) => computeRow(f.columns || [], { ...r })) : [];
    while (base.length < Math.max(1, f.min_rows || 1)) base.push({});
    return base;
  });
  const { setCell, addRow, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf } = useTableRows(f.columns || [], rows, setRows, onChange, f.id, media);
  const { t } = useT();
  return (
    <>
      <PaperLabel label={f.label} required={f.required} right={
        <span style={{ display: "inline-flex", gap: 4 }}>
          {scanCol && (
            <button type="button" className="no-print" onClick={() => setScanOpen(true)} title={t("ctype.scanAdd")} aria-label={t("ctype.scanAdd")}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid #2f6fe0", borderRadius: 4, background: "#2f6fe0", color: "#fff", fontFamily: "inherit", fontSize: ".7rem", fontWeight: 600, padding: "0 6px", cursor: "pointer" }}>
              <Icon icon={ScanLine} className="h-3 w-3" /> {t("ctype.scan")}
            </button>
          )}
          <PaperAddRow onClick={addRow} />
        </span>
      } />
      <PaperTable
        columns={f.columns || []}
        rows={rows}
        onCell={setCell}
        onDelete={rows.length > 1 ? delRow : undefined}
        photoOf={(ri, cid) => photoOf(rows[ri] ? cellPhotoKey(rows[ri], cid) : undefined)}
        onPhoto={(ri, cid, file) => void onPhoto(ri, cid, file)}
      />
      {scanOpen && <LiveScanner continuous onResult={onScanned} onClose={() => setScanOpen(false)} />}
    </>
  );
}

/** แผ่นเซ็นเต็มจอ (โหมดกระดาษ) — กดบันทึกจึงเขียนลงฟอร์ม */
function SignatureModal({ label, initialUrl, onSave, onClose }: { label: string; initialUrl?: string; onSave: (d: string | null) => void; onClose: () => void }) {
  const { t, tt } = useT();
  const [temp, setTemp] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  return (
    <BodyPortal>
    <div role="dialog" aria-modal="true" aria-label={tt("fw.sig.aria", { label })} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,10,14,.55)", display: "flex", padding: 16, overflowY: "auto", overscrollBehavior: "contain" }}>
      <div style={{ width: "min(640px, 100%)", margin: "auto", background: "#fff", color: "#111", borderRadius: 12, padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b style={{ fontSize: "1rem" }}>{tt("fw.sig.title", { label })}</b>
          <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "none", cursor: "pointer", color: "#666", display: "flex" }}><Icon icon={X} className="h-5 w-5" /></button>
        </div>
        {initialUrl && !temp && !cleared && (
          <div style={{ fontSize: ".78rem", color: "#666", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            {t("fw.sig.prev")} <img src={initialUrl} alt={t("fw.sig.prevAlt")} style={{ height: 32, border: "1px solid #eee", borderRadius: 4 }} /> {t("fw.sig.replaceHint")}
          </div>
        )}
        <SignaturePad hasSig={!!temp} paper onSave={(d) => { setTemp(d); if (!d) setCleared(true); }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!temp && !cleared} onClick={() => onSave(temp)}>{t("fw.sig.save")}</Button>
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}

/**
 * ส่งแบบออฟไลน์ (เข้าคิว) → ลบร่างบน server ทันทีไม่ได้
 * จำ id ไว้ในเครื่อง หน้าแบบร่างจะซ่อนและลบให้เมื่อออนไลน์
 */
const SUBMITTED_DRAFTS_KEY = "krok_submitted_drafts";
function rememberSubmittedDraft(id: string | null) {
  if (!id) return;
  try {
    const cur = JSON.parse(localStorage.getItem(SUBMITTED_DRAFTS_KEY) || "[]") as string[];
    localStorage.setItem(SUBMITTED_DRAFTS_KEY, JSON.stringify([...new Set([...cur, id])].slice(-100)));
  } catch { /* ไม่มี localStorage = ร่างจะหมดอายุเองใน 30 วัน */ }
}

