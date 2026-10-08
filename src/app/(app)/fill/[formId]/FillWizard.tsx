"use client";
import { InlineFormIcon } from "@/components/FormIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { Printer, Clock, CheckCircle2, AlertTriangle, Check, Lock, CloudOff, TabletSmartphone, ShieldAlert, RefreshCw, Save, Send, CornerUpLeft, Users, MapPin, Smartphone, FileText } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { isUiOnlyField, labelMap, printPhotosOf, type FormField, type FormSchema, type FormStep } from "@/lib/form-schema";
import { deleteDraft, loadDraftMedia, saveDraft, type DraftData } from "@/lib/drafts";
import { PhotoFrame } from "@/components/paper/PaperPhotoGrid";
import { mmToPx } from "@/lib/paper-layout";
import { formatDtThai } from "@/lib/dt-format";
import { pfDisplay } from "@/lib/field-display";
import { nowMs } from "@/lib/clock";
import { allPhotoSlotKeys, filledPhotoKeys, maxPhotosOf, minPhotosOf, parsePhotoSlotKey, photoSlotKey } from "@/lib/photo-slots";
import { filterOptions } from "@/lib/datasets";
import { notifySubmission } from "./actions";
import { advanceCaseAction, cancelCaseAction, claimCaseAction, completeCaseAction, releaseCaseAction, returnCaseAction } from "./case-actions";
import { CaseBanner, CaseConfirmModal, HandoffModal, ReadonlyField, ReturnModal } from "./CaseParts";
import { assigneeLabel, segmentEnd, type CaseData, type CaseDocExtract } from "@/lib/case-flow";
import { fieldStepMap, loadCaseMedia, saveCase } from "@/lib/cases";
import { computeFormulas, formatNumber, outOfRange } from "@/lib/formula";
import { finalizeTableRows, mediaFieldId } from "@/lib/table-rows";
import FillSourceBar, { type AppliedValue } from "@/components/FillSourceBar";
import { enqueue, isQuotaExceeded, pushSubmission, PermanentSubmitError, type PendingSubmission } from "@/lib/offline-queue";
import { deleteLocalDraft, saveLocalDraft, type LocalDraft } from "@/lib/offline-store";
import AttachmentChips from "@/components/AttachmentView";
import { groupAttachments, type Attachment } from "@/lib/attachments";
import { defaultDeviceName, deviceShortCode, freshApproved, freshFormAllow, getDeviceKey, guessPlatform, writeDeviceState, writeFormAllow, type DeviceStatus } from "@/lib/device-client";
import { registerDevice } from "@/app/(app)/settings/devices/actions";
import { confirmDialog } from "@/components/dialogs";
import { isQuotaError, cleanQuotaMessage } from "@/lib/quota-msg";
import dynamic from "next/dynamic";
import { printWhenReady } from "@/lib/print";
import { resolveTheme, type WorkspaceBranding } from "@/lib/theme";
import { FormBrandHeader, FormFooterText, ThemeStyle, hasBrand } from "@/components/FormBrand";
import { Answer, DocRec, MediaPhotos, TableRow, asRows, dataUrlToBlob, shrinkImage } from "./fill-types";
import { firstBadRow, isChildRow, rowHasValue } from "./FillTable";
import ChildFormPanel from "./ChildFormPanel";
import { listChildLinks, type ChildLink } from "./child-actions";
import { FieldControl, toCode } from "./FieldControl";
import { PhotoStampProvider } from "./photo-stamp";
import { useGeo } from "./useGeo";
import { watermarkLines } from "@/lib/geo";
import { FillActionBar, FillTopBar, FOCUS_COL_W, type FocusMenuItem } from "./FillFocusBar";


