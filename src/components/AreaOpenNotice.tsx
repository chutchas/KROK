"use client";
// กล่องเตือน "มีใบอื่นที่ยังไม่จบในพื้นที่นี้" — เตือนอย่างเดียว ไม่บล็อก (0072)
// ใช้ในหัวงาน (ฟอร์มกรอกหลายคน) และหน้าอนุมัติ
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import Icon from "@/components/Icon";
import { useAreaT as useT } from "@/i18n/ns/area";
import { areaOpenOthers } from "@/app/(app)/settings/areas/actions";
import OpenRow from "@/components/AreaOpenRow";
import type { OpenItem } from "@/lib/areas";

export default function AreaOpenNotice({ areaId, excludeId, preload }: {
  areaId: string;
  excludeId: string;
  /** ข้อมูลที่ server โหลดมาแล้ว (หน้าอนุมัติ) — ไม่ต้องเรียกซ้ำ */
  preload?: { name: string; items: OpenItem[] };
}) {
  const { tt, t } = useT();
  const [data, setData] = useState<{ name: string; items: OpenItem[] } | null>(preload ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (preload) return;
    let alive = true;
    areaOpenOthers(areaId, excludeId).then((r) => { if (alive) setData(r); });
    return () => { alive = false; };
  }, [areaId, excludeId, preload]);

  if (!data || data.items.length === 0) return null;
  return (
    <div role="status" style={{ margin: "8px 0 0", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--warn)", background: "var(--warn-soft)", fontSize: ".82rem" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", background: "none", padding: 0, color: "var(--ink)", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", textAlign: "left" }}>
        <Icon icon={MapPin} className="h-4 w-4" />
        <span style={{ flex: 1 }}>{tt("area.othersOpen", { n: data.items.length, area: data.name || t("area.thisArea") })}</span>
        <span style={{ color: "var(--accent-text)", textDecoration: "underline", flexShrink: 0 }}>{open ? t("area.hide") : t("area.show")}</span>
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 4 }}>
          {data.items.map((it, i) => <OpenRow key={`${it.kind}:${it.id ?? i}`} it={it} />)}
        </ul>
      )}
    </div>
  );
}
