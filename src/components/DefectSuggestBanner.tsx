"use client";
import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { FormSchema } from "@/lib/form-schema";
import { applyDefectSuggestions, defectSuggestions } from "@/lib/defect-words";

/**
 * หน้าสร้างฟอร์ม: ตัวเลือกที่ดูเหมือนข้อบกพร่อง (ชำรุด, ไม่ผ่าน, NG …) แต่ยังไม่ได้ตั้งว่านับเป็นไม่ผ่าน
 * → เสนอให้กดยืนยันครั้งเดียว (ไม่ตั้งเอง: คำบางคำกำกวม เจ้าของฟอร์มต้องตัดสิน)
 * "ไม่ใช่" = ซ่อนจนกว่าจะเปิดฟอร์มนี้ใหม่
 */
export default function DefectSuggestBanner({ schema, onApply }: { schema: FormSchema; onApply: (s: FormSchema) => void }) {
  const { t, tt } = useT();
  const [dismissed, setDismissed] = useState(false);
  const list = useMemo(() => defectSuggestions(schema), [schema]);
  if (dismissed || !list.length) return null;
  return (
    <div role="region" aria-label={t("defect.title")} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--warn) 45%, transparent)", background: "color-mix(in srgb, var(--warn) 9%, var(--surface))" }}>
      <span style={{ color: "var(--warn)", marginTop: 2, flex: "0 0 auto" }}><Icon icon={CircleAlert} className="h-[18px] w-[18px]" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: ".9rem", display: "block" }}>{t("defect.title")}</b>
        <ul style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: ".86rem", color: "var(--ink-2)" }}>
          {list.map((s) => (
            <li key={s.fieldId + (s.colId ?? "")}>{tt("defect.item", { label: s.label, opts: s.options.join(", ") })}</li>
          ))}
        </ul>
        <div style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "-4px 0 8px" }}>{t("defect.saveHint")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onApply(applyDefectSuggestions(schema, list))}
            style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            {t("defect.apply")}
          </button>
          <button type="button" onClick={() => setDismissed(true)}
            style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontFamily: "inherit", cursor: "pointer" }}>
            {t("defect.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
