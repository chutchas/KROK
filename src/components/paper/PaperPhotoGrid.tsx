"use client";
import { Camera } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { PHOTO_CAPTION_H, PHOTO_GAP } from "@/lib/paper-layout";
import { PaperLabel } from "@/components/paper/PaperParts";

// ============================================================
// กล่องภาพประกอบ — รูปถ่ายหลายฟิลด์จัดเป็นตาราง cols รูปต่อแถว สูง imgH px + ชื่อฟิลด์ใต้รูป
// ใช้ร่วม: หน้าออกแบบกระดาษ (ตัวอย่าง), หน้ากรอก (กดถ่ายได้), พิมพ์, หน้าภาพประกอบท้ายเอกสาร
// ============================================================

/** ชื่อใต้รูปในกล่องของฟิลด์: ชื่อที่ตั้งเอง → "รูปที่ n" (หลายรูป) → ว่าง (รูปเดียว) */
export function photoCaption(f: { photo_labels?: string[] }, slot: number, max: number, slotN: (n: number) => string): string {
  const s = f.photo_labels?.[slot]?.trim();
  return s || (max > 1 ? slotN(slot + 1) : "");
}

export type PhotoGridItem = {
  key: string;
  label: string;
  url?: string;
  /** หน้ากรอก: เนื้อหาเซลล์ที่กดถ่าย/เปลี่ยนรูปได้ (แทนรูปนิ่ง) */
  cell?: React.ReactNode;
  /** หน้าออกแบบ: ฟิลด์ของช่องนี้ (คลิกช่อง = เลือกฟิลด์) */
  fieldId?: string;
};

/** พื้นที่รูป 1 ช่อง — มีรูป = แสดงเต็มกรอบ (ไม่ครอป), ไม่มี = กรอบเส้นประ */
export function PhotoFrame({ url, height, alt, children }: { url?: string; height: number; alt: string; children?: React.ReactNode }) {
  return (
    <div style={{ height, border: url ? "1px solid #d4d4d4" : "1px dashed #b9bec4", borderRadius: 3, background: url ? "#fafafa" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
      {url ? <img loading="lazy" src={url} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} /> : children}
    </div>
  );
}

export function EmptyPhotoHint({ onClick }: { onClick?: () => void }) {
  const { t } = useT();
  const inner = <><Icon icon={Camera} className="h-4 w-4" /> {t("fw.paper.takePhoto")}</>;
  if (!onClick) return <span className="no-print" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#999", fontSize: ".72rem" }}>{inner}</span>;
  return (
    <button type="button" className="no-print" onClick={onClick}
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "none", background: "transparent", color: "#777", fontFamily: "inherit", fontSize: ".74rem", cursor: "pointer" }}>
      {inner}
    </button>
  );
}

export default function PaperPhotoGrid({
  items,
  cols,
  imgH,
  title,
  showTitle = true,
  onPickField,
  selectedFieldId,
  required = false,
  numbered = true,
  selectedKey,
}: {
  items: PhotoGridItem[];
  cols: number;
  imgH: number;
  title?: string;
  showTitle?: boolean;
  /** หน้าออกแบบ: คลิกช่องรูป → เปิดตั้งค่าฟิลด์นั้น */
  onPickField?: (fieldId: string, itemKey: string) => void;
  selectedFieldId?: string | null;
  /** หัวกล่อง = ชื่อฟิลด์ที่บังคับกรอก */
  required?: boolean;
  /** ใส่ลำดับ "1." หน้าชื่อใต้รูป (หน้าแนบท้าย) */
  numbered?: boolean;
  /** ช่องที่กำลังแก้ชื่อใต้รูป (เน้นกรอบ) */
  selectedKey?: string | null;
}) {
  const { t } = useT();
  return (
    <div>
      {showTitle && <PaperLabel label={title || t("print.photos.title")} required={required} />}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`, gap: `${PHOTO_GAP}px 10px` }}>
        {items.map((it, i) => (
          <div key={it.key} data-krok-keep={onPickField ? "" : undefined}
            onClick={onPickField && it.fieldId ? (e) => { e.stopPropagation(); onPickField(it.fieldId!, it.key); } : undefined}
            onPointerDown={onPickField ? (e) => e.stopPropagation() : undefined}
            title={onPickField ? t("print.photos.cellHint") : undefined}
            style={{ minWidth: 0, breakInside: "avoid", cursor: onPickField ? "pointer" : undefined, borderRadius: 4,
              outline: selectedKey === it.key ? "2px solid var(--accent)" : selectedFieldId && it.fieldId === selectedFieldId ? "1px dashed var(--accent)" : undefined, outlineOffset: 2 }}>
            {it.cell ?? <PhotoFrame url={it.url} height={imgH} alt={it.label} />}
            <div title={it.label} style={{ height: PHOTO_CAPTION_H, lineHeight: `${PHOTO_CAPTION_H}px`, fontSize: ".68rem", color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {numbered ? <><b style={{ color: "#111" }}>{i + 1}.</b> {it.label || t("fw.noName")}</> : it.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * หน้าภาพประกอบท้ายเอกสาร (print_photos.mode = "appendix") — แสดงเฉพาะตอนพิมพ์ ขึ้นหน้าใหม่
 * แสดงเฉพาะรูปที่ถ่ายแล้ว · ไม่มีรูปเลย = ไม่พิมพ์หน้านี้
 */
export function PhotoAppendix({ items, cols, imgH, title }: { items: PhotoGridItem[]; cols: number; imgH: number; title?: string }) {
  const { t } = useT();
  const withPhoto = items.filter((i) => i.url);
  if (withPhoto.length === 0) return null;
  return (
    <div className="krok-print-only krok-photo-appendix" style={{ breakBefore: "page", pageBreakBefore: "always", background: "#fff", color: "#111", padding: "8px 4px" }}>
      <div style={{ fontSize: "1.05rem", fontWeight: 700, borderBottom: "2px solid #111", paddingBottom: 4, marginBottom: 12 }}>
        {t("print.photos.title")}{title ? ` — ${title}` : ""}
      </div>
      <PaperPhotoGrid items={withPhoto} cols={cols} imgH={imgH} showTitle={false} />
    </div>
  );
}
