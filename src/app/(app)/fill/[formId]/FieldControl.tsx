"use client";
import { detectBarcode } from "./fill-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { AlertTriangle, Lightbulb, Check, X, Camera, ScanLine, Sparkles } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { labelMap, type FormField } from "@/lib/form-schema";
import OptionPicker from "@/components/OptionPicker";
import { PhotoFrame, EmptyPhotoHint } from "@/components/paper/PaperPhotoGrid";
import { CONTROL_H } from "@/lib/paper-layout";
import { dtNowValue, formatDtThai } from "@/lib/dt-format";
import { minPhotosOf } from "@/lib/photo-slots";
import { PaperChoices, PaperLabel, PaperPassFail, PaperPhoto, PaperSignature, paperInputStyle } from "@/components/paper/PaperParts";
import { filterOptions } from "@/lib/datasets";
import LiveScanner from "@/components/LiveScanner";
import { formatNumber, outOfRange } from "@/lib/formula";
import AttachmentChips from "@/components/AttachmentView";
import { type Attachment } from "@/lib/attachments";
import { Answer, MediaPhotos, TableRow, dataUrlToBlob } from "./fill-types";
import { useShrink } from "./photo-stamp";
import { PaperTableField, TableInput } from "./FillTable";
import { SignatureModal, SignaturePad } from "./FillSignature";
import { MultiPhotoStrip, PhotoSlots } from "./FillPhotos";

/** ตัวเลือกที่พิมพ์เองมากกว่านี้ → ใช้ช่องค้นหา (รายการวิทยุยาวเกินบนมือถือ) */
const MANY_OPTIONS = 8;

