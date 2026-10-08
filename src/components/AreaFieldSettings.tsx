"use client";
// Studio › ตั้งค่าฟิลด์ "พื้นที่": ตัวเลือกมาจาก ตั้งค่า › พื้นที่ เท่านั้น · เลือกค่าเริ่มต้นได้
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAreaT as useT } from "@/i18n/ns/area";
import { listAreas } from "@/app/(app)/settings/areas/actions";
import type { AreaRow } from "@/lib/areas";
import type { FormField } from "@/lib/form-schema";

export default function AreaFieldSettings({ field, onPatch }: { field: FormField; onPatch: (p: Partial<FormField>) => void }) {
  const { t } = useT();
  const [areas, setAreas] = useState<AreaRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    listAreas().then((r) => {
      if (!alive) return;
      if ("error" in r) { setErr(r.error); setAreas([]); } else setAreas(r.areas);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2)" }}>
      <p style={{ fontSize: ".8rem", color: "var(--ink-2)", margin: 0 }}>
        {t("area.fieldHint")} <Link href="/settings/areas" style={{ color: "var(--accent-text)" }}>{t("area.manageLink")}</Link>
      </p>
      <label htmlFor={`ad_${field.id}`} style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)", margin: "10px 0 4px" }}>{t("area.default")}</label>
      <select id={`ad_${field.id}`} value={field.area_default ?? ""} disabled={areas === null}
        onChange={(e) => onPatch({ area_default: e.target.value || undefined })}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit" }}>
        <option value="">{t("area.noDefault")}</option>
        {(areas || []).map((a) => <option key={a.id} value={a.code}>{a.name} · {a.code}</option>)}
        {field.area_default && areas && !areas.some((a) => a.code === field.area_default) && (
          <option value={field.area_default}>{field.area_default} ({t("area.inactive")})</option>
        )}
      </select>
      {areas && areas.length === 0 && !err && <p style={{ fontSize: ".76rem", color: "var(--warn)", margin: "6px 0 0" }}>{t("area.noneYet")}</p>}
      {err && <p role="alert" style={{ fontSize: ".76rem", color: "var(--fail)", margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}
