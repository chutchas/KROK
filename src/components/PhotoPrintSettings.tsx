"use client";
import { useT } from "@/i18n/LanguageProvider";
import { PRINT_PHOTO_MODES, photoFieldsOf, printPhotosOf, type FormSchema, type PrintPhotoMode } from "@/lib/form-schema";

// ============================================================
// ตั้งค่าการแสดงรูปถ่ายบนเอกสารกระดาษ/ตอนพิมพ์ (ระดับฟอร์ม)
// แสดงในแผงตั้งค่า: ฟิลด์รูปถ่าย, หัวเอกสาร, กล่องภาพประกอบ
// ============================================================

const HEIGHTS = [25, 30, 35, 40, 45, 50, 60, 70, 80, 100, 120];

export default function PhotoPrintSettings({ schema, onChange, bare = false }: { schema: FormSchema; onChange: (s: FormSchema) => void; bare?: boolean }) {
  const { t } = useT();
  const pp = printPhotosOf(schema);
  const count = photoFieldsOf(schema).length;

  const set = (patch: Partial<typeof pp>) => {
    const next = { ...pp, ...patch };
    const n: FormSchema = { ...schema };
    if (next.mode === "thumb") delete n.print_photos;
    else n.print_photos = next;
    // ตำแหน่งกล่องรวมแบบเดิม (เวอร์ชันก่อน) ไม่ใช้แล้ว
    if (n.layout?.photos) {
      const l = { ...n.layout };
      delete l.photos;
      n.layout = l;
    }
    onChange(n);
  };

  const sizeOn = pp.mode === "grid" || pp.mode === "appendix";
  const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--line-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" };

  return (
    <div style={bare ? undefined : { marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      {!bare && <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--ink)" }}>{t("print.photos.section")}</div>}
      <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "4px 0 8px" }}>
        {count === 0 ? t("print.photos.noPhotoFields") : t("print.photos.hint")}
      </p>
      <div role="radiogroup" aria-label={t("print.photos.section")} style={{ display: "grid", gap: 6 }}>
        {PRINT_PHOTO_MODES.map((m: PrintPhotoMode) => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".86rem", color: "var(--ink)", cursor: "pointer" }}>
            <input type="radio" name="print-photos-mode" checked={pp.mode === m} onChange={() => set({ mode: m })} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
            {t(`print.photos.mode.${m}`)}
          </label>
        ))}
      </div>
      {pp.mode === "hidden" && count > 0 && (
        <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "8px 0 0" }}>{t("print.photos.hiddenHint")}</p>
      )}
      {sizeOn && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: ".78rem", color: "var(--ink-2)", fontWeight: 600 }}>
              {t("print.photos.cols")}
              <select value={pp.cols} onChange={(e) => set({ cols: Number(e.target.value) })} style={{ ...input, marginTop: 4 }}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: ".78rem", color: "var(--ink-2)", fontWeight: 600 }}>
              {t("print.photos.height")}
              <select value={pp.height_mm} onChange={(e) => set({ height_mm: Number(e.target.value) })} style={{ ...input, marginTop: 4 }}>
                {[...new Set([...HEIGHTS, pp.height_mm])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
            {pp.mode === "grid" ? t("print.photos.gridHint") : t("print.photos.appendixHint")}
          </p>
        </>
      )}
    </div>
  );
}
