// ============================================================
// KROK · แบนเนอร์เตือนโควตาใกล้เต็ม/เต็ม (แสดงบนแดชบอร์ด) — เต็มแล้ว = งานบางอย่างจะถูกบล็อก
// ============================================================
import Link from "next/link";
import { fmtLimit } from "@/lib/plans";
import type { QuotaWarning } from "@/lib/quota-warn";

export default function QuotaBanner({ warnings, canUpgrade }: { warnings: QuotaWarning[]; canUpgrade: boolean }) {
  if (!warnings.length) return null;
  const full = warnings.some((w) => w.level === 100);
  const c = full ? "var(--fail)" : "var(--amber, #b45309)";
  return (
    <div role="status" style={{ border: `1px solid ${c}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, background: "var(--surface)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: ".88rem", lineHeight: 1.6 }}>
        <b style={{ color: c }}>{full ? "โควตาแพ็กเกจเต็มแล้ว — งานบางอย่างจะทำไม่ได้จนกว่าจะอัปเกรดหรือขึ้นรอบใหม่" : "โควตาแพ็กเกจใกล้เต็ม"}</b>
        <div style={{ color: "var(--ink-2)" }}>
          {warnings.slice(0, 4).map((w) => `${w.label} ${w.used.toLocaleString("en-US")}/${fmtLimit(w.max)}${w.unit ? ` ${w.unit}` : ""} (${w.pct}%)`).join(" · ")}
        </div>
      </div>
      {canUpgrade ? (
        <Link href="/settings/billing" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 8, padding: "7px 14px", fontSize: ".85rem", fontWeight: 600, textDecoration: "none" }}>ดูแพ็กเกจ</Link>
      ) : (
        <span style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>แจ้งเจ้าของบัญชีเพื่ออัปเกรด</span>
      )}
    </div>
  );
}
