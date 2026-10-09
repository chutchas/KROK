import NotFoundView from "@/components/NotFoundView";

// หน้ากรอกซ่อนแถบแอป (โหมดเต็มจอ) → หน้า "ไม่พบ" ต้องมีโลโก้ของตัวเอง ไม่ให้ดูเหมือนหน้าพัง (QR/ลิงก์ของฟอร์มที่ปิดแล้ว)
export default function FillNotFound() {
  return <NotFoundView bare />;
}
