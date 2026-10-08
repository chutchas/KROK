"use client";
// แถบแท็บด้านบนหน้าตั้งค่า — หมวดที่มีแท็บเดียว (หรือหน้านอกหมวด เช่น โปรไฟล์) ไม่แสดง
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import { hubOf } from "@/lib/settings-nav";

export default function SettingsTabs({ hubs }: { hubs: { key: string; items: { href: string; tabKey: MessageKey }[] }[] }) {
  const path = usePathname();
  const { t } = useT();
  const cur = hubOf(path);
  const items = cur ? hubs.find((h) => h.key === cur.hub.key)?.items ?? [] : [];
  if (!cur || items.length < 2) return null;
  return (
    <nav aria-label={t(cur.hub.labelKey)} className="krok-tabscroll no-print"
      style={{ display: "flex", gap: 4, boxShadow: "inset 0 -1px 0 var(--line)", marginBottom: 18, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
      {items.map((it) => {
        const on = it.href === cur.item.href;
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
            style={{ padding: "9px 14px", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, color: on ? "var(--accent-text)" : "var(--ink-2)",
              fontWeight: on ? 600 : 500, fontSize: ".92rem", textDecoration: "none", whiteSpace: "nowrap", flex: "0 0 auto" }}>
            {t(it.tabKey)}
          </Link>
        );
      })}
    </nav>
  );
}
