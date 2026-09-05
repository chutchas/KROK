"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { FIELD_TYPE_LABELS, type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";
import { useT } from "@/i18n/LanguageProvider";
import Icon from "@/components/Icon";
import { LayoutGrid, RotateCcw, Move, GripVertical } from "lucide-react";

// ============================================================
// FormPaperEditor — มุมมองกระดาษแบบ "ลากวาง" ปรับตำแหน่ง element ได้
// เขียนผลลง schema.layout (px บนแคนวาส A4 กว้าง 794)
// ============================================================

const CANVAS_W = 794; // A4 @ 96dpi
const GRID = 8;
const HEADER_H = 34;
const FIELD_H = 62;
const GAP_Y = 10;
const START_Y = 96; // ใต้หัวกระดาษ

type BlockKind = "step" | "field";
interface Block {
  key: string;
  kind: BlockKind;
  label: string;
  sub?: string;
  field?: FormField;
  stepIndex: number;
}

function snap(n: number) {
  return Math.round(n / GRID) * GRID;
}

// วางอัตโนมัติแบบเรียงบนลงล่าง (หัวข้อเต็มแถว, ฟิลด์ 2 คอลัมน์)
function autoLayout(blocks: Block[]): Record<string, PaperBox> {
  const out: Record<string, PaperBox> = {};
  const pad = 40;
  const usable = CANVAS_W - pad * 2;
  const colW = Math.floor((usable - 16) / 2);
  let y = START_Y;
  let col = 0;
  for (const b of blocks) {
    if (b.kind === "step") {
      if (col === 1) y += FIELD_H + GAP_Y;
      col = 0;
      out[b.key] = { x: pad, y, w: usable };
      y += HEADER_H + GAP_Y;
    } else {
      const x = pad + (col === 0 ? 0 : colW + 16);
      out[b.key] = { x, y, w: colW };
      if (col === 1) {
        y += FIELD_H + GAP_Y;
        col = 0;
      } else {
        col = 1;
      }
    }
  }
  return out;
}

function buildBlocks(schema: FormSchema): Block[] {
  const blocks: Block[] = [];
  schema.steps.forEach((s, si) => {
    blocks.push({ key: `s:${s.id}`, kind: "step", label: `${si + 1}. ${s.title}`, stepIndex: si });
    s.fields.forEach((f) => {
      blocks.push({
        key: f.id,
        kind: "field",
        label: f.label,
        sub: FIELD_TYPE_LABELS[f.type] + (f.unit ? ` (${f.unit})` : ""),
        field: f,
        stepIndex: si,
      });
    });
  });
  return blocks;
}

function BlankPreview({ f }: { f: FormField }) {
  if (f.type === "pass_fail") return <div style={{ fontSize: ".72rem", color: "#555" }}>☐ ผ่าน ☐ ไม่ผ่าน</div>;
  if (f.type === "signature") return <div style={{ borderBottom: "1px solid #333", height: 20, marginTop: 4 }} />;
  if (f.type === "photo") return <div style={{ border: "1px dashed #999", height: 22, borderRadius: 3, marginTop: 4 }} />;
  if ((f.type === "select" || f.type === "checkbox") && f.options?.length)
    return <div style={{ fontSize: ".68rem", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.options.map((o) => `☐ ${o}`).join("  ")}</div>;
  return <div style={{ borderBottom: "1px dotted #999", height: 14, marginTop: 6 }} />;
}

export default function FormPaperEditor({ schema, onChange }: { schema: FormSchema; onChange: (s: FormSchema) => void }) {
  const { t } = useT();
  const blocks = useMemo(() => buildBlocks(schema), [schema]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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

  const canvasH = useMemo(() => {
    let max = 900;
    for (const b of blocks) {
      const box = layout[b.key];
      if (box) max = Math.max(max, box.y + (b.kind === "step" ? HEADER_H : FIELD_H) + 60);
    }
    return max;
  }, [blocks, layout]);

  const drag = useRef<{ key: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const commit = useCallback(
    (next: Record<string, PaperBox>) => {
      onChange({ ...schema, layout: next });
    },
    [onChange, schema]
  );

  function onPointerDown(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const box = layout[key];
    drag.current = { key, mode, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, ow: box.w };
    setActive(key);
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
          <Icon icon={Move} className="h-4 w-4" /> {t("paper.dragHint")}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => commit(autoLayout(blocks))} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={LayoutGrid} className="h-4 w-4" /> {t("paper.autoArrange")}
        </button>
        <button onClick={() => { const n = { ...schema }; delete n.layout; onChange(n); }} className="inline-flex items-center gap-1.5"
          style={{ padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
          <Icon icon={RotateCcw} className="h-4 w-4" /> {t("paper.reset")}
        </button>
      </div>

      {/* กรอบเลื่อน + แคนวาส A4 */}
      <div style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, display: "flex", justifyContent: "center" }}>
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "relative",
            width: CANVAS_W,
            minHeight: canvasH,
            background: "#fff",
            color: "#111",
            boxShadow: "0 2px 16px rgba(0,0,0,.18)",
            flex: "0 0 auto",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            backgroundImage: "radial-gradient(#e6e6e6 1px, transparent 1px)",
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
            touchAction: "none",
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
