"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";
import { CANVAS_W, GRID, START_Y, HEADER_KEY, META_KEY, DEFAULT_HEADER_BOX, DEFAULT_META_BOX, buildBlocks, autoLayout, snap, fieldBoxHeight } from "@/lib/paper-layout";
import { usePaperReflow } from "@/components/paper/usePaperReflow";
import { PaperChoices, PaperHeaderContent, PaperLabel, PaperMetaContent, PaperPassFail, PaperPhoto, PaperSignature, PaperTable, paperBoxStyle, paperHeaderBoxStyle, paperInputStyle, paperStepStyle } from "@/components/paper/PaperParts";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import { LayoutGrid, RotateCcw, Move, GripVertical, Printer, Plus } from "lucide-react";

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
  const badge = <span style={{ fontSize: ".62rem", color: "#999", fontWeight: 400 }}>{t(`ftype.${f.type}`)}{f.unit ? ` (${f.unit})` : ""}</span>;
  const label = <PaperLabel label={f.label || t("fw.noName")} required={f.required} right={badge} />;
  const inputLike = (text = "") => <div style={{ ...paperInputStyle, display: "flex", alignItems: "center", color: "#aaa" }}>{text}</div>;
  if (f.type === "table") {
    const rows = Array.from({ length: Math.min(Math.max(f.min_rows ?? 1, 1), 6) }, () => ({}));
    return <>{label}<PaperTable columns={f.columns || []} rows={rows} disabled /></>;
  }
  let body: React.ReactNode;
  if (f.type === "pass_fail") body = <PaperPassFail disabled />;
  else if (f.type === "photo") body = <PaperPhoto disabled />;
  else if (f.type === "signature") body = <PaperSignature disabled />;
  else if ((f.type === "select" || f.type === "checkbox") && f.options_source) body = inputLike(t("fw.dsOptionsPh"));
  else if (f.type === "select" || f.type === "checkbox") body = <PaperChoices name={`p_${f.id}`} options={f.options || []} multiple={f.type === "checkbox"} value={f.type === "checkbox" ? [] : ""} disabled />;
  else if (f.type === "datetime") body = inputLike(t("fw.datePh"));
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
}: {
  schema: FormSchema;
  onChange: (s: FormSchema) => void;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onPrint?: () => void;
  onAddField?: () => void;
  onAddStep?: () => void;
}) {
  const { t } = useT();
  const blocks = useMemo(() => buildBlocks(schema), [schema]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clip = useRef<FormField | null>(null);
  const [scale, setScale] = useState(1);
  const [internalActive, setInternalActive] = useState<string | null>(null);
  const active = selectedKey !== undefined ? selectedKey : internalActive;
  const select = useCallback((k: string | null) => { if (onSelect) onSelect(k); else setInternalActive(k); }, [onSelect]);

  // layout ปัจจุบัน: ใช้จาก schema ถ้ามี, ไม่มีก็ auto
  const layout: Record<string, PaperBox> = useMemo(() => {
    const auto = autoLayout(blocks);
    const merged = { ...auto };
    if (schema.layout) {
      for (const b of blocks) {
        if (schema.layout[b.key]) merged[b.key] = schema.layout[b.key];
      }
    }
    // ชื่อเอกสาร + วันที่/เลขที่ เป็นบล็อกลากวางแยกกัน
    merged[HEADER_KEY] = schema.layout?.[HEADER_KEY] || DEFAULT_HEADER_BOX;
    merged[META_KEY] = schema.layout?.[META_KEY] || DEFAULT_META_BOX;
    return merged;
  }, [blocks, schema.layout]);

  // กติกาเดียวกับหน้ากรอก: เนื้อหาเกินกล่อง → ดันบล็อกด้านล่างลง (แสดงผลเท่านั้น ไม่แก้ตำแหน่งที่ออกแบบ)
  const { measureRef, tops, height: canvasH, overflows } = usePaperReflow(blocks, layout);

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

  function findField(key: string | null): { si: number; fi: number; field: FormField } | null {
    if (!key) return null;
    for (let si = 0; si < schema.steps.length; si++) {
      const fi = schema.steps[si].fields.findIndex((f) => f.id === key);
      if (fi >= 0) return { si, fi, field: schema.steps[si].fields[fi] };
    }
    return null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!active) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === "c") { const loc = findField(active); if (loc) clip.current = JSON.parse(JSON.stringify(loc.field)); e.preventDefault(); return; }
    if (ctrl && k === "x") {
      const loc = findField(active);
      if (loc) {
        clip.current = JSON.parse(JSON.stringify(loc.field));
        const steps = schema.steps.map((s, i) => (i === loc.si ? { ...s, fields: s.fields.filter((_, j) => j !== loc.fi) } : s));
        const nl = { ...layout }; delete nl[loc.field.id];
        onChange({ ...schema, steps, layout: nl });
        select(null);
      }
      e.preventDefault(); return;
    }
    if (ctrl && k === "v") {
      if (clip.current) {
        let si = schema.steps.length - 1;
        const loc = findField(active);
        if (loc) si = loc.si;
        else if (active.startsWith("s:")) { const idx = schema.steps.findIndex((s) => s.id === active.slice(2)); if (idx >= 0) si = idx; }
        const nf: FormField = { ...clip.current, id: newFieldId() };
        const steps = schema.steps.map((s, i) => (i === si ? { ...s, fields: [...s.fields, nf] } : s));
        const base = layout[active];
        const box: PaperBox = base ? { x: Math.min(CANVAS_W - base.w, base.x + GRID * 2), y: base.y + GRID * 2, w: base.w } : { x: 40, y: START_Y, w: 300 };
        onChange({ ...schema, steps, layout: { ...layout, [nf.id]: box } });
        select(nf.id);
      }
      e.preventDefault(); return;
    }
    if (ctrl && k === "p") { onPrint?.(); e.preventDefault(); return; }
    if (k.startsWith("arrow")) {
      const box = layout[active]; if (!box) return;
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

  return (
    <div style={{ marginTop: 8 }}>
      {/* แถบเครื่องมือ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--ink-2)" }}>
          <Icon icon={Move} className="h-4 w-4" /> {t("paper.keyboardHint")}
        </span>
        {onAddField && (
          <button data-krok-keep="" onClick={onAddField} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px dashed var(--accent)", borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
          </button>
        )}
        {onAddStep && (
          <button data-krok-keep="" onClick={onAddStep} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {onPrint && (
          <button onClick={onPrint} className="inline-flex items-center gap-1.5"
            style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
            <Icon icon={Printer} className="h-4 w-4" /> {t("paper.print")}
          </button>
        )}
        <button onClick={() => commit(autoLayout(blocks))} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={LayoutGrid} className="h-4 w-4" /> {t("paper.autoArrange")}
        </button>
        <button onClick={() => { const n = { ...schema }; delete n.layout; onChange(n); }} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={RotateCcw} className="h-4 w-4" /> {t("paper.reset")}
        </button>
      </div>

      {/* กรอบเลื่อน + แคนวาส A4 (โฟกัสได้เพื่อใช้คีย์บอร์ด) */}
      <div ref={scrollRef} data-paper="" tabIndex={0} onKeyDown={onKeyDown} style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 16px 16px 30px", outline: "none", WebkitOverflowScrolling: "touch" }}>
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "relative",
            width: CANVAS_W,
            minHeight: canvasH,
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
              <PaperHeaderContent icon={schema.icon} title={schema.title} description={schema.description} />
            ) },
            { key: META_KEY, hidden: schema.show_meta === false, hiddenLabel: t("editor.metaHidden"), content: (
              <PaperMetaContent />
            ) },
          ] as const).map((blk) => {
            const bx = layout[blk.key];
            const on = active === blk.key;
            return (
              <div key={blk.key} data-krok-keep=""
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
            return (
              <div
                key={b.key}
                ref={isStep ? undefined : measureRef(b.key)}
                data-krok-keep=""
                onClick={() => select(b.key)}
                onPointerDown={(e) => onPointerDown(e, b.key, "move")}
                title={!isStep && overflows(b) ? t("fw.overflowTitle") : undefined}
                style={{
                  ...(isStep ? paperStepStyle : paperBoxStyle),
                  left: box.x,
                  top: tops[b.key] ?? box.y,
                  width: box.w,
                  ...(isStep ? { overflow: "visible" } : { minHeight: fieldBoxHeight(b.field), background: "#fff" }),
                  cursor: "grab",
                  userSelect: "none",
                  borderColor: on ? "var(--accent)" : "transparent",
                  outline: on ? "none" : !isStep && overflows(b) ? "1px dashed #f59e0b" : "1px dashed #d0d0d0",
                  boxShadow: on ? "0 2px 10px rgba(0,0,0,.15)" : "none",
                }}
              >
                {/* ที่จับสำหรับลากย้าย — อยู่นอกกล่องด้านซ้าย จึงไม่กินพื้นที่ภายใน (ตรงกับหน้ากรอก) */}
                <Grip on={on} title={t("paper.drag")} onPointerDown={(e) => onPointerDown(e, b.key, "move", true)} />

                {isStep ? (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
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
        </div>
      </div>

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

