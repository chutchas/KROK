import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// การตั้งค่า AI ย้ายไปเป็นระดับแพลตฟอร์มแล้ว (ตั้งได้เฉพาะ Platform Admin / Developer)
export default async function AiSettingsRedirect() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.isPlatformAdmin || session.platformRole === "developer") redirect("/admin/settings");
  redirect("/settings/profile");
}
