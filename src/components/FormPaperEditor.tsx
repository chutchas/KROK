"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";
import { CANVAS_W, GRID, HEADER_H, FIELD_H, START_Y, buildBlocks, autoLayout, snap, canvasHeight } from "@/lib/paper-layout";
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

function BlankPreview({ f }: { f: FormField }) {
  if (f.type === "pass_fail") return <div style={{ fontSize: ".72rem", color: "#555" }}>☐ ผ่าน ☐ ไม่ผ่าน</div>;
  if (f.type === "signature") return <div style={{ borderBottom: "1px solid #333", height: 20, marginTop: 4 }} />;
  if (f.type === "photo") return <div style={{ border: "1px dashed #999", height: 22, borderRadius: 3, marginTop: 4 }} />;
  if ((f.type === "select" || f.type === "checkbox") && f.options?.length)
    return <div style={{ fontSize: ".68rem", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.options.map((o) => `☐ ${o}`).join("  ")}</div>;
  return <div style={{ borderBottom: "1px dotted #999", height: 14, marginTop: 6 }} />;
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
    return merged;
  }, [blocks, schema.layout]);

  const canvasH = useMemo(() => canvasHeight(blocks, layout), [blocks, layout]);

  const drag = useRef<{ key: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null);

  const commit = useCallback(
    (next: Record<string, PaperBox>) => {
      onChange({ ...schema, layout: next });
    },
    [onChange, schema]
  );

  function onPointerDown(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    // ทัช/ปากกา: ปล่อยให้เบราว์เซอร์เลื่อน/แพนกระดาษได้ตามปกติ ไม่ลากปรับตำแหน่ง
    // (เลือกฟิลด์ผ่าน onClick เมื่อแตะแทน) — ลากปรับตำแหน่งเฉพาะเมาส์
    if (e.pointerType !== "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const box = layout[key];
    drag.current = { key, mode, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, ow: box.w };
    select(key);
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
      <div ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown} style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, outline: "none", WebkitOverflowScrolling: "touch" }}>
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
          {/* หัวกระดาษ (คงที่) */}
          <div style={{ position: "absolute", top: 32, left: 40, right: 40, borderBottom: "2px solid #111", paddingBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{schema.icon} {schema.title}</div>
            <div style={{ fontSize: ".72rem", color: "#555", textAlign: "right" }}>วันที่: __________<br />เลขที่: __________</div>
          </div>

          {/* บล็อกลากวาง */}
          {blocks.map((b) => {
            const box = layout[b.key];
            if (!box) return null;
            const on = active === b.key;
            const isStep = b.kind === "step";
            return (
              <div
                key={b.key}
                data-krok-keep=""
                onClick={() => select(b.key)}
                onPointerDown={(e) => onPointerDown(e, b.key, "move")}
                style={{
                  position: "absolute",
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  minHeight: isStep ? HEADER_H : FIELD_H,
                  boxSizing: "border-box",
                  cursor: "grab",
                  userSelect: "none",
                  border: on ? "1.5px solid var(--accent)" : "1px solid transparent",
                  outline: on ? "none" : "1px dashed #d0d0d0",
                  borderRadius: 4,
                  background: isStep ? "#f0f0f0" : "#fff",
                  padding: isStep ? "7px 10px" : "6px 10px",
                  boxShadow: on ? "0 2px 10px rgba(0,0,0,.15)" : "none",
                }}
              >
                {isStep ? (
                  <div style={{ fontWeight: 700, fontSize: ".92rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#999", display: "inline-flex" }}><Icon icon={GripVertical} className="h-4 w-4" /></span> {b.label}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: ".8rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {b.label}{b.field?.required && <span style={{ color: "#c00" }}> *</span>}
                    </div>
                    <div style={{ fontSize: ".64rem", color: "#999" }}>{b.sub}</div>
                    {b.field && <BlankPreview f={b.field} />}
                  </>
                )}
                {/* จับปรับความกว้าง */}
                <div
                  onPointerDown={(e) => onPointerDown(e, b.key, "resize")}
                  style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 10, cursor: "ew-resize" }}
                  title={t("paper.resize")}
                >
                  <div style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", width: 3, height: 22, borderRadius: 2, background: on ? "var(--accent)" : "#ccc" }} />
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
