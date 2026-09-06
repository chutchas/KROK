"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FormField, type FormSchema } from "@/lib/form-schema";
import { CANVAS_W, buildBlocks, resolveLayout, canvasHeight } from "@/lib/paper-layout";
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
  const canvasH = useMemo(() => canvasHeight(blocks, layout), [blocks, layout]);
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
            {/* หัวกระดาษ */}
            <div style={{ position: "absolute", top: 32, left: 40, right: 40, borderBottom: "2px solid #111", paddingBottom: 8, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{icon} {title}</div>
                {schema.description && <div style={{ fontSize: ".72rem", color: "#555", marginTop: 2 }}>{schema.description}</div>}
              </div>
              <div style={{ fontSize: ".72rem", color: "#555", textAlign: "right", whiteSpace: "nowrap" }}>
                ผู้กรอก: {userName || "__________"}<br />วันที่: {today}
              </div>
            </div>

            {/* บล็อกตามตำแหน่งที่ออกแบบ */}
            {blocks.map((b) => {
              const box = layout[b.key];
              if (!box) return null;
              if (b.kind === "step") {
                return (
                  <div key={b.key} style={{ position: "absolute", left: box.x, top: box.y, width: box.w, fontWeight: 700, background: "#eef0f2", padding: "6px 10px", borderRadius: 3, fontSize: ".92rem" }}>
                    {b.label}
                  </div>
                );
              }
              const f = b.field!;
              return (
                <div key={b.key} style={{ position: "absolute", left: box.x, top: box.y, width: box.w }}>
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
