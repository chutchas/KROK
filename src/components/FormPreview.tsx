"use client";
import { useRef, useState } from "react";
import { stepAssigned } from "@/lib/case-flow";
import type { ResolvedTheme } from "@/lib/theme";
import { FormBrandHeader, FormFooterText, ThemeStyle, hasBrand } from "@/components/FormBrand";
import { Camera, Check, CheckCircle2, FilePlus2, Send, Users, GripVertical, Lightbulb, Lock, MapPin, PenLine, Plus, ScanLine, Search, X } from "lucide-react";
import Icon from "@/components/Icon";
import FormIcon from "@/components/FormIcon";
import { useT } from "@/i18n/LanguageProvider";
import { type FormField, type FormSchema } from "@/lib/form-schema";
import { toDisplay } from "@/lib/formula";

/** หน้าตาช่องกรอกจำลอง (ให้คนสร้างเห็นเหมือนที่คนกรอกเห็น) — แสดงอย่างเดียว */
function MockControl({ f, scan }: { f: FormField; scan: boolean }) {
  const { t, tt } = useT();
  const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", background: "var(--surface)", color: "var(--ink-3)", fontSize: ".86rem", minHeight: 38, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8 };
  const chip: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: ".84rem", color: "var(--ink-2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flex: 1 };
  const ph = f.example ? tt("fw.examplePh", { ex: f.example }) : undefined;
  switch (f.type) {
    case "text":
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ ...box, flex: 1, minHeight: f.long_text ? 64 : 38, alignItems: f.long_text ? "flex-start" : "center" }}>
            {ph || (f.text_format === "email" ? "name@example.com" : f.text_format === "phone" ? "08x-xxx-xxxx" : t("fw.answerPh"))}
          </div>
          {scan && <div style={{ ...box, background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600 }}><Icon icon={ScanLine} className="h-4 w-4" /> {t("scan.live")}</div>}
        </div>
      );
    case "number":
      return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ ...box, flex: 1 }}>{ph || t("fw.numPh")}</div>
          {f.unit && <span style={{ color: "var(--ink-2)" }}>{f.unit}</span>}
          {(f.min != null || f.max != null) && <span style={{ fontSize: ".74rem", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{tt("fw.rangeVal", { min: f.min ?? "–", max: f.max ?? "–" })}</span>}
        </div>
      );
    case "datetime":
      return <div style={box}>{f.dt_mode === "date" ? "วว/ดด/ปปปป" : f.dt_mode === "time" ? "--:--" : "วว/ดด/ปปปป --:--"}{!f.dt_no_default && <span style={{ marginLeft: "auto", fontSize: ".72rem" }}>{t("editor.dtDefaultNow")}</span>}</div>;
    case "select":
    case "checkbox": {
      const opts = f.options || [];
      if (f.options_source) return <div style={box}><Icon icon={Search} className="h-4 w-4" /> {t("fw.prev.fromDataset")}</div>;
      if (f.area) return <div style={box}><Icon icon={MapPin} className="h-4 w-4" /> {t("ftype.area")}{f.area_default ? ` · ${f.area_default}` : ""}</div>;
      if (opts.length > 8) return <div style={box}><Icon icon={Search} className="h-4 w-4" /> {tt("fw.prev.searchN", { n: opts.length })}</div>;
      return (
        <div style={{ display: "grid", gap: 2 }}>
          {opts.slice(0, 8).map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".86rem", color: "var(--ink-2)", padding: "3px 2px" }}>
              <span style={{ width: 15, height: 15, border: "1.5px solid var(--ink-3)", borderRadius: f.type === "select" ? 999 : 3, flexShrink: 0 }} /> {o || "—"}
            </div>
          ))}
        </div>
      );
    }
    case "pass_fail":
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ ...chip, color: "var(--pass)" }}><Icon icon={Check} className="h-4 w-4" /> {f.pass_label || t("fw.pass")}</div>
          <div style={{ ...chip, color: "var(--fail)" }}><Icon icon={X} className="h-4 w-4" /> {f.fail_label || t("fw.fail")}</div>
          {f.allow_na && <div style={{ ...chip, flex: "0 0 auto" }}>{t("fw.na")}</div>}
        </div>
      );
    case "photo": {
      const n = Math.max(1, f.max_photos ?? 1);
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(n, 3)}, minmax(0, 1fr))`, gap: 6 }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i}>
              <div style={{ aspectRatio: n > 1 ? "4 / 3" : undefined, minHeight: n > 1 ? undefined : 56, border: "2px dashed var(--line)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}><Icon icon={Camera} className="h-4 w-4" /></div>
              {n > 1 && <div style={{ fontSize: ".72rem", color: "var(--ink-2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.photo_labels?.[i]?.trim() || tt("print.photos.slotN", { n: i + 1 })}</div>}
            </div>
          ))}
        </div>
      );
    }
    case "signature":
      return (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ ...box, minHeight: 64, justifyContent: "center", borderStyle: "dashed" }}><Icon icon={PenLine} className="h-4 w-4" /> {t("fw.sig.here")}</div>
          {f.sign_name && <div style={box}>{t("fw.sig.namePh")}</div>}
        </div>
      );
    case "child_form":
      return <div style={{ ...box, justifyContent: "flex-start", background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600, width: "fit-content" }}><Icon icon={FilePlus2} className="h-4 w-4" /> {f.child_form?.form_title ? tt("child.open", { form: f.child_form.form_title }) : t("child.notConfigured")}</div>;
    case "table": {
      const cols = f.columns || [];
      return (
        <div style={{ overflow: "hidden", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ display: "flex", background: "var(--code-bg)", fontSize: ".72rem", fontWeight: 700, color: "var(--ink-2)" }}>
            {cols.map((c) => <div key={c.id} style={{ flex: c.width || 1, padding: "5px 6px", borderRight: "1px solid var(--line)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}{c.required ? " *" : ""}</div>)}
          </div>
          <div style={{ fontSize: ".72rem", color: "var(--ink-3)", padding: "6px 8px" }}>{tt("fw.prev.tableRows", { n: f.min_rows ?? 1 })}{f.max_rows ? ` · ${tt("fw.prev.tableMax", { n: f.max_rows })}` : ""}</div>
        </div>
      );
    }
    default:
      return null;
  }
}

function FieldCard({ f, selected, onSelect, schemaFields = [], grip, dragging = false, dropFid, scan = false }: {
  f: FormField; selected?: boolean; onSelect?: () => void; schemaFields?: FormField[]; scan?: boolean;
  /** ที่จับลากเรียงลำดับ (มุมมองมือถือในหน้าสร้างฟอร์ม) */
  grip?: React.ReactNode; dragging?: boolean; dropFid?: string;
}) {
  const { t, tt } = useT();
  return (
    <div
      data-krok-keep=""
      data-drop-fid={dropFid}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
      // เลือกด้วยคีย์บอร์ดได้: Tab มาที่การ์ด แล้ว Enter/Space (ลบ/ย้อนกลับ/Alt+↑↓ จัดการที่หน้า Studio)
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-pressed={onSelect ? !!selected : undefined}
      aria-label={onSelect ? f.label || t("fw.noName") : undefined}
      onKeyDown={onSelect ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } } : undefined}
      style={{
        position: "relative",
        opacity: dragging ? 0.4 : 1,
        border: selected ? "1.5px solid var(--accent)" : "1px solid var(--line)",
        borderRadius: 10, padding: grip ? "14px 14px 14px 30px" : 14, margin: "10px 0",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        cursor: onSelect ? "pointer" : "default",
        boxShadow: selected ? "0 2px 10px rgba(0,0,0,.08)" : "none",
      }}
    >
      {grip}
      <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
        {f.label}
        {f.required && <span style={{ color: "var(--fail)", fontWeight: 700 }}>*</span>}
        <span
          style={{
            fontFamily: "monospace",
            fontSize: ".65rem",
            color: "var(--ink-3)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            padding: "1px 6px",
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {t(f.area ? "ftype.area" : `ftype.${f.type}`)}
        </span>
      </div>
      {f.tooltip && (
        <div style={{ fontSize: ".83rem", color: "var(--ink-2)", background: "var(--code-bg)", borderRadius: 7, padding: "7px 11px", margin: "8px 0 4px", display: "flex", gap: 7, alignItems: "flex-start" }}>
          <span aria-hidden style={{ color: "var(--amber)", marginTop: 1 }}><Icon icon={Lightbulb} className="h-4 w-4" /></span>
          <span>{f.tooltip}</span>
        </div>
      )}
      <div style={{ marginTop: 8 }}><MockControl f={f} scan={scan} /></div>
      {f.type === "formula" && f.formula && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          ƒ <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{toDisplay(f.formula, { fields: schemaFields })}</code>
        </div>
      )}
      {f.type === "formula" && (f.min != null || f.max != null) && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.rangeLabel")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{tt("fw.rangeVal", { min: f.min ?? "–", max: f.max ?? "–" })} {f.unit || ""}</code>
        </div>
      )}
      {f.options_source && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.prev.options")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{t("fw.prev.fromDataset")} · {f.options_source.label_column ? tt("fw.prev.stores", { label: f.options_source.label_column, col: f.options_source.column }) : f.options_source.column}{f.options_source.parent ? t("fw.prev.filtered") : ""}</code>
        </div>
      )}
      {f.photo_hint && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.photoMustShow")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.photo_hint}</code>
        </div>
      )}
    </div>
  );
}

export default function FormPreview({
  schema,
  selectedKey,
  onSelect,
  onAddField,
  onAddStep,
  onMoveField,
  theme,
  paged = false,
  stepLabel,
}: {
  schema: FormSchema;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onAddField?: (stepIndex: number) => void;
  onAddStep?: () => void;
  /** ลากเรียงฟิลด์: ย้าย fieldId ไปขั้นตอน toStep ก่อนตำแหน่ง toIndex (นับในรายการเดิมของขั้นตอนนั้น) */
  onMoveField?: (fieldId: string, toStep: number, toIndex: number) => void;
  /** ธีมของฟอร์ม — แสดงแถบหัว/โลโก้/สีปุ่มเหมือนหน้ากรอกจริง */
  theme?: ResolvedTheme;
  /** ทีละขั้น: แสดงเหมือนหน้ากรอกจริง (แถบความคืบหน้า · ปุ่มถัดไป / ส่งต่อให้ … / ส่งข้อมูล) */
  paged?: boolean;
  /** ชื่อผู้รับผิดชอบขั้น i (ทีม/คน) — ใช้บนปุ่มส่งต่อ */
  stepLabel?: (i: number) => string | null;
}) {
  const { t, tt } = useT();
  // ---- ลากเรียงลำดับฟิลด์ (เมาส์/นิ้ว ผ่านที่จับด้านซ้ายของการ์ด) ----
  type Drag = { fid: string; step: number; index: number } | null;
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const setDrag = (d: Drag) => { dragRef.current = d; setDragState(d); };
  const dropAt = (x: number, y: number, fid: string) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const card = el?.closest<HTMLElement>("[data-drop-fid]");
    if (card) {
      const [si, fi] = (card.dataset.dropFid || "").split(":").map(Number);
      const r = card.getBoundingClientRect();
      return { fid, step: si, index: fi + (y > r.top + r.height / 2 ? 1 : 0) };
    }
    const st = el?.closest<HTMLElement>("[data-drop-step]");
    if (st) {
      const [si, where] = (st.dataset.dropStep || "").split(":");
      return { fid, step: Number(si), index: where === "end" ? schema.steps[Number(si)]?.fields.length ?? 0 : 0 };
    }
    return dragRef.current;
  };
  const gripFor = (fid: string) => onMoveField ? (
    <span
      data-krok-keep=""
      title={t("editor.dragReorder")}
      aria-label={t("editor.dragReorder")}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.preventDefault(); e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(dropAt(e.clientX, e.clientY, fid));
      }}
      onPointerMove={(e) => { if (dragRef.current) setDrag(dropAt(e.clientX, e.clientY, fid)); }}
      onPointerUp={() => {
        const d = dragRef.current;
        setDrag(null);
        if (d) onMoveField(d.fid, d.step, d.index);
      }}
      onPointerCancel={() => setDrag(null)}
      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", cursor: drag ? "grabbing" : "grab", touchAction: "none", borderRadius: "10px 0 0 10px", background: "var(--code-bg)" }}
    >
      <Icon icon={GripVertical} className="h-4 w-4" />
    </span>
  ) : undefined;
  const dropLine = <div aria-hidden style={{ height: 3, borderRadius: 2, background: "var(--accent)", margin: "-6px 0 -3px" }} />;
  const editable = !!onSelect;
  const allFields = schema.steps.flatMap((st) => st.fields);
  const addBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
    padding: "9px 12px", margin: "6px 0 2px", borderRadius: 9, border: "1px dashed var(--accent)",
    background: "var(--accent-soft)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit",
    fontSize: ".84rem", fontWeight: 600,
  };
  const branded = !!theme && hasBrand(theme);

  // ---- ทีละขั้น ----
  const nSteps = schema.steps.length;
  const [cur, setCur] = useState(0);
  const curIdx = Math.min(cur, Math.max(0, nSteps - 1));
  // เลือกฟิลด์/ขั้นที่อยู่ขั้นอื่น (จาก sidebar หรือสลับโหมด) → เปิดขั้นนั้น (ปรับ state ระหว่าง render ตามแนวทาง React)
  const selSig = `${paged ? 1 : 0}|${selectedKey ?? ""}`;
  const [seenSig, setSeenSig] = useState(selSig);
  if (seenSig !== selSig) {
    setSeenSig(selSig);
    const i = paged && selectedKey ? schema.steps.findIndex((st) => `s:${st.id}` === selectedKey || st.fields.some((f) => f.id === selectedKey)) : -1;
    if (i >= 0) setCur(i);
  }
  const go = (i: number) => setCur(Math.max(0, Math.min(nSteps - 1, i)));
  const isLast = curIdx >= nSteps - 1;
  const handoff = !isLast && stepAssigned(schema, curIdx + 1);
  const handoffWho = handoff ? stepLabel?.(curIdx + 1) ?? null : null;
  const curWho = paged && stepAssigned(schema, curIdx) ? stepLabel?.(curIdx) ?? null : null;
  return (
    <div className="krok-th-preview">
      {theme && <ThemeStyle scope="krok-th-preview" theme={theme} />}
      {branded && <FormBrandHeader theme={theme} icon={schema.icon} title={schema.title} description={schema.description} flushX={0} flushTop={0} />}
      {/* หัวฟอร์ม: ชื่อ + คำอธิบาย (เหมือนมุมมองกระดาษ) — แก้ได้ที่การ์ดด้านบน */}
      {!branded && (schema.title || schema.description) && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 2px 12px", borderBottom: "1px solid var(--line)" }}>
          <FormIcon value={schema.icon} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "1.08rem", fontWeight: 700, lineHeight: 1.35, color: "var(--ink)", overflowWrap: "anywhere" }}>{schema.title}</div>
            {schema.description && (
              <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginTop: 2, lineHeight: 1.45, overflowWrap: "anywhere" }}>{schema.description}</div>
            )}
          </div>
        </div>
      )}
      {paged && nSteps > 0 && (
        <div style={{ display: "flex", gap: 6, margin: "12px 0 4px" }} aria-hidden>
          {schema.steps.map((s, i) => (
            <span key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: i === curIdx ? "var(--accent)" : i < curIdx ? "var(--pass)" : "var(--line)" }} />
          ))}
        </div>
      )}
      {schema.steps.map((s, i) => {
        if (paged && i !== curIdx) return null;
        const stepKey = `s:${s.id}`;
        const stepSel = selectedKey === stepKey;
        return (
          <div key={s.id}>
            <div
              data-krok-keep=""
              data-drop-step={`${i}:start`}
              onClick={editable ? (e) => { e.stopPropagation(); onSelect!(stepKey); } : undefined}
              tabIndex={editable ? 0 : undefined}
              role={editable ? "button" : undefined}
              aria-pressed={editable ? stepSel : undefined}
              onKeyDown={editable ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect!(stepKey); } } : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px", padding: editable ? "4px 6px" : 0, borderRadius: 8, cursor: editable ? "pointer" : "default", background: stepSel ? "var(--accent-soft)" : "transparent" }}
            >
              <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
                {tt("fw.stepOf", { n: i + 1, total: schema.steps.length })}
              </span>
              <h3 style={{ fontSize: "1.05rem", color: stepSel ? "var(--accent-text)" : "var(--ink)" }}>{s.title}</h3>
            </div>
            {curWho && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".76rem", color: "var(--ink-2)", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 9px", margin: "-2px 0 8px" }}>
                <Icon icon={Users} className="h-3.5 w-3.5" /> {curWho}
              </div>
            )}
            {s.fields.map((f, fi) => (
              <div key={f.id}>
                {drag && drag.step === i && drag.index === fi && dropLine}
                <FieldCard f={f} schemaFields={allFields} selected={selectedKey === f.id} onSelect={editable ? () => onSelect!(f.id) : undefined}
                  scan={(s.fill_sources ?? []).some((src) => src.kind === "scan" && src.map.length === 1 && src.map[0].field_id === f.id)}
                  grip={gripFor(f.id)} dragging={drag?.fid === f.id} dropFid={onMoveField ? `${i}:${fi}` : undefined} />
              </div>
            ))}
            {drag && drag.step === i && drag.index >= s.fields.length && dropLine}
            {editable && onAddField && (
              <button data-krok-keep="" data-drop-step={`${i}:end`} onClick={(e) => { e.stopPropagation(); onAddField(i); }} style={addBtn}>
                <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
              </button>
            )}
          </div>
        );
      })}
      {paged && nSteps > 0 && (
        <div data-krok-keep="" style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {curIdx > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); go(curIdx - 1); }}
              style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer" }}>
              {t("fill.prev")}
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); if (!isLast) go(curIdx + 1); }}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 14px", borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 600, fontSize: ".92rem", cursor: isLast ? "default" : "pointer" }}>
            {isLast ? <><Icon icon={CheckCircle2} className="h-4 w-4" /> {t("fill.submit")}</>
              : handoff ? <><Icon icon={Send} className="h-4 w-4" /> {handoffWho ? tt("wf.handoffTo", { team: handoffWho }) : t("wf.handoff")}</>
              : t("fill.next")}
          </button>
        </div>
      )}
      {editable && onAddStep && (
        <button data-krok-keep="" onClick={(e) => { e.stopPropagation(); onAddStep(); }} style={{ ...addBtn, marginTop: 14, borderStyle: "solid" }}>
          <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
        </button>
      )}
      {!editable && (
        <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("fw.prev.lockHint")}
        </div>
      )}
      {theme && <FormFooterText text={theme.footer} />}
    </div>
  );
}
