import { redirect } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";

export const metadata = { title: "ตั้งค่า AI" };

export const dynamic = "force-dynamic";

// การตั้งค่า AI ย้ายไปเป็นระดับแพลตฟอร์มแล้ว (ตั้งได้เฉพาะ Platform Admin)
export default async function AiSettingsRedirect() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (session.isPlatformAdmin) redirect("/admin/settings");
  redirect("/settings/profile");
}
