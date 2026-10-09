import NotFoundView from "@/components/NotFoundView";

export const metadata = { title: "ไม่พบหน้านี้" };

// ลิงก์ผิด / ถูกลบ นอกส่วนแอป (เช่น /fill ที่โหลดไม่ขึ้นก่อนเข้า shell)
export default function NotFound() {
  return <NotFoundView bare />;
}
