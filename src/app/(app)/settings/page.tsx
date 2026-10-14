import { redirect } from "next/navigation";

// /settings ไม่มีหน้าของตัวเอง — พาไปหน้าโปรไฟล์ (ทุกบทบาทเข้าได้) แทน 404
export default function SettingsIndex() {
  redirect("/settings/profile");
}
