"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { href: "/studio", label: "สร้างฟอร์ม", icon: "🛠️", manage: true },
  { href: "/forms", label: "กรอกฟอร์ม", icon: "📱", manage: false },
  { href: "/approvals", label: "อนุมัติ", icon: "✅", manage: true },
  { href: "/dashboard", label: "Dashboard", icon: "📊", manage: false },
  { href: "/settings/team", label: "ทีม", icon: "👥", manage: true },
  { href: "/settings/ai", label: "AI", icon: "🤖", manage: true },
];

export default function AppShell({
  children,
  displayName,
  tenantName,
  canManage,
  userId,
}: {
  children: React.ReactNode;
  displayName: string;
  tenantName: string;
  canManage: boolean;
  userId: string;
}) {
  const path = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV.filter((n) => !n.manage || canManage);

  return (
    <>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
        className="no-print"
      >
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div className="hazard" style={{ width: 26, height: 26, borderRadius: 5 }} />
            <div>
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.15rem", color: "var(--ink)" }}>KROK</b>
              <small style={{ color: "var(--ink-3)", fontSize: ".7rem", display: "block", lineHeight: 1 }}>
                {tenantName}
              </small>
            </div>
          </Link>

          <nav style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {items.map((n) => {
              const on = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    padding: "8px 13px",
                    borderRadius: 8,
                    fontWeight: on ? 600 : 500,
                    fontSize: ".9rem",
                    textDecoration: "none",
                    color: on ? "var(--accent)" : "var(--ink-2)",
                    background: on ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span aria-hidden>{n.icon}</span> {n.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell userId={userId} />
            <button
              onClick={signOut}
              title="ออกจากระบบ"
              style={{
                fontSize: ".8rem",
                color: "var(--ink-3)",
                border: "1px dashed var(--line)",
                borderRadius: 20,
                padding: "4px 12px",
                background: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              👷 {displayName} · ออก
            </button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 90px" }}>{children}</main>
    </>
  );
}
