"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { photoFieldsOf, printPhotosOf, type FormField, type FormSchema } from "@/lib/form-schema";
import { CANVAS_W, DEFAULT_HEADER_BOX, DEFAULT_META_BOX, buildBlocks, resolveLayout, blockHeight, mmToPx } from "@/lib/paper-layout";
import PaperPhotoGrid, { PhotoAppendix, photoCaption } from "@/components/paper/PaperPhotoGrid";
import { allPhotoSlotKeys, photoSlotKey, photoSlotLabel } from "@/lib/photo-slots";
import { usePaperReflow } from "@/components/paper/usePaperReflow";
import { PaperFooterText, PaperHeaderContent, PaperImageContent, PaperMetaContent, paperBoxStyle, paperHeaderBoxStyle, paperStepStyle } from "@/components/paper/PaperParts";
import { useT } from "@/i18n/LanguageProvider";
import type { ResolvedTheme } from "@/lib/theme";

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
  renderPhotoCell,
  photoUrl,
  theme,
}: {
  schema: FormSchema;
  icon: string;
  title: string;
  userName?: string;
  renderField: (f: FormField) => React.ReactNode;
  /** กล่องภาพประกอบ (print_photos = grid): เนื้อหาช่องรูปที่กดถ่ายได้ (slot = ช่องที่เท่าไรของฟิลด์) */
  renderPhotoCell?: (f: FormField, slot: number) => React.ReactNode;
  /** รูปที่ถ่ายแล้วของฟิลด์ (ใช้ในหน้าภาพประกอบท้ายเอกสาร) */
  photoUrl?: (fieldId: string) => string | undefined;
  /** ธีมสี/โลโก้/ข้อความท้าย */
  theme?: ResolvedTheme;
}) {
  const { t, tt, lang } = useT();
  const blocks = useMemo(() => buildBlocks(schema), [schema]);
  const layout = useMemo(() => resolveLayout(schema, blocks), [schema, blocks]);
  // ความสูงจริงของแต่ละบล็อก → ดันบล็อกด้านล่างลงเมื่อเนื้อหางอกเกินกล่องที่ออกแบบ (ไม่ให้ทับกัน)
  const { measureRef, tops, height: canvasH } = usePaperReflow(blocks, layout, { resolveOverlap: true });
  const headerBox = schema.layout?.header ?? DEFAULT_HEADER_BOX;
  const metaBox = schema.layout?.meta ?? DEFAULT_META_BOX;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [fitScale, setFitScale] = useState(0.5);
  const pp = printPhotosOf(schema);
  const footer = theme?.footer ?? "";
  const footerH = footer ? 30 + 14 * Math.min(6, footer.split("\n").length) : 0;
  const pageH = canvasH + footerH;
  const today = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric" });

  // ปรับให้พอดีความกว้างจอครั้งแรก + เมื่อ resize (ถ้าผู้ใช้ยังไม่ได้ซูมเอง)
  const userZoomed = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // คำนวณใหม่เฉพาะเมื่อ "ความกว้าง" เปลี่ยน — คีย์บอร์ดมือถือเด้ง/สลับภาษาเปลี่ยนแค่ความสูง
    // ถ้าย่อขยายตามด้วย ช่องที่กำลังพิมพ์จะขยับและบางเครื่องปิดคีย์บอร์ด/ตัดการสลับภาษา
    let lastW = -1;
    const fit = () => {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
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
    // krok-print-live: กดพิมพ์ในหน้ากรอก (มุมมองกระดาษ) = พิมพ์กระดาษแผ่นนี้พร้อมค่าที่กรอก (ดู globals.css)
    <div data-paper="" className="krok-print-live">
      <div
        ref={wrapRef}
        className="krok-pl-wrap"
        style={{ overflow: "auto", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, WebkitOverflowScrolling: "touch" }}
      >
        {/* กล่องขนาดจริงหลังย่อ เพื่อให้ scroll พอดี (ไม่มี scroll แนวนอนตอน fit) */}
        <div className="krok-pl-sizer" style={{ width: CANVAS_W * scale, height: pageH * scale, margin: "0 auto", position: "relative" }}>
          <div
            className="krok-pl-canvas"
            style={{
              position: "absolute", top: 0, left: 0,
              width: CANVAS_W, minHeight: pageH,
              transform: `scale(${scale})`, transformOrigin: "top left",
              background: "#fff", color: "#111", boxShadow: "0 2px 16px rgba(0,0,0,.15)",
            }}
          >
            {/* ชื่อเอกสาร (ซ่อน/ย้ายได้) */}
            {schema.show_header !== false && (
              <div style={{ ...paperHeaderBoxStyle, top: headerBox.y, left: headerBox.x, width: headerBox.w }}>
                <PaperHeaderContent icon={icon} title={title} description={schema.description} logo={theme?.logo} color={theme?.custom ? theme.header : undefined} />
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
              if (b.kind === "image" && b.image) {
                return (
                  <div key={b.key} style={{ position: "absolute", left: box.x, top, width: box.w }}>
                    <PaperImageContent url={b.image.url} h={b.image.h} />
                  </div>
                );
              }
              if (b.kind === "photos" && b.photos) {
                const ph = b.photos;
                return (
                  <div key={b.key} ref={measureRef(b.key)} style={{ ...paperBoxStyle, left: box.x, top, width: box.w, minHeight: blockHeight(b) }}>
                    <PaperPhotoGrid cols={ph.cols} imgH={ph.imgH} numbered={false} title={b.field?.label || t("fw.noName")} required={b.field?.required}
                      items={ph.cells.map((c) => { const k = photoSlotKey(c.field.id, c.slot); return { key: k, label: photoCaption(c.field, c.slot, c.max, (n) => tt("print.photos.slotN", { n })), url: photoUrl?.(k), cell: renderPhotoCell?.(c.field, c.slot) }; })} />
                  </div>
                );
              }
              const f = b.field!;
              return (
                <div key={b.key} ref={measureRef(b.key)} className={pp.mode === "hidden" && f.type === "photo" ? "krok-print-hide" : undefined}
                  style={{ ...paperBoxStyle, left: box.x, top, width: box.w, minHeight: blockHeight(b) }}>
                  {renderField(f)}
                </div>
              );
            })}
            <PaperFooterText text={footer} top={canvasH - 20} />
          </div>
        </div>
      </div>

      {/* หน้าภาพประกอบท้ายเอกสาร (พิมพ์เท่านั้น) */}
      {pp.mode === "appendix" && (
        <PhotoAppendix title={title} cols={pp.cols} imgH={mmToPx(pp.height_mm)}
          items={photoFieldsOf(schema).flatMap(({ field }) => allPhotoSlotKeys(field).map((k, i, all) => ({ key: k, label: photoSlotLabel(field.label, i, all.length, t("fw.noName"), field.photo_labels?.[i]), url: photoUrl?.(k) })))} />
      )}

      {/* แถบซูม */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
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
