import "server-only";
// ============================================================
// KROK · เชื่อม Payment Gateway กลางของบริษัท (สัญญา API: claude/billing-gateway-contract.md)
// env (ฝั่ง server เท่านั้น):
//   PAYMENT_GATEWAY_URL            เช่น https://pay.company.co.th
//   PAYMENT_GATEWAY_API_KEY        KROK → Gateway (Authorization: Bearer)
//   PAYMENT_GATEWAY_WEBHOOK_SECRET Gateway → KROK (ลายเซ็น callback)
//   PAYMENTS_LIVE=1                เปิดขายแพ็กเกจเสียเงินจริง (ไม่ตั้ง = ล็อก แม้ตั้งค่าอื่นครบ)
// ============================================================

export interface GatewayConfig { url: string; apiKey: string; webhookSecret: string }

export function gatewayConfig(): GatewayConfig | null {
  const url = process.env.PAYMENT_GATEWAY_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY?.trim();
  const webhookSecret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET?.trim();
  if (!url || !apiKey || !webhookSecret || !/^https?:\/\//.test(url)) return null;
  return { url, apiKey, webhookSecret };
}

/** เปิดรับชำระจริงหรือยัง */
export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_LIVE === "1" && !!gatewayConfig();
}

export interface CheckoutInput {
  invoiceId: string;
  invoiceNumber: string | null;
  amountThb: number;
  description: string;
  customer: { email: string | null; name: string | null };
  returnUrl: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface CheckoutResult { paymentId: string; checkoutUrl: string; expiresAt: string | null }

/** สร้างคำขอชำระเงินที่ Gateway → ได้ลิงก์หน้าชำระ (QR / บัตร / pay-in) */
export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const cfg = gatewayConfig();
  if (!cfg) throw new Error("ยังไม่ได้ตั้งค่า Payment Gateway");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${cfg.url}/v1/payment-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        "Idempotency-Key": input.invoiceId, // กดซ้ำ/ลองใหม่ = ได้คำขอเดิม ไม่สร้างซ้ำ
      },
      body: JSON.stringify({
        reference: input.invoiceId,
        amount: Math.round(input.amountThb * 100), // สตางค์
        currency: "THB",
        description: input.description,
        customer: input.customer,
        return_url: input.returnUrl,
        callback_url: input.callbackUrl,
        expires_in: 86400,
        metadata: { app: "krok", ...input.metadata },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Gateway ตอบ ${res.status}${typeof body.error === "string" ? `: ${body.error.slice(0, 120)}` : ""}`);
    const id = typeof body.id === "string" ? body.id : "";
    const url = typeof body.checkout_url === "string" ? body.checkout_url : "";
    if (!id || !/^https:\/\//.test(url)) throw new Error("Gateway ตอบรูปแบบไม่ถูกต้อง");
    return { paymentId: id, checkoutUrl: url, expiresAt: typeof body.expires_at === "string" ? body.expires_at : null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Gateway ไม่ตอบกลับ (timeout)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
