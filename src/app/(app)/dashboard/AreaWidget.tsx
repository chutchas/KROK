"use client";
// widget "ตามพื้นที่": ใบที่ยังไม่จบ (งานที่เปิดอยู่ + รออนุมัติ) — เพื่อให้เห็นงานที่ทำพร้อมกันในพื้นที่เดียวกัน
import Link from "next/link";
import { useAreaT as useT } from "@/i18n/ns/area";
import { groupByArea, type OpenItem } from "@/lib/areas";
import OpenRow from "@/components/AreaOpenRow";
import type { AreaOpt } from "./DashboardClient";

export function AreaWidgetTitle() {
  const { t } = useT();
  return <>{t("area.widgetTitle")}</>;
}

export function AreaSubtitle({ name }: { name: string | null }) {
  const { t } = useT();
  if (name === null) return <>{t("area.allAreas")}</>;
  return <>{name || t("area.gone")}</>;
}

export function AreaPicker({ areas, value, onChange }: { areas: AreaOpt[]; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const cur = areas.some((a) => a.id === value) ? value : "all";
  return (
    <div style={{ marginTop: 14 }}>
      <label htmlFor="dash-area" style={{ display: "block", fontSize: ".84rem", fontWeight: 600, marginBottom: 6 }}>{t("area.pick")}</label>
      <select id="dash-area" value={cur} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit" }}>
        <option value="all">{t("area.allAreas")}</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
      </select>
      {areas.length === 0 && (
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
          {t("area.noneYet")} <Link href="/settings/areas" style={{ color: "var(--accent-text)" }}>{t("area.manageLink")}</Link>
        </p>
      )}
    </div>
  );
}

export function AreaView({ items, grouped }: { items: OpenItem[]; grouped: boolean }) {
  const { t } = useT();
  if (items.length === 0) return <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{t("area.noOpen")}</div>;
  const groups = groupByArea(items);
  return (
    <div style={{ display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" }}>
      {groups.map((g) => (
        <div key={g.area_id}>
          {grouped && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: ".8rem", fontWeight: 600, marginBottom: 4 }}>
              <span>{g.area_name}</span>
              <span style={{ color: "var(--ink-3)", fontFamily: "monospace", fontWeight: 400, fontSize: ".72rem" }}>{g.area_code}</span>
              <span className="tabnum" style={{ marginLeft: "auto", color: "var(--ink-2)", fontWeight: 400 }}>{g.items.length}</span>
            </div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
            {g.items.map((it) => <OpenRow key={`${it.kind}:${it.id}`} it={it} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}
