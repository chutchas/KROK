import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n/dictionaries";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // อ่านภาษาเริ่มต้นจากโปรไฟล์ (ลด flash ตอนโหลด)
  let initialLang: Lang = "th";
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("language").eq("user_id", session.userId).maybeSingle();
    if (data?.language === "en" || data?.language === "th") initialLang = data.language;
  } catch {
    /* profiles table may not exist yet */
  }

  return (
    <LanguageProvider initial={initialLang}>
      <AppShell
        displayName={session.displayName}
        tenantName={session.tenantName}
        canManage={canManage(session.role)}
        userId={session.userId}
      >
        {children}
      </AppShell>
    </LanguageProvider>
  );
}
