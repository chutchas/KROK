"use client";
// แถวใบที่ยังไม่จบในพื้นที่ (ใช้ใน widget dashboard และกล่องเตือน)
import Link from "next/link";
import { InlineFormIcon } from "@/components/FormIcon";
import { useAreaT as useT } from "@/i18n/ns/area";
import { openAge, type OpenItem } from "@/lib/areas";

export default function OpenRow({ it }: { it: OpenItem }) {
  const { t, tt } = useT();
  const age = openAge(it.started_at);
  const ageText = tt(age.unit === "m" ? "area.ageM" : age.unit === "h" ? "area.ageH" : "area.ageD", { n: age.n });
  // ไม่มี id = งานของคนอื่นที่ผู้ดูไม่มีสิทธิ์เปิด → แสดงอย่างเดียว ไม่มีลิงก์
  const href = !it.id ? null : it.kind === "case" && it.form_id ? `/fill/${it.form_id}?case=${it.id}` : `/submission/${it.id}`;
  const status = it.kind === "case" ? (it.step_title || t("area.inProgress")) : t("area.pendingApproval");
  return (
    <li>
      <Wrap href={href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", textDecoration: "none", fontSize: ".82rem", minWidth: 0 }}>
        <InlineFormIcon value={it.form_icon} size={15} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.form_title}</b>
          <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".74rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {status}{it.holder ? ` · ${it.holder}` : ""}
          </span>
        </span>
        <span className="tabnum" style={{ color: "var(--ink-3)", fontSize: ".74rem", flexShrink: 0 }}>{ageText}</span>
      </Wrap>
    </li>
  );
}

function Wrap({ href, style, children }: { href: string | null; style: React.CSSProperties; children: React.ReactNode }) {
  return href ? <Link href={href} style={style}>{children}</Link> : <div style={style}>{children}</div>;
}
