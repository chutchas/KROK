import { enforceMenu, canManage } from "@/lib/session";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await enforceMenu("studio");
  if (!canManage(session.role)) {
    return (
      <div style={{ color: "var(--ink-2)" }}>
        บัญชีของคุณเป็นระดับ Operator — ไปที่แท็บ “กรอกฟอร์ม” เพื่อใช้งานได้เลย
      </div>
    );
  }
  return <TemplatesClient />;
}