// โหมดกระดาษใช้เฉพาะบางคน — แยก bundle (หน้ากรอกบนมือถือโหลดเร็วขึ้น)
const FormPaperFill = dynamic(() => import("@/components/FormPaperFill"), { ssr: false });

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
  /** แบรนด์ของ workspace (โลโก้/ธีมสี) — ฟอร์มตั้งทับได้ใน schema.theme */
  branding?: WorkspaceBranding | null;
  /** เอกสารที่เกี่ยวข้อง (ระดับฟอร์ม + ระดับฟิลด์) */
  attachments?: Attachment[];
  /** ฟอร์มนี้กรอกได้เฉพาะเครื่องที่ผู้ดูแลอนุมัติแล้ว */
  requireDevice?: boolean;
  /** กรอกต่อจากแบบร่าง */
  draft?: DraftData | null;
  /** แบบร่างที่บันทึกไว้ในเครื่องตอนออฟไลน์ (ใหม่กว่าร่างบน server) */
  localDraft?: LocalDraft | null;
  /** เปิดจากหน้าออฟไลน์ (ไม่มี server) — เปลี่ยนหน้าแบบโหลดเต็มหน้า */
  offlineShell?: boolean;
  /** งานที่เปิดอยู่ (ฟอร์มกรอกหลายคน) */
  caseData?: CaseData | null;
  /** ฟอร์มนี้กรอกหลายคน: ชื่อทีม + สิทธิ์ของผู้ใช้ (null = ฟอร์มคนเดียวแบบเดิม) */
  workflow?: { teams: Record<string, string>; users: Record<string, string>; canStart: boolean; canClaim: boolean; manager: boolean } | null;
};
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
  // ร่างในเครื่อง (บันทึกตอนออฟไลน์) ใช้แทนร่างบน server เมื่อใหม่กว่า
  const local = props.publicMode || kase || !props.localDraft ? null
    // ร่างบน server ใหม่กว่า (เช่นกรอกต่อจากอีกเครื่อง) → ใช้ของ server เสมอ ไม่ให้ร่างเก่าในเครื่องทับ
    : initialDraft && new Date(initialDraft.updatedAt).getTime() > props.localDraft.updatedAt ? null
    : props.localDraft;
  const seed = local
    ? { stepIdx: local.stepIdx, answers: local.answers, docExtracts: local.docExtracts, mode: local.mode, formVersion: local.formVersion }
    : initialDraft;
  const [idx, setIdx] = useState(() => {
    const start = kase ? (viewOnly ? Math.min(kase.stepIdx, nSteps - 1) : segStart) : seed?.stepIdx ?? 0;
    return Math.min(Math.max(start, 0), maxIdx);
  });
  // เริ่มจากคำตอบในร่าง/งาน (ตั้งก่อน render แรก — FieldControl อ่านค่าเริ่มต้นตอน mount)
  const answers = useRef<Record<string, Answer>>(((kase?.answers ?? seed?.answers) as Record<string, Answer>) ?? {});
  const [photos, setPhotos] = useState<Record<string, string>>(() => local?.photos ?? {}); // fieldId -> dataUrl
  const docExtracts = useRef<DocRec[]>(((kase?.docExtracts ?? seed?.docExtracts) as DocRec[]) ?? []); // หลักฐานการอ่านเอกสารด้วย AI
  const [sigs, setSigs] = useState<Record<string, string>>(() => local?.sigs ?? {});
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [startedAt] = useState(() => Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // ส่งไม่สำเร็จ: แสดงแถบข้อความใกล้ปุ่มส่ง (เดิมไปติดที่ช่องแรกของขั้น — ผู้กรอกอยู่ท้ายหน้าเลยไม่เห็น)
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // ---- พิกัด GPS + ลายน้ำรูป (ตั้งต่อฟอร์ม) ----
  const geoMode = schema.geo;
  const geo = useGeo(!!geoMode && !viewOnly);
  const stampOf = useCallback(
    () => watermarkLines({ atMs: Date.now(), title: props.title, geo: geo.lastRef.current, geoOn: !!geoMode }),
    [props.title, geo.lastRef, geoMode],
  );
  const submitErrRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (submitErr) submitErrRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [submitErr]);
  const [mode, setMode] = useState<"mobile" | "paper">(seed?.mode ?? "mobile");
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
    calcFrom(((kase?.answers ?? seed?.answers) as Record<string, Answer>) ?? {}));
  // รูปถ่ายต่อแถว: อยู่ใน photos เดียวกับรูปของฟิลด์ (แบบร่าง/งาน/ส่งข้อมูลจัดการเหมือนกัน) key = <field>.<col>.<สุ่ม>
  const mediaPhotos = useMemo<MediaPhotos>(() => ({
    get: (k) => photos[k],
    set: (k, d) => {
      dirty.current++;
      setPhotos((prev) => { const n = { ...prev }; if (d) n[k] = d; else delete n[k]; return n; });
    },
  }), [photos]);
  // ค่าสูตรไม่เปลี่ยน → คืน state เดิม (ไม่ render ทั้งหน้าใหม่ทุกตัวอักษรที่พิมพ์ในช่องที่สูตรไม่ได้ใช้)
  const refreshFormulas = useCallback(() => {
    if (!hasFormula) return;
    const next = calcFrom(answers.current);
    setFormulaVals((prev) => {
      const keys = Object.keys(next);
      if (keys.length === Object.keys(prev).length && keys.every((k) => Object.is(prev[k], next[k]))) return prev;
      return next;
    });
  }, [hasFormula, calcFrom]);

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
  const dirty = useRef(local ? 1 : 0); // นับการแก้ไข (ร่างในเครื่อง = ยังไม่ขึ้น server → นับว่ามีของต้องบันทึก)
  const savedAt = useRef(0);        // ค่า dirty ตอนบันทึกล่าสุด
  const draftId = useRef<string | null>(local ? local.serverDraftId : initialDraft?.id ?? null);
  // งาน: media ของทั้งงาน (key → path ใน bucket 'cases') / ร่าง: media ของร่าง
  const draftMedia = useRef<Record<string, string>>(kase?.media ?? (local ? (initialDraft && initialDraft.id === local.serverDraftId ? initialDraft.media : {}) : initialDraft?.media) ?? {});
  const uploadedMedia = useRef(new Map<string, string>());
  const saving = useRef<Promise<boolean> | null>(null);
  const submitLock = useRef(false); // กำลังส่ง/ส่งแล้ว → ห้ามบันทึกร่าง (กันร่างค้างหลังส่ง)
  const [draftState, setDraftState] = useState<{ kind: "idle" | "saving" | "saved" | "local" | "error"; at?: number; msg?: string }>(
    local ? { kind: "local", at: local.updatedAt } : initialDraft ? { kind: "saved", at: new Date(initialDraft.updatedAt).getTime() } : { kind: "idle" }
  );
  const [mediaLoading, setMediaLoading] = useState(
    kase ? Object.keys(kase.media || {}).length > 0 || kase.docExtracts.some((d) => !!d.path)
      : !local && !!initialDraft && Object.keys(initialDraft.media || {}).length > 0
  );
  const versionChanged = !!seed && seed.formVersion !== props.version;
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
    if (!initialDraft || local || !mediaLoading) return;
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
        if (isUiOnlyField(fl)) continue;
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
    // ออฟไลน์ / server ไม่ตอบ → เก็บร่างไว้ในเครื่อง (รูป/ลายเซ็นเก็บเป็นข้อมูลในเครื่องด้วย) แล้วขึ้น server รอบถัดไปที่ออนไลน์
    const saveLocal = async (): Promise<boolean> => {
      if (kase) return false; // งาน (กรอกหลายคน) ต้องออนไลน์
      try {
        await saveLocalDraft({
          userId: props.userId, tenantId: props.tenantId, formId: props.formId, formVersion: props.version,
          serverDraftId: draftId.current, title, stepIdx: si, mode: md, answers: answers.current as Record<string, unknown>,
          photos: ph, sigs: sg, docExtracts: docExtracts.current, filled, total, updatedAt: Date.now(),
        });
        // savedAt ไม่ขยับ → ออนไลน์เมื่อไรบันทึกอัตโนมัติจะส่งร่างขึ้น server ให้
        setDraftState({ kind: "local", at: Date.now() });
        return true;
      } catch (e) {
        if (isQuotaExceeded(e)) { setDraftState({ kind: "error", msg: t("fw.deviceFull") }); localFull = true; }
        return false;
      }
    };
    let localFull = false;
    const job = (async () => {
      if (!kase && typeof navigator !== "undefined" && navigator.onLine === false) {
        const ok = await saveLocal();
        saving.current = null;
        if (!ok && !localFull) setDraftState({ kind: "error", msg: t("fw.draftOffline") });
        return ok;
      }
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
        void deleteLocalDraft(props.userId, props.formId); // ขึ้น server แล้ว ไม่ต้องเก็บในเครื่อง
        return true;
      } catch (e) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const raw = e instanceof Error ? e.message : "";
        const network = /fetch|network|timeout/i.test(raw);
        if (offline || network) {
          if (await saveLocal()) return true;
          if (localFull) return false;
        }
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
    if (initialDraft && !local && !mediaLoading) savedAt.current = dirty.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaLoading]);

  /** เปลี่ยนหน้า — ออฟไลน์/เปิดจากหน้าออฟไลน์ ใช้โหลดเต็มหน้า (service worker ส่งหน้าออฟไลน์ให้) */
  const go = useCallback((path: string) => {
    if (props.offlineShell || (typeof navigator !== "undefined" && navigator.onLine === false)) window.location.assign(path);
    else {
      // หน้ากรอกบันทึกร่าง/ส่งข้อมูลจากฝั่งเบราว์เซอร์ → ล้างหน้าที่จำไว้ (staleTimes) ให้รายการ/แบบร่างเป็นปัจจุบัน
      router.refresh();
      router.push(path);
    }
  }, [props.offlineShell, router]);

  // ================= โหมดเต็มจอ (focus) =================
  // หน้ากรอกที่ล็อกอิน: ไม่มีเมนูหลักของแอป มีแถบบน (ชื่อ · ขั้นที่ · ⋯ · X) + แถบปุ่มล่างติดจอ
  // หน้าสาธารณะ (/f/*) มีหัวของตัวเอง → ใช้เฉพาะแถบปุ่มล่าง
  const focus = !props.publicMode;
  const [exiting, setExiting] = useState(false);
  const listPath = kase ? "/forms?tab=tasks" : "/forms";

  /** ออกจากฟอร์ม: มีของที่ยังไม่บันทึก → บันทึกร่างให้ก่อน · บันทึกไม่ได้ → ถามยืนยันก่อนทิ้ง */
  async function exitForm() {
    if (exiting) return;
    setExiting(true);
    try {
      if (draftsOn && dirty.current !== savedAt.current && hasContent()) {
        const ok = await saveDraftNow("auto");
        if (!ok && !(await confirmDialog({ message: t("draft.exitUnsaved"), confirmLabel: t("fill.exit"), danger: true }))) return;
      }
      go(listPath);
    } finally {
      setExiting(false);
    }
  }

  // เปลี่ยนขั้น → เลื่อนขึ้นบนสุด + ย้ายโฟกัสไปหัวข้อขั้นใหม่ (โปรแกรมอ่านหน้าจอ/คีย์บอร์ดรู้ว่าเปลี่ยนขั้นแล้ว)
  // ไม่ทำตอนเปิดหน้าครั้งแรก (ไม่แย่งโฟกัส)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const shownIdx = useRef(idx);
  useEffect(() => {
    if (shownIdx.current === idx) return;
    shownIdx.current = idx;
    window.scrollTo(0, 0);
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [idx]);

  /** ส่งฟอร์มสำเร็จแล้ว → ลบร่างทิ้ง */
  /** ลบร่างในเครื่องหลังส่ง — รอการบันทึกร่างที่ค้างอยู่จบก่อน (ไม่งั้นร่างที่บันทึกทีหลังจะโผล่กลับมา) */
  async function dropLocalDraft() {
    if (saving.current) await saving.current.catch(() => false);
    await deleteLocalDraft(props.userId, props.formId);
  }

  async function clearDraftAfterSubmit() {
    if (saving.current) await saving.current.catch(() => false); // รอบันทึกร่างที่ค้างอยู่ให้จบก่อน จะได้ลบถูกตัว
    await deleteLocalDraft(props.userId, props.formId);
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

  // ================= ฟอร์มลูก (0074) =================
  // ตารางที่รับผลจากปุ่มฟอร์มลูก → (รับจากฟอร์มลูกเท่านั้นไหม)
  const childTables = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const st of schema.steps)
      for (const fl of st.fields)
        if (fl.type === "child_form" && fl.child_form?.table_id)
          m.set(fl.child_form.table_id, (m.get(fl.child_form.table_id) ?? false) || fl.child_form.source_only);
    return m;
  }, [schema]);
  const [childLinks, setChildLinks] = useState<ChildLink[]>([]);
  // เวอร์ชันของตารางที่รับผล — แถวใหม่จากฟอร์มลูกเข้ามา → mount ตารางใหม่จาก answers.current (ค่าที่พิมพ์ค้างอยู่ในนั้นแล้ว)
  const [childVer, setChildVer] = useState<Record<string, number>>({});
  const caseIdForChild = kase?.id ?? null;
  const refreshChild = useCallback(async () => {
    if (!caseIdForChild || childTables.size === 0) return;
    const [links, row] = await Promise.all([
      listChildLinks(caseIdForChild),
      supabase.from("form_cases").select("answers").eq("id", caseIdForChild).maybeSingle(),
    ]);
    setChildLinks(links);
    const dbAnswers = (row.data?.answers as Record<string, Answer> | undefined) ?? null;
    if (!dbAnswers) return;
    const bumped: string[] = [];
    for (const tid of childTables.keys()) {
      const dbRows = (Array.isArray(dbAnswers[tid]?.value) ? (dbAnswers[tid].value as TableRow[]) : []).filter(isChildRow);
      const cur = Array.isArray(answers.current[tid]?.value) ? (answers.current[tid].value as TableRow[]) : [];
      const have = cur.filter(isChildRow).map((r) => r._child).join("|");
      if (have === dbRows.map((r) => r._child).join("|")) continue;
      answers.current[tid] = { ...(answers.current[tid] || {}), value: [...cur.filter((r) => !isChildRow(r)), ...dbRows] };
      bumped.push(tid);
    }
    if (bumped.length) setChildVer((v) => { const n = { ...v }; for (const id of bumped) n[id] = (n[id] ?? 0) + 1; return n; });
  }, [caseIdForChild, childTables, supabase]);
  useEffect(() => {
    if (!caseIdForChild || childTables.size === 0) return;
    void refreshChild();
    // ผลจากฟอร์มลูกเข้ามา = งานนี้ถูกแก้ → ดึงใหม่ (Realtime) · พับจอ/เน็ตหลุดแล้วกลับมา → ดึงใหม่
    const ch = supabase
      .channel(`krok-case-${caseIdForChild}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "form_cases", filter: `id=eq.${caseIdForChild}` }, () => { void refreshChild(); })
      .subscribe();
    const onBack = () => { if (document.visibilityState === "visible") void refreshChild(); };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [caseIdForChild, childTables, refreshChild, supabase]);

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

  // แหล่งสแกนที่เติมฟิลด์ข้อความเดียว (เช่น ฟิลด์ "บาร์โค้ด/QR") → ปุ่มสแกนอยู่ในช่องนั้นเลย ไม่ต้องไปอยู่หัวขั้นตอน
  const inlineScanOf = useCallback((st: FormStep) => new Set((st.fill_sources ?? [])
    .filter((src) => src.kind === "scan" && (src.parse ?? "raw") === "raw" && src.map.length === 1 && st.fields.find((x) => x.id === src.map[0].field_id)?.type === "text")
    .map((src) => src.map[0].field_id)), []);
  const inlineScanIds = useMemo(() => new Set(schema.steps.flatMap((st) => [...inlineScanOf(st)])), [schema, inlineScanOf]);
  const fillBar = (st: FormStep) => (
    <FillSourceBar
      step={{ ...st, fill_sources: (st.fill_sources ?? []).filter((src) => !(src.kind === "scan" && src.map.length === 1 && inlineScanOf(st).has(src.map[0].field_id))) }}
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

  /** ข้อความผิดพลาดของฟิลด์ (undefined = ผ่าน) — บอกชัดว่าต้องทำอะไร ตามชนิดฟิลด์ */
  function fieldError(f: FormField, ph: Record<string, string> = photos, sg: Record<string, string> = sigs): string | undefined {
    const a = answers.current[f.id] || {};
    const str = typeof a.value === "string" ? a.value.trim() : "";
    // รูปแบบข้อความ (ตรวจแม้ไม่บังคับ เมื่อกรอกมา)
    if (f.type === "text" && str && f.text_format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return t("fw.err.email");
    if (f.type === "text" && str && f.text_format === "phone" && !/^\+?[0-9][0-9\s-]{7,14}$/.test(str)) return t("fw.err.phone");
    if (f.type === "table") {
      const all = asRows(a.value);
      if (f.required && !all.some(rowHasValue)) return t("fw.err.tableRow");
      const bad = firstBadRow(f.columns || [], all);
      if (bad) return tt("fw.err.tableCell", { row: bad.row + 1, col: bad.col.label });
      return undefined;
    }
    if (f.type === "pass_fail" && a.value === "fail" && f.on_fail_require_note && !a.note?.trim()) return t("fw.failNoteRequired");
    if (!f.required) return undefined;
    switch (f.type) {
      case "photo": {
        const have = filledPhotoKeys(f, (k) => !!ph[k]).length;
        const min = minPhotosOf(f);
        if (have >= min) return undefined;
        return min > 1 ? tt("fw.err.photoN", { n: min, have }) : t("fw.err.photo");
      }
      case "signature":
        if (!sg[f.id]) return t("fw.err.signature");
        return f.sign_name && !str ? t("fw.err.signName") : undefined;
      case "checkbox": return Array.isArray(a.value) && a.value.length ? undefined : t("fw.err.checkbox");
      case "select": return str ? undefined : t("fw.err.select");
      case "pass_fail": return str ? undefined : t("fw.err.passFail");
      case "formula": return undefined;
      default: return a.value == null || a.value === "" ? t("fill.required") : undefined;
    }
  }

  function validate(fields: FormField[] = step.fields): boolean {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const e = fieldError(f);
      if (e) errs[f.id] = e;
    }
    setErrors(errs);
    if (typeof document !== "undefined") {
      const first = fields.find((f) => errs[f.id]);
      if (first) setTimeout(() => document.getElementById("fld-" + first.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    }
    return Object.keys(errs).length === 0;
  }

  /** แก้ช่องที่มี error อยู่ → ตรวจช่องนั้นใหม่ทันที (ข้อความหายเมื่อแก้ถูก / เปลี่ยนเป็นข้อความที่ตรงกว่า) */
  const recheck = (f: FormField, ph?: Record<string, string>, sg?: Record<string, string>) => {
    setErrors((prev) => {
      if (!(f.id in prev)) return prev;
      const e = fieldError(f, ph, sg);
      const n = { ...prev };
      if (e) n[f.id] = e; else delete n[f.id];
      return n;
    });
  };

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
    setSubmitErr(null);
    try {
      // พิกัด: ฟอร์มบังคับ → ไม่มีพิกัด = ยังไม่ส่ง (บอกวิธีเปิดสิทธิ์) · ไม่บังคับ = ส่งได้แม้หาไม่เจอ
      const geoFix = geoMode ? await geo.getFix() : null;
      if (geoMode === "required" && !geoFix) {
        setSubmitErr(geo.status === "denied" ? t("geo.deniedRequired") : t("geo.unavailableRequired"));
        setSubmitting(false);
        submitLock.current = false;
        return;
      }
      const subId = crypto.randomUUID();
      const list: Record<string, unknown>[] = [];
      const fails: string[] = [];
      const photoUploads: { fieldId: string; dataUrl: string; ai?: string }[] = [];
      const fvals = hasFormula ? calcFrom(answers.current) : {};

      for (const s of schema.steps)
        for (const f of s.fields) {
          if (isUiOnlyField(f)) continue; // ปุ่มฟอร์มลูก — ไม่มีคำตอบ
          const a = answers.current[f.id] || {};
          const item: Record<string, unknown> = { id: f.id, label: f.label, type: f.type };
          if (a.src) item.src = a.src; // ที่มาของค่า: scan | ai | ai_edited (ไม่มี = คนกรอกเอง)
          if (f.type === "photo") {
            const keys = filledPhotoKeys(f, (k) => !!photos[k]);
            keys.forEach((k, i) => photoUploads.push({ fieldId: k, dataUrl: photos[k], ai: i === 0 ? a.ai : undefined }));
            if (keys.length) item.photoField = keys[0];
            if (keys.length > 1) { item.photoFields = keys; item.display = `${keys.length} รูป`; }
            const caps = keys.map((k) => f.photo_labels?.[parsePhotoSlotKey(k)?.slot ?? 0]?.trim() || "");
            if (caps.some(Boolean)) item.photoLabels = caps; // ชื่อใต้รูป (ไปแสดงในหน้าผล/PDF/zip)
            if (a.ai) item.display = a.ai;
          } else if (f.type === "signature") {
            if (sigs[f.id]) {
              photoUploads.push({ fieldId: f.id, dataUrl: sigs[f.id] });
              item.photoField = f.id;
              const who = typeof a.value === "string" ? a.value.trim() : "";
              item.display = who ? `เซ็นแล้ว — ${who}` : "เซ็นแล้ว";
            }
          } else if (f.type === "pass_fail") {
            item.display = pfDisplay(f, a.value);
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
          } else if (f.type === "datetime") {
            item.display = a.value ? formatDtThai(String(a.value), f.dt_mode ?? "datetime") : "—";
          } else item.display = String(a.value ?? "—");
          list.push(item);
        }

      const result: "pass" | "fail" = fails.length ? "fail" : "pass";
      // งาน: นับเวลาตั้งแต่เริ่มงาน (ขั้นแรก) จนส่งขั้นสุดท้าย
      const dur = Math.round((nowMs() - (kase ? new Date(kase.createdAt).getTime() : startedAt)) / 1000);

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
          if (geoFix) fd.append("geo", JSON.stringify(geoFix));
          for (const p of photoUploads) fd.append(`photo_${p.fieldId}`, dataUrlToBlob(p.dataUrl), `${p.fieldId}.jpg`);
          const res = await fetch("/api/public/submit", { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || t("fw.submitFailed"));
          }
        } catch (e) {
          setSubmitErr(tt("fw.submitFailedMsg", { msg: e instanceof Error ? localizeServerMsg(e.message, lang) : t("fw.error") }));
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
        deviceKey: deviceLocked ? getDeviceKey() : null,
        geo: geoFix,
        queuedAt: 0,
      };

      // งาน (ฟอร์มกรอกหลายคน): ขั้นสุดท้ายต้องออนไลน์ — ส่ง submission แล้วปิดงานทันที (ไม่เข้าคิวออฟไลน์)
      if (wf) {
        if (!kase) throw new Error(t("fw.caseNotFound"));
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(t("fw.offlineFinalStep"));
        try { await pushSubmission(supabase, payload, { caseId: kase.id }); }
        catch (err) { throw new Error(cleanQuotaMessage(String((err as { message?: string })?.message ?? err))); }
        const r = await completeCaseAction(kase.id, subId);
        void notifySubmission(subId).catch(() => {});
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: false, caseWarn: "error" in r ? r.error : undefined });
        window.scrollTo(0, 0);
        return;
      }

      // ออฟไลน์ → เข้าคิวไว้ก่อน แล้ว sync ทีหลัง
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await enqueue({ ...payload, queuedAt: nowMs() });
        window.dispatchEvent(new Event("krok-queue-changed"));
        // ออฟไลน์ลบร่างบน server ไม่ได้ตอนนี้ — ร่างจะถูกลบเมื่อกลับมาออนไลน์ครั้งถัดไปที่เปิดหน้าแบบร่าง
        // (ถือว่าส่งแล้ว: เก็บ id ไว้ให้หน้าแบบร่างซ่อน/ลบ)
        rememberSubmittedDraft(draftId.current);
        await dropLocalDraft();
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: true });
        window.scrollTo(0, 0);
        return;
      }

      let saved: { result?: "pass" | "fail"; fails?: string[] } = {};
      try {
        saved = await pushSubmission(supabase, payload);
      } catch (err) {
        // เกินโควตาแพ็กเกจ → แจ้งผู้ใช้ตรง ๆ (เข้าคิวไปก็ส่งไม่ผ่านอยู่ดี)
        if (isQuotaError(err)) throw new Error(cleanQuotaMessage(String((err as { message?: string }).message)));
        // ไม่มีสิทธิ์ / ฟอร์มปิด / เครื่องไม่ได้อนุมัติ → แจ้งผู้ใช้ (เข้าคิวไปก็ไม่ผ่าน)
        if (err instanceof PermanentSubmitError) throw err;
        // ส่งไม่ผ่าน (เครือข่ายหลุด) → เก็บเข้าคิวออฟไลน์
        await enqueue({ ...payload, queuedAt: nowMs() });
        window.dispatchEvent(new Event("krok-queue-changed"));
        rememberSubmittedDraft(draftId.current);
        await dropLocalDraft();
        setDone({ result, fails, dur, pending: props.requiresApproval, offline: true });
        window.scrollTo(0, 0);
        return;
      }

      // แจ้ง webhook ภายนอก (best-effort, ไม่บล็อกผู้ใช้)
      void notifySubmission(subId).catch(() => {});
      void clearDraftAfterSubmit();

      // ผลที่ server คำนวณ (เชื่อถือได้) — ไม่มี = ใช้ผลในเครื่อง
      setDone({ result: saved.result ?? result, fails: saved.fails ?? fails, dur, pending: props.requiresApproval, offline: false });
      window.scrollTo(0, 0);
    } catch (e) {
      setSubmitErr(isQuotaExceeded(e) ? t("fw.deviceFull") : tt("fw.submitFailedMsg", { msg: e instanceof Error ? localizeServerMsg(e.message, lang) : t("fw.error") }));
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
        if (isUiOnlyField(fl)) continue;
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
    if ("error" in r) setCaseErr(localizeServerMsg(r.error, lang));
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
    if ("error" in r) { submitLock.current = false; setCaseErr(localizeServerMsg(r.error, lang)); return; }
    router.push("/forms?tab=tasks");
  }

  async function doCancelCase(note: string) {
    if (!kase) return;
    setCaseBusy(true);
    setCaseErr(undefined);
    submitLock.current = true;
    const r = await cancelCaseAction(kase.id, note || null).catch((e) => ({ error: netErr(e) }));
    setCaseBusy(false);
    if ("error" in r) { submitLock.current = false; setCaseErr(localizeServerMsg(r.error, lang)); return; }
    router.push("/forms?tab=tasks");
  }

  /** หน้าจอสถานะ (ตรวจเครื่อง / ส่งแล้ว ฯลฯ) ในโหมดเต็มจอ: แถบบนมีแค่ชื่อ + ปุ่มปิด */
  const focusShell = (node: React.ReactNode) => !focus ? node : (
    <>
      <FillTopBar title={props.title} menu={[]} closing={exiting}
        onClose={done ? () => go(done.handoff || done.returned ? "/forms?tab=tasks" : "/forms") : () => void exitForm()} />
      <div style={{ maxWidth: FOCUS_COL_W, margin: "0 auto" }}>{node}</div>
    </>
  );

  // ---- ประตูตรวจอุปกรณ์: ฟอร์มที่ล็อค ต้องเป็นเครื่องที่อนุมัติแล้วเท่านั้น ----
  if (deviceLocked && device.status !== "approved") {
    const code = deviceShortCode(typeof window !== "undefined" ? getDeviceKey() : "");
    const box: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "32px 20px", textAlign: "center", boxShadow: "var(--shadow)", maxWidth: 460, margin: "0 auto" };

    if (device.status === "checking")
      return focusShell(
        <div style={box}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)" }}><Icon icon={TabletSmartphone} className="h-10 w-10" strokeWidth={1.5} /></div>
          <h2 style={{ margin: "10px 0 4px", fontSize: "1.05rem" }}>{t("fw.device.checking")}</h2>
        </div>,
      );

    const title = device.status === "revoked" ? t("fw.device.revoked")
      : device.status === "notlinked" ? t("fw.device.notLinked")
      : device.status === "error" ? t("fw.deviceCheckFailed")
      : t("fw.device.notApproved");
    const sub = device.status === "revoked" ? t("fw.device.revokedSub")
      : device.status === "notlinked" ? tt("fw.device.notLinkedSub", { title: props.title })
      : device.status === "error" ? (device.msg || t("fw.device.retryAgain"))
      : t("fw.device.notApprovedSub");

    return focusShell(
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
          <Button onClick={() => go("/forms")}>{t("fill.backToList")}</Button>
        </div>
      </div>,
    );
  }

  // ฟอร์มกรอกหลายคนที่ขั้นแรกจำกัดทีม — ผู้ใช้นี้เริ่มงานไม่ได้
  if (wf && !kase && viewOnly) {
    const tn = whoOf(0);
    return focusShell(
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "36px 20px", textAlign: "center", boxShadow: "var(--shadow)", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-3)" }}><Icon icon={Users} className="h-11 w-11" strokeWidth={1.5} /></div>
        <h2 style={{ margin: "10px 0 4px", fontSize: "1.05rem" }}>{t("wf.startTeamOnly")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem" }}>{t("wf.startTeamOnlySub").replace("{team}", tn || "-")}</p>
        <Button onClick={() => go("/forms")} style={{ marginTop: 12 }}>{t("fill.backToList")}</Button>
      </div>,
    );
  }

  if (done && (done.handoff || done.returned)) {
    return focusShell(
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
          <Button onClick={() => go("/forms")}>{t("fill.backToList")}</Button>
        </div>
      </div>,
    );
  }

  if (done) {
    return focusShell(
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
              <Button variant="primary" onClick={() => go("/forms")}>{t("fill.backToList")}</Button>
              {!props.offlineShell && <Button onClick={() => go("/dashboard")}>{t("fill.viewDash")}</Button>}
            </>
          )}
        </div>
      </div>,
    );
  }

  /** photoSlot: แสดงเฉพาะช่องรูปที่ photoSlot ของฟิลด์ (กล่องภาพประกอบ) */
  const renderField = (fRaw: FormField, paper = false, compact = false, photoSlot?: number) => {
    const fStep = stepOfField.get(fRaw.id) ?? 0;
    if (fRaw.type === "child_form") {
      return (
        <div id={"fld-" + fRaw.id} key={fRaw.id}>
          <ChildFormPanel field={fRaw} caseId={kase?.id ?? null} caseOpen={!kase || kase.status === "open"}
            readOnly={!!kase && (!caseMine || (wf && lockedStep(fStep)))} links={childLinks} paper={paper}
            beforeOpen={() => (dirty.current !== savedAt.current ? persistSegment() : Promise.resolve())}
            onOpened={() => { void refreshChild(); }} />
        </div>
      );
    }
    const f: FormField = childTables.get(fRaw.id) ? { ...fRaw, child_only: true } : fRaw;
    const photoCell = photoSlot !== undefined;
    if (photoCell && wf && lockedStep(fStep)) {
      return <PhotoFrame url={photos[photoSlotKey(f.id, photoSlot)]} height={photoCellH} alt={f.label} />;
    }
    if (wf && lockedStep(fStep)) {
      return (
        <div id={"fld-" + f.id} key={f.id}>
          <ReadonlyField field={f} answer={f.type === "formula" ? { value: formulaVals[f.id] == null ? "" : formatNumber(formulaVals[f.id], f.decimals ?? 2) } : lockedAnswers[f.id]} photo={photos[f.id]} morePhotos={f.type === "photo" ? allPhotoSlotKeys(f).slice(1).map((k) => photos[k]).filter((u): u is string => !!u) : undefined} sig={sigs[f.id]} paper={paper} compact={compact}
            pending={kase ? kase.status === "open" && fStep > segmentEnd(schema, kase.stepIdx) : fStep > segEnd} />
        </div>
      );
    }
    const parentId = f.options_parents ? f.options_source?.parent?.field_id : undefined;
    // key ผูกกับเวอร์ชันของฟิลด์แม่ → แม่เปลี่ยน ฟิลด์ลูก mount ใหม่และอ่านคำตอบที่ถูกตัดแล้ว
    const k = (parentId ? `${f.id}|${depVer[parentId] ?? 0}` : f.id) + (childTables.has(f.id) ? `|c${childVer[f.id] ?? 0}` : "");
    return (
    <div id={"fld-" + f.id} key={k}>
      <FieldControl
        field={f}
        getParentValue={parentId ? () => answers.current[parentId]?.value : undefined}
        parentLabel={parentId ? fieldById.get(parentId)?.label : undefined}
        paper={paper}
        compact={compact}
        photoCell={photoCell ? photoCellH : undefined}
        inlineScan={inlineScanIds.has(f.id)}
        photoSlot={photoSlot}
        slotPhotos={f.type === "photo" && maxPhotosOf(f) > 1 ? allPhotoSlotKeys(f).map((k) => photos[k]) : undefined}
        setSlotPhoto={(slot, d) => {
          const k = photoSlotKey(f.id, slot);
          setPhotos((prev) => { const n = { ...prev }; if (d) n[k] = d; else delete n[k]; recheck(f, n); return n; });
          patchAnswer(f.id, { ai: undefined });
        }}
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
          recheck(f);
        }}
        setPhoto={(d) => {
          setPhotos((prev) => {
            const nextP = { ...prev };
            if (d) nextP[f.id] = d;
            else delete nextP[f.id];
            recheck(f, nextP);
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
            recheck(f, undefined, nextS);
            return nextS;
          });
        }}
      />
    </div>
    );
  };

  // สถานะบันทึก (กำลังบันทึก / บันทึกแล้วเวลา … / บันทึกในเครื่อง) — โหมดเต็มจอแสดงตัวเล็กใต้ชื่อบนแถบบน
  const savedStatus = !draftsOn ? null
    : draftState.kind === "saving" ? <span>{t("draft.saving")}</span>
    : draftState.kind === "saved" && draftState.at ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon icon={Check} className="h-3.5 w-3.5" /> {t(kase ? "wf.savedAt" : "draft.savedAt").replace("{t}", new Date(draftState.at).toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }))}
      </span>
    )
    : draftState.kind === "local" && draftState.at ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon icon={CloudOff} className="h-3.5 w-3.5" /> {t("draft.savedLocal").replace("{t}", new Date(draftState.at).toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }))}
      </span>
    )
    : null;
  const savedInBar = focus && !!savedStatus;
  const draftNotice = draftsOn && ((draftState.kind !== "idle" && !savedInBar) || draftState.kind === "error" || versionChanged || mediaLoading) ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", fontSize: ".78rem", margin: "6px 0 2px", color: draftState.kind === "error" ? "var(--fail)" : "var(--ink-3)" }}>
      {!savedInBar && savedStatus}
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

  // เมนู ⋯ บนแถบบน (โหมดเต็มจอ): มุมมอง · พิมพ์ (กระดาษ) · บันทึกร่าง
  const focusMenu: FocusMenuItem[] = [
    { key: "v-mobile", label: t("studio.viewMobile"), icon: Smartphone, checked: mode === "mobile", onSelect: () => setMode("mobile") },
    { key: "v-paper", label: t("studio.viewPaper"), icon: FileText, checked: mode === "paper", onSelect: () => setMode("paper") },
    ...(mode === "paper" ? [{ key: "print", label: t("sub.print"), icon: Printer, separator: true, onSelect: () => void printWhenReady() }] : []),
    ...(draftsOn ? [{
      key: "draft", label: kase ? t("common.save") : t("draft.save"), icon: Save, separator: mode !== "paper",
      disabled: mediaLoading || draftState.kind === "saving", onSelect: () => void saveDraftNow("manual"),
    }] : []),
  ];
  const topBar = (colWidth: number | string) => (
    <FillTopBar title={props.title} colWidth={colWidth} menu={focusMenu} onClose={() => void exitForm()} closing={exiting}
      stepLabel={mode === "mobile" ? tt("fw.stepOf", { n: idx + 1, total: nSteps }) : undefined} status={savedStatus} />
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

  // ความสูงช่องรูปในกล่องภาพประกอบ (print_photos = grid)
  const photoCellH = mmToPx(printPhotosOf(schema).height_mm);

  // ธีมสี/โลโก้/ข้อความท้าย: workspace ← ฟอร์ม
  const theme = resolveTheme(props.branding, schema.theme);
  const themeScope = `krok-th-${props.formId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
  const branded = hasBrand(theme);

  // คำอธิบายฟอร์ม (ตั้งในหน้าสร้างฟอร์ม) — แสดงใต้ชื่อทั้งมุมมองมือถือและกระดาษ
  const geoChip = geoMode && !viewOnly ? (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "10px 0 0", padding: "7px 10px", borderRadius: 8, fontSize: ".82rem",
      border: `1px solid ${geo.status === "denied" && geoMode === "required" ? "var(--fail)" : "var(--line)"}`,
      background: geo.status === "denied" && geoMode === "required" ? "var(--fail-soft)" : "var(--surface-2)",
      color: geo.status === "ok" ? "var(--ink-2)" : geo.status === "denied" ? (geoMode === "required" ? "var(--fail)" : "var(--ink-3)") : "var(--ink-3)" }}>
      <Icon icon={MapPin} className="h-4 w-4" />
      <span style={{ flex: "1 1 180px" }}>
        {geo.status === "ok" && geo.fix ? tt("geo.ok", { acc: Math.round(geo.fix.acc) })
          : geo.status === "pending" ? t("geo.pending")
          : geo.status === "denied" ? (geoMode === "required" ? t("geo.deniedRequired") : t("geo.deniedOptional"))
          : t(geoMode === "required" ? "geo.unavailableRequired" : "geo.unavailableOptional")}
      </span>
      {(geo.status === "denied" || geo.status === "unavailable") && (
        <button type="button" onClick={geo.retry} style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 8, padding: "4px 10px", minHeight: 32, cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", color: "var(--ink)" }}>{t("geo.retry")}</button>
      )}
    </div>
  ) : null;

  const formDesc = schema.description?.trim() ? (
    <p style={{ margin: "3px 0 0", fontSize: ".86rem", color: "var(--ink-2)", lineHeight: 1.5, overflowWrap: "anywhere" }}>{schema.description.trim()}</p>
  ) : null;

  // ---------- โหมดกระดาษ: กรอกบนกระดาษ A4 จริง ตามตำแหน่งที่ออกแบบไว้ ----------
  if (mode === "paper") {
    return (
      <PhotoStampProvider value={schema.watermark ? stampOf : null}>
      {focus && topBar("var(--krok-page-w)")}
      <div className={themeScope} style={focus ? { maxWidth: "var(--krok-page-w)", margin: "0 auto" } : undefined}>
        <ThemeStyle scope={themeScope} theme={theme} />
        {/* แถบเครื่องมืออยู่นอกกระดาษ (พอดีจอ) — โหมดเต็มจอ: ปุ่มย้ายไปเมนู ⋯ บนแถบบน */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: "1 1 220px" }}>
            <h1 style={{ fontSize: "1.05rem" }}><InlineFormIcon value={props.icon} size={18} />{props.title}</h1>
            {formDesc}
          </div>
          {!focus && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {viewToggle}
              <Button onClick={() => void printWhenReady()} style={{ fontSize: ".8rem", padding: "6px 12px" }} title={t("fw.printPaper")} aria-label={t("fw.printPaper")}>
                <Icon icon={Printer} className="h-4 w-4" /> {t("sub.print")}
              </Button>
            </div>
          )}
        </div>

        {draftNotice}
        {banner}
        {geoChip}
        {attForm.length > 0 && <AttachmentChips items={attForm} variant="form" />}

        {schema.steps.map((st, si) => (
          lockedStep(si) ? null : <div key={st.id}>{fillBar(st)}</div>
        ))}

        <FormPaperFill
          theme={theme}
          schema={schema}
          icon={props.icon}
          title={props.title}
          userName={props.userName}
          renderField={(f) => renderField(f, true, true)}
          renderPhotoCell={(f, slot) => renderField(f, true, true, slot)}
          photoUrl={(id) => photos[id]}
        />

        {!viewOnly && (
          <div style={{ marginTop: 14 }}>
            {submitErr && !submitting && (
          <div ref={submitErrRef} role="alert" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--fail)", background: "var(--fail-soft)", color: "var(--fail)", fontSize: ".88rem", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 200px", display: "inline-flex", gap: 6, alignItems: "flex-start" }}><Icon icon={AlertTriangle} className="h-4 w-4" /> {submitErr}</span>
            <Button onClick={() => void submitPaper()} style={{ padding: "8px 14px", minHeight: 44 }}>{t("fw.retry")}</Button>
          </div>
        )}
          </div>
        )}
        {caseTools}
        {caseModals}
        {!viewOnly && (
          <FillActionBar colWidth={focus ? "var(--krok-page-w)" : PUBLIC_COL_W}>
            <Button data-tour="fill-submit" variant="primary" onClick={submitPaper} loading={submitting} disabled={mediaLoading} style={actionBtn(true)}>
              {submitting ? t("fill.submitting") : wf && !isLastSeg ? handoffLabel : <><Icon icon={CheckCircle2} className="h-[18px] w-[18px]" /> {t("fill.submit")}</>}
            </Button>
          </FillActionBar>
        )}
      </div>
      </PhotoStampProvider>
    );
  }

  // ---------- โหมดมือถือ: ทีละขั้นตอน ----------
  return (
    <PhotoStampProvider value={schema.watermark ? stampOf : null}>
    {focus && topBar(FOCUS_COL_W)}
    <div className={themeScope} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 20, boxShadow: "var(--shadow)", ...(focus ? { maxWidth: FOCUS_COL_W, margin: "0 auto" } : {}) }}>
      <ThemeStyle scope={themeScope} theme={theme} />
      {branded && <FormBrandHeader theme={theme} icon={props.icon} title={props.title} description={schema.description} />}
      {(!branded || !focus) && (
        <div style={{ display: "flex", justifyContent: branded ? "flex-end" : "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          {!branded && (
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <h1 style={{ fontSize: "1.05rem" }}><InlineFormIcon value={props.icon} size={18} />{props.title}</h1>
              {formDesc}
            </div>
          )}
          {/* หน้าสาธารณะ: ปุ่มสลับมุมมองอยู่ที่หัวเหมือนเดิม · โหมดเต็มจอ: อยู่ในเมนู ⋯ */}
          {!focus && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{viewToggle}</div>}
        </div>
      )}

      {draftNotice}
      {banner}
      {geoChip}
      {attForm.length > 0 && <AttachmentChips items={attForm} variant="form" />}

      <div style={{ display: "flex", gap: 6, margin: "10px 0 16px" }}>
        {schema.steps.map((s, i) => (
          <span key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: i === idx ? "var(--accent)" : i < idx || (wf && kase && (kase.status === "done" || i < kase.stepIdx)) ? "var(--pass)" : "var(--line)", opacity: wf && lockedStep(i) && i !== idx ? 0.55 : 1 }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
        {/* โหมดเต็มจอ: "ขั้นที่ x/N" อยู่บนแถบบนแล้ว */}
        {!focus && (
          <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
            {tt("fw.stepOf", { n: idx + 1, total: schema.steps.length })}
          </span>
        )}
        <h3 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: "1.05rem", scrollMarginTop: 72 }}>{step.title}</h3>
      </div>

      {wf && lockedStep(idx) && !viewOnly && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("wf.stepLocked")}
        </div>
      )}
      {!lockedStep(idx) && fillBar(step)}

      {step.fields.map((f) => renderField(f))}

      {submitErr && !submitting && (
        <div ref={submitErrRef} role="alert" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--fail)", background: "var(--fail-soft)", color: "var(--fail)", fontSize: ".88rem", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 200px", display: "inline-flex", gap: 6, alignItems: "flex-start" }}><Icon icon={AlertTriangle} className="h-4 w-4" /> {submitErr}</span>
          <Button onClick={() => void next()} style={{ padding: "8px 14px", minHeight: 44 }}>{t("fw.retry")}</Button>
        </div>
      )}
      {caseTools}
      {caseModals}
      <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
        <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("fill.locked")}
      </div>
      <FormFooterText text={theme.footer} />
    </div>
    {/* ปุ่มก่อนหน้า / ถัดไป / ส่ง — ติดขอบล่างจอ (นิ้วโป้งถึงเสมอ) */}
    {(idx > 0 || !(viewOnly && idx >= maxIdx)) && (
      <FillActionBar colWidth={focus ? FOCUS_COL_W : PUBLIC_COL_W}>
        {idx > 0 && <Button onClick={() => { setIdx(idx - 1); latest.current.idx = idx - 1; window.scrollTo(0, 0); void saveDraftNow("auto"); }} style={actionBtn(false)}>{t("fill.prev")}</Button>}
        {!(viewOnly && idx >= maxIdx) && (
          <Button data-tour="fill-submit" variant="primary" onClick={next} loading={submitting} disabled={mediaLoading && idx === maxIdx} style={actionBtn(true)}>
            {submitting ? t("fill.submitting")
              : idx < maxIdx || viewOnly ? t("fill.next")
              : wf && !isLastSeg ? handoffLabel
              : <><Icon icon={CheckCircle2} className="h-[18px] w-[18px]" /> {t("fill.submit")}</>}
          </Button>
        )}
      </FillActionBar>
    )}
    </PhotoStampProvider>
  );
}

/** หน้าสาธารณะ (/f/*): คอลัมน์ 640px ลบ padding 16px สองข้าง */
const PUBLIC_COL_W = 608;
/** ปุ่มในแถบล่าง: สูง ≥48px · ปุ่มหลักยืดเต็มที่เหลือ */
const actionBtn = (primary: boolean): React.CSSProperties => (
  primary ? { flex: 1, minHeight: 48, padding: "10px 14px", fontSize: "1.02rem" } : { flex: "0 0 auto", minHeight: 48, padding: "10px 16px" }
);


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


