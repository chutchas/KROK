import { redirect } from "next/navigation";

// คลังเทมเพลตย้ายไปอยู่ในหน้า "สร้างฟอร์ม" (โหมด "จากเทมเพลต") — ลิงก์เก่าพาไปที่นั่น
export const metadata = { title: "เทมเพลตฟอร์ม" };

export default function TemplatesPage() {
  redirect("/studio?mode=template");
}
