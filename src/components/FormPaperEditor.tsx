"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_PAPER_IMAGES, imageKey, type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";
import { CANVAS_W, GRID, START_Y, PAD, HEADER_H, GAP_Y, HEADER_KEY, META_KEY, DEFAULT_HEADER_BOX, DEFAULT_META_BOX, buildBlocks, autoLayout, resolveLayout, snap, blockHeight } from "@/lib/paper-layout";
import PaperPhotoGrid, { photoCaption } from "@/components/paper/PaperPhotoGrid";
import { maxPhotosOf, photoSlotKey } from "@/lib/photo-slots";
import { usePaperReflow } from "@/components/paper/usePaperReflow";
import { PaperChoices, PaperFooterText, PaperHeaderContent, PaperImageContent, PaperLabel, PaperMetaContent, PaperPassFail, PaperPhoto, PaperSignature, PaperTable, paperBoxStyle, paperHeaderBoxStyle, paperInputStyle, paperStepStyle } from "@/components/paper/PaperParts";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import { LayoutGrid, RotateCcw, Move, GripVertical, Printer, Plus, ListPlus, Copy, Scissors, ClipboardPaste, CopyPlus, Trash2, Undo2, Redo2, EyeOff, StretchHorizontal, Columns2, Keyboard, ImagePlus } from "lucide-react";
import type { ResolvedTheme } from "@/lib/theme";
import { useUploadErrorText } from "@/components/BrandingEditor";
import BrandImageChooser from "@/components/BrandImageChooser";
import { duplicateField, findField, insertField, offsetBox, orderedKeys, parseClip, serializeClip, stepIndexOfKey } from "@/lib/editor-ops";

let idc = 0;
const newFieldId = () => `f_${Date.now().toString(36)}${(idc++).toString(36)}`;

// ============================================================
// FormPaperEditor — มุมมองกระดาษแบบ "ลากวาง" ปรับตำแหน่ง element ได้
// เขียนผลลง schema.layout (px บนแคนวาส A4 กว้าง 794)
// ตรรกะการจัดวางอยู่ที่ @/lib/paper-layout (ใช้ร่วมกับหน้ากรอก)
// ============================================================

// ตัวอย่างช่องบนกระดาษ — ใช้ชิ้นส่วนเดียวกับหน้ากรอก (โหมดกระดาษ) ในสถานะ disabled
// จึงเห็นขนาด/ระยะตรงกับตอนกรอกจริง
function FieldPreview({ f }: { f: FormField }) {
  const { t, tt } = useT();
  const badge = <span style={{ fontSize: ".62rem", color: "#999", fontWeight: 400 }}>{t(f.area ? "ftype.area" : `ftype.${f.type}`)}{f.unit ? ` (${f.unit})` : ""}{maxPhotosOf(f) > 1 ? ` · ≤${maxPhotosOf(f)}` : ""}</span>;
  const label = <PaperLabel label={f.label || t("fw.noName")} required={f.required} right={badge} />;
  const inputLike = (text = "") => <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", color: "#aaa" }}>{text}</div>;
  if (f.type === "table") {
    const rows = Array.from({ length: Math.min(Math.max(f.min_rows ?? 1, 1), 6) }, () => ({}));
    return <>{label}<PaperTable columns={f.columns || []} rows={rows} disabled /></>;
  }
  let body: React.ReactNode;
  if (f.type === "pass_fail") body = <PaperPassFail disabled passLabel={f.pass_label} failLabel={f.fail_label} allowNa={!!f.allow_na} />;
  else if (f.type === "photo") body = <PaperPhoto disabled />;
  else if (f.type === "signature") body = <PaperSignature disabled />;
  else if ((f.type === "select" || f.type === "checkbox") && (f.options_source || f.area)) body = inputLike(f.area ? t("ftype.area") : t("fw.dsOptionsPh"));
  else if (f.type === "select" || f.type === "checkbox") body = <PaperChoices name={`p_${f.id}`} options={f.options || []} multiple={f.type === "checkbox"} value={f.type === "checkbox" ? [] : ""} disabled />;
  else if (f.type === "datetime") body = inputLike(f.dt_mode === "date" ? "วว/ดด/ปปปป" : f.dt_mode === "time" ? "--:--" : t("fw.datePh"));
  else if (f.type === "child_form") body = <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", color: "#2f6fe0", borderStyle: "dashed" }}>{f.child_form?.form_title ? tt("child.open", { form: f.child_form.form_title }) : t("child.notConfigured")}</div>;
  else if (f.type === "formula") body = <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#999", background: "#f4f6f8" }}><span>ƒ</span><span>{t("formula.auto")}</span></div>;
  else body = inputLike(f.example ? tt("fw.examplePh", { ex: f.example }) : "");
  return <>{label}{body}</>;
}

