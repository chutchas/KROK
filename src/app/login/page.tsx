import { Suspense } from "react";
import type { Viewport } from "next";
import HomeClient from "./HomeClient";
import { getPublicPlans } from "@/lib/plans-server";

// แพ็กเกจที่แสดงอ่านจากแคตตาล็อก (Platform Admin แก้แล้วเห็นทันที)
export const dynamic = "force-dynamic";

// Android: คีย์บอร์ดเปลี่ยนความสูง (เช่น กดค้างปุ่มเปลี่ยนภาษา) ไม่ต้องย่อ/จัดหน้าใหม่ทั้งหน้า → ช่องกรอกไม่ขยับ/ไม่หลุดโฟกัส
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: "resizes-visual",
};

export default async function LoginPage() {
  const plans = await getPublicPlans().catch(() => undefined);
  return (
    <Suspense fallback={<div style={{ padding: 56, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
      <HomeClient plans={plans} />
    </Suspense>
  );
}
