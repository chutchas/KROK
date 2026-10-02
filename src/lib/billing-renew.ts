import "server-only";
// ============================================================
// KROK · ต่ออายุอัตโนมัติ (recurring) — เรียกจาก cron รายวัน (/api/cron/billing)
// ตัดเงินล่วงหน้า 1 วันก่อนหมดอายุด้วยบัตรที่ Gateway เก็บไว้ · ราคาตามที่ล็อกไว้ตอนสมัคร (renew_price)
// ไม่ผ่าน → renewal_failed (ลองใหม่พรุ่งนี้ สูงสุด 4 ครั้ง) + แจ้งเจ้าของบัญชี
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeSavedMethod } from "@/lib/billing-gateway";
import { currentPeriod } from "@/lib/quota";

export const MAX_RENEW_ATTEMPTS = 4;

interface DueRow {
  user_id: string; plan: string; expires_at: string; payment_method_ref: string;
  renew_price: number | null; renew_months: number; renew_attempts: number;
}

/** แจ้งเตือนในกระดิ่งของเจ้าของบัญชี (ทุก workspace ที่เป็นเจ้าของ → แจ้งที่ workspace แรก) */
export async function notifyOwner(admin: SupabaseClient, userId: string, title: string, body: string) {
  const { data: ids } = await admin.rpc("owner_tenant_ids", { p_owner: userId });
  const tenant = Array.isArray(ids) && ids.length ? (ids[0] as string) : null;
  if (!tenant) return;
  await admin.from("notifications").insert({ tenant_id: tenant, user_id: userId, type: "billing", title, body, link: "/settings/billing" });
}

export async function handleRenewalFailure(admin: SupabaseClient, invoiceId: string, userId: string, reason: string) {
  const { data: n } = await admin.rpc("renewal_failed", { p_invoice: invoiceId, p_reason: reason });
  const attempts = typeof n === "number" ? n : 0;
  const last = attempts >= MAX_RENEW_ATTEMPTS;
  await notifyOwner(admin, userId,
    last ? "ต่ออายุแพ็กเกจไม่สำเร็จ — แพ็กเกจจะถูกลดเป็น Free" : "ตัดเงินต่ออายุแพ็กเกจไม่สำเร็จ",
    `${reason || "บัตรถูกปฏิเสธ"} — ${last ? "ตัดเงินไม่ผ่านครบ 4 ครั้งแล้ว ต่ออายุเองหรือเปลี่ยนบัตรในหน้าแพ็กเกจ" : "ระบบจะลองใหม่พรุ่งนี้ หรือเปลี่ยนบัตรในหน้าแพ็กเกจ"}`);
}

export interface RenewSummary { due: number; charged: number; pending: number; failed: number; skipped: number; errors: string[] }

