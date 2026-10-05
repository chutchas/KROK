"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";

type Res = { ok: true } | { error: string };

async function requirePlatform() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "unauthorized" };
  if (!session.isPlatformAdmin) return { ok: false as const, error: "เฉพาะ admin ของระบบเท่านั้น" };
  const admin = getAdminClient();
  if (!admin) return { ok: false as const, error: "ระบบยังไม่ได้ตั้งค่า service key" };
  return { ok: true as const, session, admin };
}

const finite = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** อัตราแลกเปลี่ยน USD→THB + ต้นทุนคงที่ต่อเดือน (บาท) */
export async function saveCostSettings(usdThb: number, fixedMonthlyThb: number): Promise<Res> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  if (!finite(usdThb, 1, 1000)) return { error: "อัตราแลกเปลี่ยนไม่ถูกต้อง" };
  if (!finite(fixedMonthlyThb, 0, 100_000_000)) return { error: "ต้นทุนคงที่ไม่ถูกต้อง" };
  const { error } = await a.admin.from("platform_cost_settings").upsert({
    id: true, usd_thb: usdThb, fixed_monthly_thb: fixedMonthlyThb, updated_at: new Date().toISOString(), updated_by: a.session.userId,
  });
  if (error) return { error: "บันทึกไม่สำเร็จ — รัน migration 0058 แล้วหรือยัง" };
  revalidatePath("/admin/finance");
  return { ok: true };
}

/** ราคาต่อ 1 ล้าน token (USD) ของรุ่นหนึ่ง · ใส่ 0 ทั้งคู่ + remove = ลบราคา */
export async function saveModelPrice(model: string, inputPerM: number, outputPerM: number, remove = false): Promise<Res> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  const m = typeof model === "string" ? model.trim() : "";
  if (!m || m.length > 120) return { error: "ชื่อรุ่นไม่ถูกต้อง" };
  if (remove) {
    const { error } = await a.admin.from("platform_ai_prices").delete().eq("model", m);
    if (error) return { error: "ลบไม่สำเร็จ" };
  } else {
    if (!finite(inputPerM, 0, 10_000) || !finite(outputPerM, 0, 10_000)) return { error: "ราคาไม่ถูกต้อง" };
    const { error } = await a.admin.from("platform_ai_prices").upsert({
      model: m, input_per_m: inputPerM, output_per_m: outputPerM, updated_at: new Date().toISOString(), updated_by: a.session.userId,
    });
    if (error) return { error: "บันทึกไม่สำเร็จ — รัน migration 0058 แล้วหรือยัง" };
  }
  revalidatePath("/admin/finance");
  return { ok: true };
}