export default function FormPaperEditor({
  schema,
  onChange,
  selectedKey,
  onSelect,
  onPrint,
  onAddField,
  onAddStep,
  onDeleteKey,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCheckpoint,
  theme,
  tenantId = "",
}: {
  schema: FormSchema;
  onChange: (s: FormSchema) => void;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onPrint?: () => void;
  onAddField?: () => void;
  onAddStep?: () => void;
  /** ลบบล็อก (ผู้เรียกจัดการแถบ "เลิกทำ") */
  onDeleteKey?: (key: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** อ่านตอนเปิดเมนูคลิกขวา (event handler) */
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  /** ก่อนคำสั่งเดี่ยว — ให้ย้อนกลับได้ทีละคำสั่ง (ไม่รวมกับการลาก/พิมพ์ที่เพิ่งทำ) */
  onCheckpoint?: () => void;
  /** ธีมของฟอร์ม (โลโก้/สีหัว/ข้อความท้าย) — แสดงให้เห็นตอนออกแบบ */
  theme?: ResolvedTheme;
  /** สำหรับอัปโหลดรูปประกอบ */
  tenantId?: string;
}) {
  const { t, tt } = useT();
  const blocks = useMemo(() => buildBlocks(schema), [schema]);
  const photosHidden = schema.print_photos?.mode === "hidden";
  const [capKey, setCapKey] = useState<string | null>(null); // ช่องรูปที่คลิกล่าสุด (แก้ชื่อใต้รูป)
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clip = useRef<FormField | null>(null);
  const [scale, setScale] = useState(1);
  const [internalActive, setInternalActive] = useState<string | null>(null);
  const active = selectedKey !== undefined ? selectedKey : internalActive;
  const select = useCallback((k: string | null) => { if (onSelect) onSelect(k); else setInternalActive(k); }, [onSelect]);

  // layout ปัจจุบัน: ใช้จาก schema ถ้ามี, ไม่มีก็ auto
  const layout: Record<string, PaperBox> = useMemo(() => {
    const merged = resolveLayout(schema, blocks);
    // ชื่อเอกสาร + วันที่/เลขที่ เป็นบล็อกลากวางแยกกัน
    merged[HEADER_KEY] = schema.layout?.[HEADER_KEY] || DEFAULT_HEADER_BOX;
    merged[META_KEY] = schema.layout?.[META_KEY] || DEFAULT_META_BOX;
    return merged;
  }, [blocks, schema]);

  // ---- คลิกขวาบนกระดาษ: เพิ่มฟิลด์ / เพิ่มขั้นตอน ณ ตำแหน่งที่คลิก ----
  const [ctx, setCtx] = useState<{ cx: number; cy: number; x: number; y: number; target: string | null; undo: boolean; redo: boolean; clip: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // "คัดลอกแล้ว" ฯลฯ ชั่วครู่
  const [showKeys, setShowKeys] = useState(false);
  const flash = useCallback((m: string) => { setNotice(m); window.setTimeout(() => setNotice((n) => (n === m ? null : n)), 1800); }, []);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);
  function onContextMenu(e: React.MouseEvent) {
    const el = canvasRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    // คลิกขวาบนบล็อก = เลือกบล็อกนั้น + เมนูของบล็อก · ที่ว่าง = เมนูเพิ่ม/วาง
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-block-key]")?.dataset.blockKey ?? null;
    if (target) select(target);
    // เมนูไม่ล้นขอบจอ (ความสูงประมาณตามจำนวนรายการ)
    const estH = target ? (findField(schema, target) ? 300 : 160) : 300;
    const cx = Math.min(e.clientX, window.innerWidth - 250);
    const cy = Math.max(8, Math.min(e.clientY, window.innerHeight - estH));
    setCtx({ cx, cy, x, y, target, undo: !!canUndo?.(), redo: !!canRedo?.(), clip: !!clip.current });
  }
  /** ขั้นตอนที่ตำแหน่ง y อยู่ใต้หัวข้อ (หัวข้อขั้นตอนล่าสุดที่อยู่เหนือจุดคลิก) */
  function stepAtY(y: number): number {
    let si = -1;
    let best = -Infinity;
    schema.steps.forEach((st, i) => {
      const k = `s:${st.id}`;
      const top = tops[k] ?? layout[k]?.y;
      if (top != null && top <= y && top > best) { best = top; si = i; }
    });
    return si < 0 ? 0 : si;
  }
  function addFieldAt(x: number, y: number) {
    if (!schema.steps.length) return;
    const si = stepAtY(y);
    const nf: FormField = { id: newFieldId(), type: "text", label: "", required: true };
    // ลำดับในขั้นตอน (มุมมองมือถือ/ลำดับกรอก): ต่อจากช่องที่อยู่เหนือจุดคลิก
    const fields = schema.steps[si].fields;
    let at = 0;
    fields.forEach((f, i) => { const b = layout[f.id]; if (b && (tops[f.id] ?? b.y) <= y) at = i + 1; });
    const steps = schema.steps.map((st, i) => (i === si ? { ...st, fields: [...fields.slice(0, at), nf, ...fields.slice(at)] } : st));
    const w = Math.floor((CANVAS_W - PAD * 2 - 16) / 2);
    const box: PaperBox = { x: Math.max(0, Math.min(CANVAS_W - w, snap(x))), y: Math.max(0, snap(y)), w };
    onCheckpoint?.();
    onChange({ ...schema, steps, layout: { ...layout, [nf.id]: box } });
    select(nf.id);
  }
  function addStepAt(y: number) {
    const above = schema.steps.length ? stepAtY(y) : -1;
    // คลิกเหนือหัวข้อขั้นตอนแรก = แทรกเป็นขั้นตอนแรก
    const firstTop = schema.steps[0] ? (tops[`s:${schema.steps[0].id}`] ?? layout[`s:${schema.steps[0].id}`]?.y ?? 0) : 0;
    const at = schema.steps.length === 0 ? 0 : y < firstTop ? 0 : above + 1;
    const sid = newFieldId().replace(/^f_/, "s_");
    const nf: FormField = { id: newFieldId(), type: "text", label: "", required: true };
    const steps = [...schema.steps.slice(0, at), { id: sid, title: t("paper.ctx.newStep"), fields: [nf] }, ...schema.steps.slice(at)];
    const sy = Math.max(0, snap(y));
    const colW = Math.floor((CANVAS_W - PAD * 2 - 16) / 2);
    onCheckpoint?.();
    onChange({
      ...schema, steps,
      layout: { ...layout, [`s:${sid}`]: { x: PAD, y: sy, w: CANVAS_W - PAD * 2 }, [nf.id]: { x: PAD, y: sy + HEADER_H + GAP_Y, w: colW } },
    });
    select(`s:${sid}`);
  }

  // กติกาเดียวกับหน้ากรอก: เนื้อหาเกินกล่อง → ดันบล็อกด้านล่างลง (แสดงผลเท่านั้น ไม่แก้ตำแหน่งที่ออกแบบ)
  const { measureRef, tops, height: canvasH, overflows } = usePaperReflow(blocks, layout);
  const footer = theme?.footer ?? "";
  const pageH = canvasH + (footer ? 30 + 14 * Math.min(6, footer.split("\n").length) : 0);

  // ---- รูปประกอบบนกระดาษ (โลโก้/ตรา/แผนผัง) ----
  // chooser: null = ปิด · { at } = เปิด (at = จุดที่คลิกขวา, ไม่มี = ต่อท้ายกระดาษ)
  const [chooser, setChooser] = useState<{ at: { x: number; y: number } | null } | null>(null);
  const uploadErr = useUploadErrorText();
  const imageCount = schema.images?.length ?? 0;
  function pickImageAt(at: { x: number; y: number } | null) {
    if (imageCount >= MAX_PAPER_IMAGES) { flash(tt("brand.imageMax", { n: MAX_PAPER_IMAGES })); return; }
    setChooser({ at });
  }
  function onImagePicked(url: string, at: { x: number; y: number } | null) {
    setChooser(null);
    const id = newFieldId().replace(/^f_/, "i");
    const w = 160;
    const box: PaperBox = at
      ? { x: Math.max(0, Math.min(CANVAS_W - w, snap(at.x))), y: Math.max(0, snap(at.y)), w }
      : { ...boxAtEnd(), w };
    onCheckpoint?.();
    onChange({ ...schema, images: [...(schema.images ?? []), { id, url, h: 80 }], layout: { ...layout, [imageKey(id)]: box } });
    select(imageKey(id));
  }

  const drag = useRef<{ key: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null);

  const commit = useCallback(
    (next: Record<string, PaperBox>) => {
      onChange({ ...schema, layout: next });
    },
    [onChange, schema]
  );

  function onPointerDown(e: React.PointerEvent, key: string, mode: "move" | "resize", fromHandle = false) {
    // แตะที่ "ตัวฟิลด์" บนมือถือ = ให้เบราว์เซอร์เลื่อน/แพนกระดาษ (ไม่ลาก)
    // ลากปรับตำแหน่งด้วยนิ้วได้ผ่าน "ที่จับ" (fromHandle) เท่านั้น ส่วนเมาส์ลากได้ทั้งตัว
    if (e.pointerType !== "mouse" && !fromHandle) return;
    if (e.button !== 0) return; // คลิกขวา = เปิดเมนู ไม่ลาก
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const box = layout[key];
    drag.current = { key, mode, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, ow: box.w };
    // ลากด้วยนิ้วผ่านที่จับ (ทัช): ปิดแผงตั้งค่าเพื่อไม่ให้ popup บังตอนลาก
    // (แตะที่ "ตัวฟิลด์" เพื่อเปิดตั้งค่าแทน) — เมาส์ยังเลือก+ไฮไลต์ได้ตามปกติ
    if (fromHandle && e.pointerType !== "mouse") select(null);
    else select(key);
    scrollRef.current?.focus({ preventScroll: true });
  }

  /** จัดเรียงอัตโนมัติ — รูปประกอบ/หัวเอกสารอยู่ที่เดิม */
  function arranged(): Record<string, PaperBox> {
    const keep: Record<string, PaperBox> = {};
    for (const b of blocks) if (b.kind === "image" && layout[b.key]) keep[b.key] = layout[b.key];
    for (const k of [HEADER_KEY, META_KEY]) if (schema.layout?.[k]) keep[k] = schema.layout[k];
    return { ...autoLayout(blocks), ...keep };
  }

  // ---- คำสั่งแก้ไข (ใช้ทั้งคีย์บอร์ดและเมนูคลิกขวา) ----
  const colW = Math.floor((CANVAS_W - PAD * 2 - 16) / 2);
  /** ตำแหน่งต่อท้ายกระดาษ (ใต้บล็อกล่างสุด) */
  function boxAtEnd(): PaperBox {
    let bottom = START_Y;
    for (const b of blocks) {
      const bx = layout[b.key];
      if (bx) bottom = Math.max(bottom, (tops[b.key] ?? bx.y) + blockHeight(b));
    }
    return { x: PAD, y: snap(bottom + GAP_Y), w: colW };
  }
  /** วางฟิลด์จากคลิปบอร์ด: ต่อจากฟิลด์ที่เลือก / ท้ายขั้นตอนที่เลือก / ณ จุดที่คลิกขวา */
  function pasteField(src: FormField, at?: { x: number; y: number }) {
    if (!schema.steps.length) return;
    const nf: FormField = { ...structuredClone(src), id: newFieldId() };
    let si = schema.steps.length - 1;
    let pos = schema.steps[si].fields.length;
    let box: PaperBox | undefined;
    const loc = at ? null : findField(schema, active);
    const sIdx = at ? -1 : stepIndexOfKey(schema, active);
    if (at) {
      si = stepAtY(at.y);
      pos = 0;
      schema.steps[si].fields.forEach((f, i) => { const bx = layout[f.id]; if (bx && (tops[f.id] ?? bx.y) <= at.y) pos = i + 1; });
      box = { x: Math.max(0, Math.min(CANVAS_W - colW, snap(at.x))), y: Math.max(0, snap(at.y)), w: colW };
    } else if (loc) {
      si = loc.si; pos = loc.fi + 1; box = offsetBox(layout[loc.field.id]);
    } else if (sIdx >= 0) {
      si = sIdx; pos = schema.steps[si].fields.length;
    }
    const next = insertField(schema, nf, si, pos);
    onCheckpoint?.();
    onChange({ ...next, layout: { ...layout, [nf.id]: box ?? boxAtEnd() } });
    select(nf.id);
  }
  function duplicate(key: string) {
    const nid = newFieldId();
    const next = duplicateField(schema, key, nid);
    if (!next) return;
    onCheckpoint?.();
    onChange({ ...next, layout: { ...layout, [nid]: offsetBox(layout[key]) ?? boxAtEnd() } });
    select(nid);
  }
  function copyKey(key: string): boolean {
    const loc = findField(schema, key);
    if (!loc) return false;
    clip.current = structuredClone(loc.field);
    // คลิปบอร์ดของเครื่องด้วย (วางข้ามแท็บ/ข้ามฟอร์มได้) — เบราว์เซอร์ไม่อนุญาตก็ใช้ในหน้านี้ได้ตามเดิม
    navigator.clipboard?.writeText(serializeClip(loc.field)).catch(() => {});
    flash(t("kb.copied"));
    return true;
  }
  function setWidth(key: string, full: boolean) {
    const bx = layout[key];
    if (!bx) return;
    onCheckpoint?.();
    commit({ ...layout, [key]: full ? { ...bx, x: PAD, w: CANVAS_W - PAD * 2 } : { ...bx, w: colW, x: Math.min(bx.x, CANVAS_W - colW) } });
  }
  /** Enter / "ตั้งค่า" → โฟกัสช่องแรกในแผงตั้งค่าด้านขวา */
  function focusSettings() {
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".krok-aside input:not([type=checkbox]):not([type=radio]), .krok-aside textarea, .krok-aside select")?.focus();
    }, 80);
  }
  function selectAndReveal(key: string) {
    select(key);
    window.setTimeout(() => document.querySelector(`[data-block-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }), 0);
  }

  // ---- คีย์บอร์ด (ทั้งหน้า ขณะเปิดมุมมองกระดาษ — ไม่ต้องคลิกกระดาษก่อน) ----
  // Ctrl+Z/Y, Delete, Esc, Alt+↑↓ อยู่ที่หน้า Studio (ใช้ร่วมกับมุมมองมือถือ)
  useEffect(() => {
    const busy = (el: EventTarget | null) =>
      !!(el as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]") ||
      !!document.querySelector("[role=dialog], [role=alertdialog]");
    function onKey(e: KeyboardEvent) {
      if (busy(e.target) || ctx) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (k === "?" || (e.shiftKey && k === "/")) { setShowKeys((v) => !v); e.preventDefault(); return; }
      if (mod && k === "p") { onPrint?.(); e.preventDefault(); return; }
      if (k === "tab" && !mod && !e.altKey) {
        // Tab วนเลือกบล็อก เฉพาะตอนโฟกัสอยู่ที่หน้า/กระดาษ (ปุ่มในแถบเครื่องมือยัง Tab ได้ตามปกติ)
        const ae = document.activeElement;
        if (ae && ae !== document.body && !scrollRef.current?.contains(ae)) return;
        const keys = orderedKeys(schema).filter((key) => layout[key]);
        if (!keys.length) return;
        const i = active ? keys.indexOf(active) : -1;
        const n = e.shiftKey ? (i <= 0 ? keys.length - 1 : i - 1) : (i + 1) % keys.length;
        e.preventDefault();
        selectAndReveal(keys[n]);
        return;
      }
      if (!active) return;
      if (mod && k === "d") { if (findField(schema, active)) { duplicate(active); e.preventDefault(); } return; }
      if (k === "enter" && !mod) { focusSettings(); e.preventDefault(); return; }
      if (!e.altKey && !mod && k.startsWith("arrow")) {
        const box = layout[active];
        if (!box) return;
        const stepPx = e.shiftKey ? 1 : GRID;
        let { x, y } = box;
        if (k === "arrowup") y = Math.max(0, y - stepPx);
        else if (k === "arrowdown") y = y + stepPx;
        else if (k === "arrowleft") x = Math.max(0, x - stepPx);
        else if (k === "arrowright") x = Math.min(CANVAS_W - box.w, x + stepPx);
        commit({ ...layout, [active]: { ...box, x, y } });
        e.preventDefault();
      }
    }
    // คัดลอก/ตัด/วาง ผ่าน event ของเบราว์เซอร์ — ใช้คลิปบอร์ดของเครื่องได้โดยไม่ต้องขอสิทธิ์
    function onCopy(e: ClipboardEvent, cut = false) {
      if (busy(e.target) || !active || (window.getSelection()?.toString() ?? "") !== "") return;
      const loc = findField(schema, active);
      if (!loc) return;
      e.clipboardData?.setData("text/plain", serializeClip(loc.field));
      clip.current = structuredClone(loc.field);
      e.preventDefault();
      if (cut) onDeleteKey?.(active);
      else flash(t("kb.copied"));
    }
    const onCut = (e: ClipboardEvent) => onCopy(e, true);
    function onPaste(e: ClipboardEvent) {
      if (busy(e.target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const f = parseClip(text) ?? (text ? null : clip.current);
      if (!f) return;
      e.preventDefault();
      pasteField(f);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  });

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    const box = layout[d.key];
    let next: PaperBox;
    if (d.mode === "move") {
      const nx = Math.max(0, Math.min(CANVAS_W - box.w, snap(d.ox + dx)));
      const ny = Math.max(0, snap(d.oy + dy));
      next = { ...box, x: nx, y: ny };
    } else {
      const nw = Math.max(80, Math.min(CANVAS_W - box.x, snap(d.ow + dx)));
      next = { ...box, w: nw };
    }
    commit({ ...layout, [d.key]: next });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current) {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      drag.current = null;
    }
  }

  // ---- เมนูคลิกขวา: รายการตามสิ่งที่คลิก (ฟิลด์ / ขั้นตอน / หัวเอกสาร / ที่ว่าง) ----
  // run() ทำงานตอนคลิกเท่านั้น (อ่าน clip.current ใน handler) — กฎ refs ของ compiler แยกไม่ออกจึงปิดเฉพาะส่วนนี้
  /* eslint-disable react-hooks/refs */
  function menuItems(c: NonNullable<typeof ctx>): MenuItem[] {
    const key = c.target;
    const hasClip = c.clip;
    const sep: MenuItem = { sep: true };
    if (key && findField(schema, key)) {
      const bx = layout[key];
      const full = !!bx && bx.w >= CANVAS_W - PAD * 2 - GRID;
      return [
        { icon: Copy, label: t("kb.copy"), hint: "Ctrl+C", run: () => copyKey(key) },
        { icon: Scissors, label: t("kb.cut"), hint: "Ctrl+X", run: () => { if (copyKey(key)) onDeleteKey?.(key); } },
        { icon: ClipboardPaste, label: t("kb.pasteAfter"), hint: "Ctrl+V", disabled: !hasClip, run: () => clip.current && pasteField(clip.current) },
        { icon: CopyPlus, label: t("kb.duplicate"), hint: "Ctrl+D", run: () => duplicate(key) },
        sep,
        full
          ? { icon: Columns2, label: t("kb.halfWidth"), run: () => setWidth(key, false) }
          : { icon: StretchHorizontal, label: t("kb.fullWidth"), run: () => setWidth(key, true) },
        sep,
        { icon: Trash2, label: t("kb.deleteField"), hint: "Del", danger: true, run: () => onDeleteKey?.(key) },
      ];
    }
    if (key?.startsWith("img:")) {
      return [
        { icon: Trash2, label: t("brand.removeImage"), hint: "Del", danger: true, run: () => onDeleteKey?.(key) },
      ];
    }
    const si = stepIndexOfKey(schema, key);
    if (key && si >= 0) {
      return [
        { icon: Plus, label: t("kb.addFieldInStep"), run: () => addFieldAt(c.x, c.y + HEADER_H) },
        { icon: ClipboardPaste, label: t("kb.pasteInStep"), hint: "Ctrl+V", disabled: !hasClip, run: () => clip.current && pasteField(clip.current) },
        sep,
        { icon: Trash2, label: t("kb.deleteStep"), hint: "Del", danger: true, disabled: schema.steps.length <= 1, run: () => onDeleteKey?.(key) },
      ];
    }
    if (key === HEADER_KEY || key === META_KEY) {
      return [
        { icon: EyeOff, label: t("kb.hide"), hint: "Del", run: () => onDeleteKey?.(key) },
      ];
    }
    return [
      { icon: Plus, label: t("paper.ctx.addField"), run: () => addFieldAt(c.x, c.y) },
      { icon: ListPlus, label: t("paper.ctx.addStep"), run: () => addStepAt(c.y) },
      { icon: ClipboardPaste, label: t("kb.pasteHere"), hint: "Ctrl+V", disabled: !hasClip, run: () => clip.current && pasteField(clip.current, { x: c.x, y: c.y }) },
      ...(tenantId ? [{ icon: ImagePlus, label: t("brand.addImageHere"), run: () => pickImageAt({ x: c.x, y: c.y }) }] : []),
      sep,
      { icon: Undo2, label: t("kb.undo"), hint: "Ctrl+Z", disabled: !c.undo, run: () => onUndo?.() },
      { icon: Redo2, label: t("kb.redo"), hint: "Ctrl+Y", disabled: !c.redo, run: () => onRedo?.() },
      { icon: LayoutGrid, label: t("paper.autoArrange"), run: () => { onCheckpoint?.(); commit(arranged()); } },
    ];
  }
  /* eslint-enable react-hooks/refs */

  return (
    <div style={{ marginTop: 8 }}>
      {/* แถบเครื่องมือ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--ink-2)" }}>
          <Icon icon={Move} className="h-4 w-4" /> {t("paper.keyboardHint")}
        </span>
        {onAddField && (
          <button data-krok-keep="" onClick={onAddField} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px dashed var(--accent)", borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
          </button>
        )}
        {onAddStep && (
          <button data-krok-keep="" onClick={onAddStep} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
          </button>
        )}
        {tenantId && (
          <button data-krok-keep="" onClick={() => pickImageAt(null)} className="inline-flex items-center gap-1.5"
            title={t("brand.addImageHint")}
            style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
            <Icon icon={ImagePlus} className="h-4 w-4" /> {t("brand.addImage")}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {notice && <span role="status" style={{ fontSize: ".8rem", color: "var(--pass)", fontWeight: 600 }}>{notice}</span>}
        <button type="button" data-krok-keep="" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys} title={t("kb.helpTitle")}
          className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, background: showKeys ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={Keyboard} className="h-4 w-4" /> ?
        </button>
        {onPrint && (
          <button onClick={onPrint} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
            <Icon icon={Printer} className="h-4 w-4" /> {t("paper.print")}
          </button>
        )}
        <button onClick={() => { onCheckpoint?.(); commit(arranged()); }} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={LayoutGrid} className="h-4 w-4" /> {t("paper.autoArrange")}
        </button>
        <button onClick={() => { onCheckpoint?.(); const n = { ...schema }; delete n.layout; onChange(n); }} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={RotateCcw} className="h-4 w-4" /> {t("paper.reset")}
        </button>
      </div>

      {showKeys && <ShortcutHelp onClose={() => setShowKeys(false)} />}

      {/* กรอบเลื่อน + แคนวาส A4 (โฟกัสได้เพื่อใช้คีย์บอร์ด) */}
      <div ref={scrollRef} data-paper="" tabIndex={0} aria-label={t("kb.canvasLabel")} style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 16px 16px 30px", outline: "none", WebkitOverflowScrolling: "touch" }}>
        <div
          ref={canvasRef}
          onContextMenu={onContextMenu}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "relative",
            width: CANVAS_W,
            minHeight: pageH,
            margin: "0 auto",
            background: "#fff",
            color: "#111",
            boxShadow: "0 2px 16px rgba(0,0,0,.18)",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            backgroundImage: "radial-gradient(#e6e6e6 1px, transparent 1px)",
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
            touchAction: "pan-x pan-y",
          }}
        >
          {/* ชื่อเอกสาร + วันที่/เลขที่ — บล็อกลากวาง/ปรับขนาด/ซ่อนแยกกัน */}
          {([
            { key: HEADER_KEY, hidden: schema.show_header === false, hiddenLabel: t("editor.headerHidden"), content: (
              <PaperHeaderContent icon={schema.icon} title={schema.title} description={schema.description} logo={theme?.logo} color={theme?.custom ? theme.header : undefined} />
            ) },
            { key: META_KEY, hidden: schema.show_meta === false, hiddenLabel: t("editor.metaHidden"), content: (
              <PaperMetaContent />
            ) },
          ] as const).map((blk) => {
            const bx = layout[blk.key];
            const on = active === blk.key;
            return (
              <div key={blk.key} data-krok-keep="" data-block-key={blk.key}
                onClick={() => select(blk.key)}
                onPointerDown={(e) => onPointerDown(e, blk.key, "move")}
                style={{
                  ...paperHeaderBoxStyle, left: bx.x, top: bx.y, width: bx.w,
                  cursor: "grab", userSelect: "none",
                  opacity: blk.hidden ? 0.4 : 1,
                  borderColor: on ? "var(--accent)" : "transparent",
                  outline: on ? "none" : "1px dashed #d0d0d0",
                  boxShadow: on ? "0 2px 10px rgba(0,0,0,.15)" : "none",
                }}
              >
                <Grip on={on} title={t("paper.drag")} onPointerDown={(e) => onPointerDown(e, blk.key, "move", true)} />
                {blk.hidden ? <div style={{ fontSize: ".78rem", color: "#777" }}>{blk.hiddenLabel}</div> : blk.content}
                <div onPointerDown={(e) => onPointerDown(e, blk.key, "resize", true)} title={t("paper.resize")}
                  style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 16, cursor: "ew-resize", touchAction: "none" }}>
                  <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 4, height: 24, borderRadius: 2, background: on ? "var(--accent)" : "#ccc" }} />
                </div>
              </div>
            );
          })}

          {/* บล็อกลากวาง */}
          {blocks.map((b) => {
            const box = layout[b.key];
            if (!box) return null;
            const on = active === b.key;
            const isStep = b.kind === "step";
            if (b.kind === "image" && b.image) {
              return (
                <div key={b.key} data-krok-keep="" data-block-key={b.key}
                  onClick={() => select(b.key)}
                  onPointerDown={(e) => onPointerDown(e, b.key, "move")}
                  style={{
                    position: "absolute", left: box.x, top: tops[b.key] ?? box.y, width: box.w,
                    cursor: "grab", userSelect: "none",
                    outline: on ? "2px solid var(--accent)" : "1px dashed #d0d0d0",
                    boxShadow: on ? "0 2px 10px rgba(0,0,0,.15)" : "none",
                  }}
                >
                  <Grip on={on} title={t("paper.drag")} onPointerDown={(e) => onPointerDown(e, b.key, "move", true)} />
                  <PaperImageContent url={b.image.url} h={b.image.h} />
                  <div onPointerDown={(e) => onPointerDown(e, b.key, "resize", true)} title={t("paper.resize")}
                    style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 16, cursor: "ew-resize", touchAction: "none" }}>
                    <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 4, height: 24, borderRadius: 2, background: on ? "var(--accent)" : "#ccc" }} />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={b.key}
                ref={isStep ? undefined : measureRef(b.key)}
                data-krok-keep=""
                data-block-key={b.key}
                onClick={() => select(b.key)}
                onPointerDown={(e) => onPointerDown(e, b.key, "move")}
                title={!isStep && overflows(b) ? t("fw.overflowTitle") : undefined}
                style={{
                  ...(isStep ? paperStepStyle : paperBoxStyle),
                  left: box.x,
                  top: tops[b.key] ?? box.y,
                  width: box.w,
                  ...(isStep ? { overflow: "visible" } : { minHeight: blockHeight(b), background: "#fff" }),
                  cursor: "grab",
                  userSelect: "none",
                  borderColor: on ? "var(--accent)" : "transparent",
                  // ฟอร์มตั้ง "ไม่พิมพ์รูป" → ช่องรูปจางลง (ยังถ่ายได้ตอนกรอก แต่ไม่ออกในกระดาษที่พิมพ์)
                  opacity: photosHidden && b.field?.type === "photo" ? 0.45 : 1,
                  outline: on ? "none" : !isStep && overflows(b) ? "1px dashed #f59e0b" : "1px dashed #d0d0d0",
                  boxShadow: on ? "0 2px 10px rgba(0,0,0,.15)" : "none",
                }}
              >
                {/* ที่จับสำหรับลากย้าย — อยู่นอกกล่องด้านซ้าย จึงไม่กินพื้นที่ภายใน (ตรงกับหน้ากรอก) */}
                <Grip on={on} title={t("paper.drag")} onPointerDown={(e) => onPointerDown(e, b.key, "move", true)} />

                {isStep ? (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                ) : b.kind === "photos" && b.photos ? (
                  <div>
                    <PaperPhotoGrid cols={b.photos.cols} imgH={b.photos.imgH} numbered={false}
                      title={b.field?.label || t("fw.noName")} required={b.field?.required}
                      selectedFieldId={active} selectedKey={active === b.key ? capKey : null}
                      onPickField={(fid, key) => {
                        // คลิกช่องรูป = เลือกฟิลด์ + ไปที่ช่อง "ชื่อใต้รูป" ของช่องนั้นในแผงตั้งค่า
                        select(fid);
                        setCapKey(key);
                        setTimeout(() => { const el = document.getElementById(`pcap-${key}`) as HTMLInputElement | null; el?.focus(); el?.select(); }, 60);
                      }}
                      items={b.photos.cells.map((c) => ({ key: photoSlotKey(c.field.id, c.slot), fieldId: c.field.id, label: photoCaption(c.field, c.slot, c.max, (n) => tt("print.photos.slotN", { n })) }))} />
                  </div>
                ) : (
                  b.field && <div style={{ pointerEvents: "none" }}><FieldPreview f={b.field} /></div>
                )}
                {/* จับปรับความกว้าง (ลากด้วยนิ้วได้) */}
                <div
                  onPointerDown={(e) => onPointerDown(e, b.key, "resize", true)}
                  style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 16, cursor: "ew-resize", touchAction: "none" }}
                  title={t("paper.resize")}
                >
                  <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 4, height: 24, borderRadius: 2, background: on ? "var(--accent)" : "#ccc" }} />
                </div>
              </div>
            );
          })}
          {/* ข้อความท้ายเอกสาร (ธีม) — แก้ที่ หัวเอกสาร › รูปลักษณ์ */}
          <div onClick={() => select(HEADER_KEY)} style={{ cursor: "pointer" }}>
            <PaperFooterText text={footer} top={canvasH - 20} />
          </div>
        </div>
      </div>
      {chooser && (
        <BrandImageChooser tenantId={tenantId} prefix="img" uploadError={uploadErr}
          onClose={() => setChooser(null)} onPick={(url) => onImagePicked(url, chooser.at)} />
      )}

      {ctx && <ContextMenu x={ctx.cx} y={ctx.cy} items={menuItems(ctx)} onClose={() => setCtx(null)} />}

      {/* ซูม */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
        <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("paper.zoom")}</span>
        <input type="range" min={0.5} max={1.2} step={0.1} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} style={{ accentColor: "var(--accent)" }} />
        <span className="tabnum" style={{ fontSize: ".78rem", color: "var(--ink-2)", width: 40 }}>{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}

// ที่จับลาก: ยื่นออกนอกขอบซ้ายของกล่อง (กล่องจึงมีพื้นที่ภายในเท่ากับหน้ากรอกพอดี)
function Grip({ on, title, onPointerDown }: { on: boolean; title: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      style={{
        position: "absolute", left: -21, top: -1, bottom: -1, width: 20,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "grab", touchAction: "none",
        background: on ? "var(--accent)" : "#eceef0",
        color: on ? "#fff" : "#9aa0a6",
        borderRadius: "4px 0 0 4px",
      }}
    >
      <Icon icon={GripVertical} className="h-3.5 w-3.5" />
    </div>
  );
}


type MenuItem = { sep: true } | { sep?: false; icon: typeof Plus; label: string; hint?: string; run: () => void; disabled?: boolean; danger?: boolean };

// เมนูคลิกขวา — ปิดเมื่อคลิกที่อื่น / เลื่อนหน้า / Esc · ใช้ลูกศรขึ้นลงเลือกรายการได้
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { btns[(i + 1) % btns.length]?.focus(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { btns[(i - 1 + btns.length) % btns.length]?.focus(); e.preventDefault(); }
    else if (e.key === "Escape") { onClose(); e.preventDefault(); }
    e.stopPropagation();
  }
  return (
    <div ref={ref} data-krok-keep="" role="menu" onKeyDown={onKeyDown} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: x, top: y, zIndex: 90, minWidth: 230, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 4 }}>
      {items.map((it, i) => it.sep ? (
        <div key={i} role="separator" style={{ height: 1, background: "var(--line)", margin: "4px 6px" }} />
      ) : (
        <button key={i} type="button" role="menuitem" data-krok-keep="" disabled={it.disabled}
          onClick={() => { it.run(); onClose(); }}
          className="krok-ctx-item"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", borderRadius: 7, background: "transparent", color: it.danger ? "var(--fail)" : "var(--ink)", fontFamily: "inherit", fontSize: ".86rem", cursor: it.disabled ? "default" : "pointer", textAlign: "left", opacity: it.disabled ? 0.4 : 1 }}>
          <Icon icon={it.icon} className="h-4 w-4" />
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.hint && <kbd style={{ fontSize: ".7rem", color: "var(--ink-3)", fontFamily: "inherit" }}>{it.hint}</kbd>}
        </button>
      ))}
      <style>{`.krok-ctx-item:not(:disabled):hover,.krok-ctx-item:not(:disabled):focus-visible{background:var(--accent-soft)!important;outline:none}`}</style>
    </div>
  );
}

// รายการคีย์ลัด (ปุ่ม ? หรือกด ?)
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const rows: [string, string][] = [
    ["Tab / Shift+Tab", t("kb.h.tab")],
    ["← ↑ → ↓", t("kb.h.nudge")],
    ["Shift + ลูกศร", t("kb.h.nudgeFine")],
    ["Alt + ↑ / ↓", t("kb.h.order")],
    ["Enter", t("kb.h.enter")],
    ["Ctrl+C / Ctrl+X / Ctrl+V", t("kb.h.clip")],
    ["Ctrl+D", t("kb.h.dup")],
    ["Delete", t("kb.h.del")],
    ["Ctrl+Z / Ctrl+Y", t("kb.h.undo")],
    ["Esc", t("kb.h.esc")],
    ["Ctrl+P", t("kb.h.print")],
    [t("kb.h.rightClickKey"), t("kb.h.rightClick")],
  ];
  return (
    <div data-krok-keep="" style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", padding: "10px 14px", marginBottom: 10, fontSize: ".84rem" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <b style={{ flex: 1 }}>{t("kb.helpTitle")}</b>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit" }}>{t("common.close")}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, max-content) 1fr", gap: "4px 14px" }}>
        {rows.map(([k, d]) => (
          <div key={k} style={{ display: "contents" }}>
            <kbd style={{ fontFamily: "inherit", fontWeight: 600, color: "var(--ink)" }}>{k}</kbd>
            <span style={{ color: "var(--ink-2)" }}>{d}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", color: "var(--ink-3)", fontSize: ".78rem" }}>{t("kb.h.note")}</p>
    </div>
  );
}
