// แท็บของหมวดตั้งค่า (สมาชิกและทีม / ตั้งค่า Workspace / แพ็กเกจและการชำระเงิน) — แสดงเฉพาะแท็บที่มีสิทธิ์
import { getSession, getAllowedMenus } from "@/lib/session";
import { SETTINGS_HUBS, canSee } from "@/lib/settings-nav";
import SettingsTabs from "@/components/SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return <>{children}</>;
  const allowed = new Set<string>(await getAllowedMenus(session.tenantId, session.roleKey));
  const ctx = { allowed, isWsAdmin: session.role === "owner" || session.role === "admin", isPlatformAdmin: session.isPlatformAdmin, platformRole: session.platformRole };
  const hubs = SETTINGS_HUBS.map((h) => ({ key: h.key, items: h.items.filter((it) => canSee(it, ctx)).map((it) => ({ href: it.href, tabKey: it.tabKey })) }));
  return (
    <>
      <SettingsTabs hubs={hubs} />
      {children}
    </>
  );
}
