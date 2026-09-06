import { redirect } from "next/navigation";

// รวมเข้ากับหน้า "ตั้งค่าระบบ" (แท็บ AI) — คงลิงก์เดิมไว้
export default function LegacyAiRedirect() {
  redirect("/admin/settings");
}
