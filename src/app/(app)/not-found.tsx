import NotFoundView from "@/components/NotFoundView";

export const metadata = { title: "ไม่พบหน้านี้" };

// ไม่พบในส่วนแอป (เอกสารที่ถูกลบ, ฟอร์มที่ปิด, ชุดข้อมูลที่ไม่มีแล้ว) — แสดงในกรอบแอป มีทางไปต่อ
export default function AppNotFound() {
  return <NotFoundView />;
}
