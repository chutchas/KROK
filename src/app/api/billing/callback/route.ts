import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { gatewayConfig } from "@/lib/billing-gateway";
import { verifyGatewaySignature, parseGatewayEvent } from "@/lib/billing-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// KROK · รับผลการชำระเงินจาก Payment Gateway กลาง (server-to-server)
// - ตรวจลายเซ็น + เวลา (X-Gateway-Signature / X-Gateway-Timestamp)
// - กันประมวลผลซ้ำด้วย event id (payment_events.event_id unique)
// - payment.succeeded → apply_invoice_paid (ตรวจยอดเงิน + อัปเกรด/ต่ออายุแพ็กเกจแบบ atomic)
// - payment.failed / payment.expired → อัปเดตสถานะใบแจ้งหนี้
// ตอบ 2xx เมื่อรับเรื่องแล้ว (รวมกรณีซ้ำ/ข้อมูลไม่ตรงที่ลองใหม่ก็ไม่หาย) · 5xx = ให้ Gateway ส่งซ้ำ
// ============================================================

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function POST(req: Request) {
  const cfg = gatewayConfig();
  const admin = getAdminClient();
  if (!cfg || !admin) return json({ error: "billing not configured" }, 503);

  const raw = await req.text();
  if (raw.length > 64 * 1024) return json({ error: "payload too large" }, 413);
  const v = verifyGatewaySignature(cfg.webhookSecret, raw, req.headers.get("x-gateway-timestamp"), req.headers.get("x-gateway-signature"));
  if (!v.ok) return json({ error: `invalid signature (${v.reason})` }, 401);

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }
  const ev = parseGatewayEvent(parsed);
  if (!ev) return json({ error: "invalid payload" }, 400);

  // บันทึกเหตุการณ์ก่อน — event id ซ้ำ = เคยรับแล้ว
  const { data: logged, error: logErr } = await admin
    .from("payment_events")
    .insert({ event_id: ev.id, type: ev.type, gateway_ref: ev.data.payment_id, amount: ev.data.amount, payload: parsed as object })
    .select("id")
    .single();
  if (logErr) {
    if (logErr.code === "23505") return json({ ok: true, duplicate: true });
    return json({ error: "storage error" }, 500); // ให้ Gateway ส่งซ้ำ
  }
  const finish = async (result: string, status = 200) => {
    await admin.from("payment_events").update({ result }).eq("id", logged.id);
    return json({ ok: status < 300 && !result.startsWith("error"), result }, status);
  };

  const { data: inv } = await admin
    .from("invoices")
    .select("id, status, gateway_ref")
    .eq("id", ev.data.reference)
    .maybeSingle();
  if (!inv) return finish("ignored: unknown invoice");
  await admin.from("payment_events").update({ invoice_id: inv.id }).eq("id", logged.id);
  // ต้องเป็นคำขอชำระที่ KROK สร้างไว้สำหรับใบนี้
  if (inv.gateway_ref && inv.gateway_ref !== ev.data.payment_id) return finish("error: payment id does not match invoice");

  switch (ev.type) {
    case "payment.succeeded": {
      if (ev.data.currency !== "THB") return finish("error: currency " + ev.data.currency);
      if (!inv.gateway_ref) await admin.from("invoices").update({ gateway_ref: ev.data.payment_id }).eq("id", inv.id);
      const { data: result, error } = await admin.rpc("apply_invoice_paid", {
        p_invoice: inv.id, p_amount_satang: ev.data.amount, p_paid_at: ev.data.paid_at ?? new Date().toISOString(),
      });
      if (error) return finish("error: " + error.message.slice(0, 200), 500);
      return finish(String(result));
    }
    case "payment.failed":
      if (inv.status === "pending") await admin.from("invoices").update({ status: "failed" }).eq("id", inv.id);
      return finish("ok");
    case "payment.expired":
    case "payment.cancelled":
      if (inv.status === "pending" || inv.status === "failed") await admin.from("invoices").update({ status: "void" }).eq("id", inv.id);
      return finish("ok");
    default:
      return finish("ignored: " + ev.type.slice(0, 60));
  }
}
