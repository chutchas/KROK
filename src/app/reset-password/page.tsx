import ResetPasswordForm from "./ResetPasswordForm";

// ตั้งรหัสผ่านใหม่ — มาจากลิงก์ในอีเมล "ลืมรหัสผ่าน" (/auth/confirm แลก session ให้แล้ว)
// ไม่มี session → middleware พาไปหน้า login เอง
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