export async function runRenewals(
  admin: SupabaseClient,
  ctx: { origin: string; planPrice: (key: string) => number | null; planName: (key: string) => string }
): Promise<RenewSummary> {
  const out: RenewSummary = { due: 0, charged: 0, pending: 0, failed: 0, skipped: 0, errors: [] };
  const { data, error } = await admin.rpc("due_renewals", { p_limit: 200 });
  if (error) { out.errors.push(error.message); return out; }
  const rows = (data || []) as DueRow[];
  out.due = rows.length;

  for (const r of rows) {
    // แพ็กเกจถูกลบ/กลายเป็นฟรี → หยุดต่ออายุ (หมดรอบแล้วลดเป็น Free เอง)
    const listPrice = ctx.planPrice(r.plan);
    if (listPrice === null || listPrice <= 0) {
      await admin.from("account_plans").update({ auto_renew: false, last_renew_error: "แพ็กเกจนี้ไม่เปิดต่ออายุแล้ว" }).eq("user_id", r.user_id);
      out.skipped++;
      continue;
    }
    const { data: ids } = await admin.rpc("owner_tenant_ids", { p_owner: r.user_id });
    const tenant = Array.isArray(ids) && ids.length ? (ids[0] as string) : null;
    if (!tenant) { out.skipped++; continue; }
    const amount = r.renew_price && r.renew_price > 0 ? r.renew_price : listPrice; // ราคาล็อกตอนสมัคร

    const { data: inv, error: invErr } = await admin.from("invoices").insert({
      tenant_id: tenant, user_id: r.user_id, plan: r.plan, amount, currency: "THB",
      period: currentPeriod(), months: Math.max(1, r.renew_months || 1), status: "pending", kind: "renewal", auto_renew: true,
      note: `ต่ออายุอัตโนมัติ (ครั้งที่ ${r.renew_attempts + 1})`,
    }).select("id, number").single();
    if (invErr || !inv) { out.errors.push(invErr?.message || "insert invoice"); continue; }

    try {
      const ch = await chargeSavedMethod({
        invoiceId: inv.id as string,
        paymentMethodRef: r.payment_method_ref,
        amountThb: amount,
        description: `KROK ${ctx.planName(r.plan)} — ต่ออายุ 1 เดือน`,
        callbackUrl: `${ctx.origin}/api/billing/callback`,
        metadata: { invoice_number: String(inv.number ?? ""), plan: r.plan, user_id: r.user_id, kind: "renewal" },
      });
      await admin.from("invoices").update({ gateway_ref: ch.paymentId }).eq("id", inv.id);
      if (ch.status === "succeeded") {
        const { data: res } = await admin.rpc("apply_invoice_paid", { p_invoice: inv.id, p_amount_satang: Math.round(amount * 100), p_paid_at: new Date().toISOString() });
        if (res === "ok") await notifyOwner(admin, r.user_id, "ต่ออายุแพ็กเกจเรียบร้อย", `ตัดเงิน ฿${amount.toLocaleString()} สำเร็จ`);
        if (res === "ok" || res === "duplicate") out.charged++;
        else out.errors.push(String(res));
      } else if (ch.status === "failed") {
        await handleRenewalFailure(admin, inv.id as string, r.user_id, ch.failureReason || "บัตรถูกปฏิเสธ");
        out.failed++;
      } else {
        out.pending++; // รอ callback
      }
    } catch (e) {
      // ติดต่อ Gateway ไม่ได้ = ไม่นับเป็นความผิดของบัตร: ทิ้งใบนี้ แล้วลองใหม่รอบหน้า
      await admin.from("invoices").update({ status: "void", note: "ติดต่อระบบชำระเงินไม่ได้" }).eq("id", inv.id);
      out.errors.push(e instanceof Error ? e.message : "charge error");
    }
  }
  return out;
}

/**
 * เตือนก่อนหมดอายุ 3 วัน (แพ็กเกจเสียเงินที่ไม่ได้ต่ออายุอัตโนมัติ เช่น จ่ายด้วย QR/โอน หรือยกเลิกแล้ว)
 * เตือนครั้งเดียวต่อรอบ (expiry_reminded_at)
 */
export async function remindExpiring(admin: SupabaseClient): Promise<number> {
  const now = Date.now();
  const { data, error } = await admin
    .from("account_plans")
    .select("user_id, plan, expires_at, auto_renew, payment_method_ref, expiry_reminded_at")
    .neq("plan", "free")
    .not("expires_at", "is", null)
    .gt("expires_at", new Date(now).toISOString())
    .lte("expires_at", new Date(now + 3 * 86400_000).toISOString())
    .limit(500);
  if (error || !data) return 0;
  let n = 0;
  for (const r of data as { user_id: string; expires_at: string; auto_renew: boolean; payment_method_ref: string | null; expiry_reminded_at: string | null }[]) {
    if (r.auto_renew && r.payment_method_ref) continue; // จะถูกตัดเงินอัตโนมัติอยู่แล้ว
    const exp = new Date(r.expires_at).getTime();
    if (r.expiry_reminded_at && new Date(r.expiry_reminded_at).getTime() > exp - 5 * 86400_000) continue; // เตือนรอบนี้แล้ว
    const days = Math.max(1, Math.ceil((exp - now) / 86400_000));
    await notifyOwner(admin, r.user_id, `แพ็กเกจจะหมดอายุใน ${days} วัน`, "ต่ออายุในหน้าแพ็กเกจเพื่อใช้งานต่อ — หมดอายุแล้วมีช่วงผ่อนผัน 3 วันก่อนลดเป็น Free");
    await admin.from("account_plans").update({ expiry_reminded_at: new Date().toISOString() }).eq("user_id", r.user_id);
    n++;
  }
  return n;
}
