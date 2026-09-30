"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FormField, type FormSchema } from "@/lib/form-schema";
import { CANVAS_W, DEFAULT_HEADER_BOX, DEFAULT_META_BOX, buildBlocks, resolveLayout, blockHeight } from "@/lib/paper-layout";
import { usePaperReflow } from "@/components/paper/usePaperReflow";
import { PaperHeaderContent, PaperMetaContent, paperBoxStyle, paperHeaderBoxStyle, paperStepStyle } from "@/components/paper/PaperParts";
import { useT } from "@/i18n/LanguageProvider";

// ============================================================
// FormPaperFill — กรอกฟอร์มบน "กระดาษ A4 จริง"
// วางฟิลด์ตามตำแหน่งที่ออกแบบไว้ (schema.layout เหมือนหน้าแก้ไข/พิมพ์)
// ย่อให้พอดีจอโดยอัตโนมัติ + ซูม/เลื่อนปัดดูได้
// ============================================================

export default function FormPaperFill({
  schema,
  icon,
  title,
  userName,
  renderField,
}: {
  schema: FormSchema;
  icon: string;
  title: string;
  userName?: string;
  renderField: (f: FormField) => React.ReactNode;
}) {
  const { t } = useT();
  const blocks = useMemo(() => buildBlocks(schema), [schema]);
  const layout = useMemo(() => resolveLayout(schema, blocks), [schema, blocks]);
  // ความสูงจริงของแต่ละบล็อก → ดันบล็อกด้านล่างลงเมื่อเนื้อหางอกเกินกล่องที่ออกแบบ (ไม่ให้ทับกัน)
  const { measureRef, tops, height: canvasH } = usePaperReflow(blocks, layout);
  const headerBox = schema.layout?.header ?? DEFAULT_HEADER_BOX;
  const metaBox = schema.layout?.meta ?? DEFAULT_META_BOX;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [fitScale, setFitScale] = useState(0.5);
  const today = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

  // ปรับให้พอดีความกว้างจอครั้งแรก + เมื่อ resize (ถ้าผู้ใช้ยังไม่ได้ซูมเอง)
  const userZoomed = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 24;
      const s = Math.min(1, Math.max(0.35, +(w / CANVAS_W).toFixed(3)));
      setFitScale(s);
      if (!userZoomed.current) setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div
        ref={wrapRef}
        style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, WebkitOverflowScrolling: "touch" }}
      >
        {/* กล่องขนาดจริงหลังย่อ เพื่อให้ scroll พอดี (ไม่มี scroll แนวนอนตอน fit) */}
        <div style={{ width: CANVAS_W * scale, height: canvasH * scale, margin: "0 auto", position: "relative" }}>
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: CANVAS_W, minHeight: canvasH,
              transform: `scale(${scale})`, transformOrigin: "top left",
              background: "#fff", color: "#111", boxShadow: "0 2px 16px rgba(0,0,0,.15)",
            }}
          >
            {/* ชื่อเอกสาร (ซ่อน/ย้ายได้) */}
            {schema.show_header !== false && (
              <div style={{ ...paperHeaderBoxStyle, top: headerBox.y, left: headerBox.x, width: headerBox.w }}>
                <PaperHeaderContent icon={icon} title={title} description={schema.description} />
              </div>
            )}
            {/* วันที่/ผู้กรอก (ซ่อน/ย้ายได้) */}
            {schema.show_meta !== false && (
              <div style={{ ...paperHeaderBoxStyle, top: metaBox.y, left: metaBox.x, width: metaBox.w }}>
                <PaperMetaContent filler={userName} date={today} />
              </div>
            )}

            {/* บล็อกตามตำแหน่งที่ออกแบบ */}
            {blocks.map((b) => {
              const box = layout[b.key];
              if (!box) return null;
              const top = tops[b.key] ?? box.y;
              if (b.kind === "step") {
                return (
                  <div key={b.key} style={{ ...paperStepStyle, left: box.x, top, width: box.w }}>
                    {b.label}
                  </div>
                );
              }
              const f = b.field!;
              return (
                <div key={b.key} ref={measureRef(b.key)} style={{ ...paperBoxStyle, left: box.x, top, width: box.w, minHeight: blockHeight(b) }}>
                  {renderField(f)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* แถบซูม */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <button
          onClick={() => { userZoomed.current = false; setScale(fitScale); }}
          style={{ padding: "5px 10px", border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".76rem" }}
        >
          {t("paper.fit")}
        </button>
        <span style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{t("paper.zoom")}</span>
        <input type="range" min={0.35} max={1.4} step={0.05} value={scale}
          onChange={(e) => { userZoomed.current = true; setScale(parseFloat(e.target.value)); }}
          style={{ accentColor: "var(--accent)" }} />
        <span className="tabnum" style={{ fontSize: ".76rem", color: "var(--ink-2)", width: 42 }}>{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