export function FieldControl({
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
  photoCell,
  photoSlot = 0,
  slotPhotos,
  setSlotPhoto,
  inlineScan = false,
}: {
  field: FormField;
  /** ช่องข้อความที่สแกนบาร์โค้ด/QR ได้ — ปุ่มสแกนอยู่ในช่องนี้เลย */
  inlineScan?: boolean;
  /** กล่องภาพประกอบ: แสดงเฉพาะช่องรูปสูง photoCell px (กดถ่าย/เปลี่ยนรูป) ไม่มีชื่อช่อง */
  photoCell?: number;
  /** ช่องที่เท่าไรของฟิลด์ (ใช้กับ photoCell) */
  photoSlot?: number;
  /** ฟิลด์หลายรูป: รูปของทุกช่องตามลำดับ (undefined = ฟิลด์รูปเดียว) */
  slotPhotos?: (string | undefined)[];
  setSlotPhoto?: (slot: number, d: string | null) => void;
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
  const { t, tt, lang } = useT();
  const [initial] = useState(getInitial);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(initial.ai || "");
  const [scanMsg, setScanMsg] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [scanValue, setScanValue] = useState<string>(typeof initial.value === "string" ? initial.value : "");
  const photoRef = useRef<HTMLInputElement>(null);
  // ฟิลด์หลายรูป: แตะช่อง = เปิดกล้องตรง (เหมือนฟิลด์รูปเดียว) · "เลือกหลายรูป" = เปิดคลังรูป
  const cameraRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  // ลบรูปแล้วเลิกทำได้ภายใน 6 วินาที (แตะพลาดตอนใส่ถุงมือ — เดิมหายทันที)
  const [undoPhoto, setUndoPhoto] = useState<{ slot: number; url: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  const removeSlot = (slot: number) => {
    const url = slotPhotos?.[slot];
    setSlotPhoto?.(slot, null);
    if (!url) return;
    setUndoPhoto({ slot, url });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoPhoto(null), 6000);
  };

  // ฟิลด์หลายรูป: ช่องที่จะใส่รูปถัดไป (null = ช่องว่างช่องแรก · เลือกหลายไฟล์ = ไล่ใส่ช่องว่างถัดไป)
  const targetSlot = useRef<number | null>(null);
  const shrinkImage = useShrink(); // ย่อรูป + ลายน้ำ (ถ้าฟอร์มเปิด)
  const pickSlot = (slot: number | null) => { targetSlot.current = slot; (slot === null ? photoRef : cameraRef).current?.click(); };
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (slotPhotos && setSlotPhoto) {
      const taken = slotPhotos.map((u) => !!u);
      let fixed = targetSlot.current;
      for (const file of files) {
        const slot = fixed ?? taken.findIndex((x) => !x);
        if (slot < 0 || slot >= taken.length) break;
        try { setSlotPhoto(slot, await shrinkImage(file)); taken[slot] = true; } catch { /* ignore */ }
        fixed = null;
      }
      targetSlot.current = null;
      setAiResult("");
      return;
    }
    if (photoCell && setSlotPhoto && photoSlot > 0) {
      try { setSlotPhoto(photoSlot, await shrinkImage(files[0])); } catch { /* ignore */ }
      return;
    }
    try {
      setPhoto(await shrinkImage(files[0]));
      setAiResult("");
    } catch {
      /* ignore */
    }
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
      const txt = res.ok ? (j.reason || (j.ok ? t("fw.ai.ok") : t("fw.ai.review"))) : (j.error ? localizeServerMsg(j.error, lang) : t("fw.ai.fail"));
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
  // ฟิลด์พื้นที่ที่ตั้งค่าเริ่มต้นไว้ (ฟอร์มที่ใช้ที่เดียวตายตัว) — ใช้เมื่อยังไม่มีคำตอบเท่านั้น
  const areaDefault = f.area && f.area_default && (initial.value == null || initial.value === "") ? f.area_default : "";
  const [selVal, setSelVal] = useState<string>(typeof initial.value === "string" && initial.value ? initial.value : areaDefault);
  const [sigOpen, setSigOpen] = useState(false);
  // ตัวเลือกจากข้อมูลอ้างอิง (ดึงไม่ได้ → ใช้ตัวเลือกที่พิมพ์ไว้แทน)
  const parentValue = getParentValue?.();
  const optLabels = useMemo(() => labelMap(f.options, f.option_labels), [f.options, f.option_labels]);
  const dsBound = (!!f.options_source || !!f.area) && !f.options_error && (f.type === "select" || f.type === "checkbox");
  const dsOptions = dsBound ? filterOptions(f.options || [], f.options_parents, parentValue) : [];
  const waitParent = dsBound && !!f.options_parents && (parentValue == null || parentValue === "" || (Array.isArray(parentValue) && parentValue.length === 0));
  const dtMode = f.dt_mode ?? "datetime";
  const dtInputType = dtMode === "date" ? "date" : dtMode === "time" ? "time" : "datetime-local";
  const [dtDefault] = useState(() => (f.dt_no_default ? "" : dtNowValue(dtMode)));
  const [dtValue, setDtValue] = useState(() => String(initial.value ?? dtDefault));
  // seed datetime default so an untouched required field still submits
  useEffect(() => {
    if (f.type === "datetime" && dtDefault && (initial.value == null || initial.value === "")) {
      onPatch({ value: dtDefault });
    }
    if (areaDefault) onPatch({ value: areaDefault });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // แป้นตัวเลขของ iPhone ไม่มีปุ่ม "−" → ช่องที่ค่าติดลบได้ มีปุ่มสลับเครื่องหมาย
  const allowNeg = f.type === "number" && (f.min == null || f.min < 0);
  const toggleSign = () => {
    const v = String(numValue ?? "").trim();
    if (!v || v === "-") return;
    const next = v.startsWith("-") ? v.slice(1) : `-${v}`;
    setNumValue(next);
    onPatch({ value: next });
  };
  const passText = f.pass_label?.trim() || t("fw.pass");
  const failText = f.fail_label?.trim() || t("fw.fail");
  const textInputProps = {
    type: f.text_format === "email" ? "email" : f.text_format === "phone" ? "tel" : "text",
    inputMode: f.text_format === "email" ? ("email" as const) : f.text_format === "phone" ? ("tel" as const) : undefined,
    autoComplete: f.text_format === "email" ? "email" : f.text_format === "phone" ? "tel" : "off",
    enterKeyHint: "next" as const,
  };
  const textPh = f.example ? tt("fw.examplePh", { ex: f.example }) : f.text_format === "email" ? "name@example.com" : f.text_format === "phone" ? "08x-xxx-xxxx" : t("fw.answerPh");

  // ---------- โหมดกระดาษ (compact): ใช้ชิ้นส่วนเดียวกับ Editor ให้พอดีกล่องที่ออกแบบ ----------
  // เนื้อหาที่งอกเกินกล่อง (หมายเหตุตอนไม่ผ่าน, error, เอกสารแนบ, แถวตารางที่เพิ่ม)
  // จะดันช่องด้านล่างลงเอง (FormPaperFill.reflow) — ไม่ทับกัน
  // ช่องข้อความที่สแกนได้: ช่องกรอก + ปุ่มสแกนในช่องเดียวกัน
  const scanBox = (small: boolean) => (
    <>
      <div style={{ display: "flex", gap: small ? 4 : 8, alignItems: "center" }}>
        <input type="text" enterKeyHint="next" autoComplete="off" style={small ? { ...paperInputStyle, flex: 1 } : { ...input, flex: 1, minWidth: 0 }} value={scanValue}
          placeholder={small ? "" : f.example ? tt("fw.examplePh", { ex: f.example }) : t("fw.codePh")}
          onChange={(e) => { setScanValue(e.target.value); onPatch({ value: e.target.value }); }} />
        {small ? (
          <button type="button" onClick={() => setLiveOpen(true)} aria-label={t("scan.live")} title={t("scan.live")}
            style={{ height: CONTROL_H, width: 30, flexShrink: 0, border: "1px solid #2f6fe0", borderRadius: 4, background: "#eef4ff", color: "#2f6fe0", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon icon={ScanLine} className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Button variant="primary" onClick={() => setLiveOpen(true)} style={{ whiteSpace: "nowrap" }}><Icon icon={ScanLine} className="h-4 w-4" /> {t("scan.live")}</Button>
        )}
      </div>
      {!small && (
        <button type="button" onClick={() => scanRef.current?.click()}
          style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "var(--accent-text)", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon icon={Camera} className="h-3.5 w-3.5" /> {t("fw.scan.fromPhoto")}
        </button>
      )}
      <input ref={scanRef} type="file" accept="image/*" capture="environment" hidden onChange={onScan} />
      {scanMsg && <div style={{ fontSize: small ? ".66rem" : ".8rem", color: small ? "#666" : "var(--ink-3)", marginTop: 4 }}>{scanMsg}</div>}
      {liveOpen && (
        <LiveScanner onClose={() => setLiveOpen(false)}
          onResult={(code) => { setLiveOpen(false); setScanValue(code); onPatch({ value: code }); setScanMsg(tt("fw.scan.read", { code })); }} />
      )}
    </>
  );

  if (photoCell && f.type === "photo") {
    const cellUrl = slotPhotos ? slotPhotos[photoSlot] : photo;
    const pickThis = () => (slotPhotos ? pickSlot(photoSlot) : photoRef.current?.click());
    return (
      <div>
        <PhotoFrame url={cellUrl} height={photoCell} alt={f.label}>
          <EmptyPhotoHint onClick={pickThis} />
        </PhotoFrame>
        {cellUrl && (
          <button type="button" onClick={pickThis} aria-label={t("fw.paper.retake")} title={t("fw.paper.retake")}
            style={{ position: "relative", marginTop: -26, marginLeft: 4, height: 22, display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid #ccc", borderRadius: 4, background: "rgba(255,255,255,.92)", color: "#333", fontFamily: "inherit", fontSize: ".66rem", padding: "0 6px", cursor: "pointer" }}>
            <Icon icon={Camera} className="h-3 w-3" /> {t("fw.paper.retake")}
          </button>
        )}
        {error && photoSlot === 0 && <div style={{ fontSize: ".66rem", color: "#dc2626" }}>{error}</div>}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
      </div>
    );
  }
  // ฟิลด์หลายรูป (นอกกล่องภาพประกอบ): แถบรูปย่อ + เพิ่มรูป
  const multiStrip = slotPhotos && setSlotPhoto ? (
    <>
      {compact ? (
        <MultiPhotoStrip urls={slotPhotos} paper={paper} compact={compact} min={minPhotosOf(f)} hideMin={!!error}
          onAdd={() => pickSlot(null)} onRetake={(i) => pickSlot(i)} onRemove={removeSlot} />
      ) : (
        // มุมมองมือถือ: ช่องรูปแยกตามจำนวนที่ตั้ง พร้อมชื่อใต้รูป (รู้ว่าต้องถ่ายอะไรในแต่ละช่อง)
        <PhotoSlots urls={slotPhotos} paper={paper} min={minPhotosOf(f)} hideMin={!!error}
          captions={slotPhotos.map((_, i) => f.photo_labels?.[i]?.trim() || tt("print.photos.slotN", { n: i + 1 }))}
          onPick={(i) => pickSlot(i)} onPickMany={() => pickSlot(null)} onRemove={removeSlot} />
      )}
      {undoPhoto && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: compact ? ".7rem" : ".84rem", color: paper || compact ? "#555" : "var(--ink-2)" }}>
          {t("fw.photo.removed")}
          <button type="button" onClick={() => { setSlotPhoto(undoPhoto.slot, undoPhoto.url); setUndoPhoto(null); }}
            style={{ minHeight: compact ? 0 : 36, padding: compact ? "0 4px" : "0 10px", border: "1px solid var(--accent)", borderRadius: 8, background: "none", color: "var(--accent-text)", fontFamily: "inherit", fontWeight: 600, fontSize: "inherit", cursor: "pointer" }}>
            {t("fw.photo.undo")}
          </button>
        </div>
      )}
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={onPhoto} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
    </>
  ) : null;
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
        {f.type === "text" && !inlineScan && (
          <input {...textInputProps} style={paperInputStyle} defaultValue={String(initial.value ?? "")} placeholder={f.example ? tt("fw.examplePh", { ex: f.example }) : ""} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {f.type === "text" && inlineScan && scanBox(true)}
        {f.type === "number" && (
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" inputMode="decimal" style={{ ...paperInputStyle, flex: 1, minWidth: 0, ...(numOut(f, numValue) ? { borderColor: "#dc2626", color: "#dc2626" } : {}) }} value={numValue} placeholder={f.example || ""} title={f.min != null || f.max != null ? tt("fw.rangeTitle", { min: f.min ?? "–", max: f.max ?? "–" }) : undefined} onChange={(e) => { setNumValue(e.target.value); onPatch({ value: e.target.value }); }} />
            {allowNeg && (
              <button type="button" onClick={toggleSign} aria-label={t("fw.num.sign")} title={t("fw.num.sign")}
                style={{ height: CONTROL_H, width: 30, flexShrink: 0, border: "1px solid #b9bec4", borderRadius: 4, background: "#fff", color: "#333", fontWeight: 700, cursor: "pointer", padding: 0 }}>±</button>
            )}
          </div>
        )}
        {f.type === "datetime" && (
          <input type={dtInputType} style={paperInputStyle} value={dtValue} onChange={(e) => { setDtValue(e.target.value); onPatch({ value: e.target.value }); }} />
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
            <PaperPassFail value={pf} passLabel={passText} failLabel={failText} allowNa={!!f.allow_na} onChange={(v) => { setPf(v); onPatch({ value: v }, true); }} />
            {pf === "fail" && (
              <textarea style={{ ...paperInputStyle, height: 44, padding: "4px 8px", marginTop: 4, resize: "vertical" }} defaultValue={initial.note || ""} placeholder={t("fw.failNotePh")} onChange={(e) => onPatch({ note: e.target.value })} />
            )}
          </>
        )}
        {f.type === "photo" && multiStrip}
        {f.type === "photo" && !multiStrip && (
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
            {f.sign_name && <input type="text" style={{ ...paperInputStyle, marginTop: 3 }} defaultValue={String(initial.value ?? "")} placeholder={t("fw.sig.namePh")} onChange={(e) => onPatch({ value: e.target.value })} />}
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
    // ใช้ border แบบเต็ม (ไม่ใช่ borderColor) — React ลบ longhand แล้วสีกรอบกลายเป็นสีดำ
    // role="group" + aria-labelledby: โปรแกรมอ่านหน้าจออ่านชื่อช่องก่อนช่องกรอกทุกแบบ (เดิมได้แค่ placeholder)
    <div role="group" aria-labelledby={`lbl-${f.id}`} aria-describedby={error ? `err-${f.id}` : undefined} aria-invalid={error ? true : undefined}
      style={{ ...box, ...(error ? (paper ? { borderBottom: "1px solid var(--fail)" } : { border: "1px solid var(--fail)" }) : {}) }}>
      <div id={`lbl-${f.id}`} style={{ fontWeight: compact ? 700 : 600, fontSize: compact ? ".78rem" : undefined, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", color: paper ? "#111" : undefined }}>
        {f.label}
        {f.required && <span style={{ color: "var(--fail)", fontWeight: 700 }} aria-label={t("fw.required")}>*</span>}
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
        {f.type === "text" && inlineScan && scanBox(false)}
        {f.type === "text" && !inlineScan && (
          f.long_text && !compact
            ? <textarea style={{ ...input, minHeight: 72, resize: "vertical" }} rows={3} defaultValue={String(initial.value ?? "")} placeholder={textPh} onChange={(e) => onPatch({ value: e.target.value })} />
            : <input {...textInputProps} style={input} defaultValue={String(initial.value ?? "")} placeholder={textPh} onChange={(e) => onPatch({ value: e.target.value })} />
        )}
        {f.type === "number" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" inputMode="decimal" enterKeyHint="next" style={{ ...input, flex: 1, minWidth: 0 }} value={numValue} placeholder={f.example ? tt("fw.examplePh", { ex: f.example }) : t("fw.numPh")} onChange={(e) => { setNumValue(e.target.value); onPatch({ value: e.target.value }); }} />
              {allowNeg && (
                <button type="button" onClick={toggleSign} aria-label={t("fw.num.sign")} title={t("fw.num.sign")}
                  style={{ width: 48, height: 48, flexShrink: 0, border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)", fontSize: "1.15rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  ±
                </button>
              )}
              {f.unit && <span style={{ color: "var(--ink-2)" }}>{f.unit}</span>}
            </div>
            {(f.min != null || f.max != null) && <NumHint field={f} value={numValue} />}
          </>
        )}
        {f.type === "datetime" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type={dtInputType} style={{ ...input, flex: 1 }} value={dtValue} onChange={(e) => { setDtValue(e.target.value); onPatch({ value: e.target.value }); }} />
              <Button onClick={() => { const v = dtNowValue(dtMode); setDtValue(v); onPatch({ value: v }); }} style={{ whiteSpace: "nowrap" }}>{dtMode === "date" ? t("fw.dt.today") : t("fw.dt.now")}</Button>
            </div>
            {dtValue && <div style={{ fontSize: ".8rem", color: paper ? "#666" : "var(--ink-3)", marginTop: 4 }}>{formatDtThai(dtValue, dtMode, lang === "en" ? "en" : "th")}</div>}
          </>
        )}
        {f.type === "formula" && (() => {
          const bad = outOfRange(formulaValue ?? null, f);
          return (
            <>
              <div aria-live="polite" style={{ ...input, display: "flex", alignItems: "center", gap: 10, background: paper ? "#f4f6f8" : "var(--code-bg)", cursor: "default", ...(bad ? { border: "1px solid var(--fail)" } : {}) }}>
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
        {f.type === "select" && !dsBound && (f.options || []).length > MANY_OPTIONS && (
          <OptionPicker name={"r_" + f.id} options={f.options || []} multiple={false} value={selVal} paper={paper} compact={compact}
            onChange={(v) => { const one = Array.isArray(v) ? v[0] ?? "" : v; setSelVal(one); onPatch({ value: one || undefined }); }} />
        )}
        {f.type === "select" && !dsBound && (f.options || []).length <= MANY_OPTIONS &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", minHeight: 44 }}>
              <input type="radio" name={"r_" + f.id} value={o} checked={selVal === o} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} onChange={() => { setSelVal(o); onPatch({ value: o }); }} />
              {o}
            </label>
          ))}
        {f.type === "select" && !dsBound && !f.required && selVal && (f.options || []).length <= MANY_OPTIONS && (
          <button type="button" onClick={() => { setSelVal(""); onPatch({ value: undefined }); }}
            style={{ background: "none", border: "none", padding: "2px 4px", color: paper ? "#666" : "var(--ink-3)", fontFamily: "inherit", fontSize: ".8rem", cursor: "pointer", textDecoration: "underline" }}>
            {t("fw.clearChoice")}
          </button>
        )}
        {f.type === "checkbox" && !dsBound && (f.options || []).length > MANY_OPTIONS && (
          <OptionPicker name={"r_" + f.id} options={f.options || []} multiple value={cbVals} paper={paper} compact={compact}
            onChange={(v) => { const arr = Array.isArray(v) ? v : v ? [v] : []; setCbVals(arr); onPatch({ value: arr }); }} />
        )}
        {f.type === "checkbox" && !dsBound && (f.options || []).length <= MANY_OPTIONS &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", minHeight: 44 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: f.allow_na ? "1fr 1fr auto" : "1fr 1fr", gap: 10 }}>
              <PfBtn active={pf === "pass"} kind="pass" paper={paper} onClick={() => { setPf("pass"); onPatch({ value: "pass" }, true); }}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon icon={Check} className="h-4 w-4" /> {passText}</span></PfBtn>
              <PfBtn active={pf === "fail"} kind="fail" paper={paper} onClick={() => { setPf("fail"); onPatch({ value: "fail" }, true); }}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon icon={X} className="h-4 w-4" /> {failText}</span></PfBtn>
              {f.allow_na && (
                <PfBtn active={pf === "na"} kind="na" paper={paper} onClick={() => { setPf("na"); onPatch({ value: "na" }, true); }}>{t("fw.na")}</PfBtn>
              )}
            </div>
            {pf === "fail" && (
              <textarea style={{ ...input, minHeight: 56, marginTop: 10, resize: "vertical" }} rows={2} defaultValue={initial.note || ""} placeholder={t("fw.failNotePh")} onChange={(e) => onPatch({ note: e.target.value })} />
            )}
          </>
        )}
        {f.type === "photo" && multiStrip}
        {f.type === "photo" && !multiStrip && (
          <>
            <button type="button" onClick={() => photoRef.current?.click()} style={{ display: "block", width: "100%", fontFamily: "inherit", background: "transparent", border: paper ? "2px dashed #b9bec4" : "2px dashed var(--line)", borderRadius: 10, padding: compact ? 8 : 18, textAlign: "center", color: paper ? "#777" : "var(--ink-3)", fontSize: compact ? ".8rem" : ".9rem", cursor: "pointer" }}>
              {photo && <img src={photo} alt={t("fw.photoAlt")} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", margin: "0 auto 8px" }} />}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{photo ? t("fw.retake") : <><Icon icon={Camera} className="h-4 w-4" /> {t("fw.takePhoto")}</>}</span>
            </button>
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
        {f.type === "signature" && (
          <>
            <SignaturePad hasSig={hasSig} initialUrl={sigUrl} onSave={setSig} paper={paper} compact={compact} />
            {f.sign_name && (
              <input type="text" style={{ ...input, marginTop: 8 }} defaultValue={String(initial.value ?? "")} placeholder={t("fw.sig.namePh")} onChange={(e) => onPatch({ value: e.target.value })} />
            )}
          </>
        )}
        {f.type === "table" && (
          <TableInput
            fieldId={f.id}
            media={media}
            columns={f.columns || []}
            minRows={f.min_rows || 1}
            maxRows={f.max_rows}
            initial={Array.isArray(initial.value) && typeof initial.value[0] === "object" ? (initial.value as TableRow[]) : []}
            onChange={(rows) => onPatch({ value: rows }, false)}
            variant={compact ? "compact" : paper ? "paper" : "normal"}
            error={error}
          />
        )}
      </div>

      {error && <div id={`err-${f.id}`} role="alert" style={{ fontSize: ".82rem", color: "var(--fail)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function NumHint({ field: f, value }: { field: FormField; value?: string }) {
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

export function PfBtn({ active, kind, onClick, children, paper = false }: { active: boolean; kind: "pass" | "fail" | "na"; onClick: () => void; children: React.ReactNode; paper?: boolean }) {
  const on = kind === "pass"
    ? { background: "var(--pass-soft)", border: "1px solid var(--pass)", color: "var(--pass)" }
    : kind === "fail"
    ? { background: "var(--fail-soft)", border: "1px solid var(--fail)", color: "var(--fail)" }
    : { background: paper ? "#eef0f2" : "var(--code-bg)", border: `1px solid ${paper ? "#666" : "var(--ink-3)"}`, color: paper ? "#333" : "var(--ink-2)" };
  const base = paper
    ? { border: "1px solid #b9bec4", background: "#fff", color: "#111" }
    : { border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" };
  return (
    <button type="button" aria-pressed={active} onClick={onClick} style={{ padding: 14, fontWeight: 700, fontSize: "1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", ...base, ...(active ? on : {}), ...(active ? { boxShadow: "inset 0 0 0 1px currentColor" } : {}) }}>
      {children}
    </button>
  );
}

/**
 * ค่าที่สแกน/AI อ่านได้ → ค่าที่ต้องบันทึก สำหรับ dropdown ที่ "แสดงชื่อ เก็บรหัส"
 * ตรงกับรหัสอยู่แล้ว = ใช้เลย · ตรงกับชื่อ (ไม่สนตัวพิมพ์) = แปลงเป็นรหัส · ไม่ตรง = คงค่าเดิมให้คนแก้
 */
export function toCode(f: FormField | undefined, value: string): string {
  if (!f?.option_labels || !f.options || f.options.includes(value)) return value;
  const v = value.trim().toLowerCase();
  const i = f.option_labels.findIndex((l) => l && l.trim().toLowerCase() === v);
  return i >= 0 ? f.options[i] : value;
}

/** ค่าตัวเลขนอกช่วงที่กำหนด */
export function numOut(f: FormField, value: string): boolean {
  const v = parseFloat(value);
  return Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max));
}

