// เมทาดาทาผู้ให้บริการชำระเงิน — ใช้ร่วมกันทั้ง client (ฟอร์ม) และ server (validate/แสดงผล)
// ไม่มี server-only ที่นี่ เพราะต้อง import จากฝั่ง client ได้

export type PaymentProviderId = "stripe" | "omise" | "2c2p" | "promptpay";

export interface PaymentField {
  key: string;
  label: string;
  secret: boolean; // true = ปิดบัง (เก็บ server, โชว์แค่ 4 ตัวท้าย); false = โชว์ได้
  placeholder?: string;
}

export interface PaymentProviderMeta {
  id: PaymentProviderId;
  name: string;
  hint: string;
  fields: PaymentField[];
}

export const PAYMENT_PROVIDERS: PaymentProviderMeta[] = [
  {
    id: "stripe",
    name: "Stripe",
    hint: "บัตรเครดิต/เดบิตสากล",
    fields: [
      { key: "secret_key", label: "Secret key", secret: true, placeholder: "sk_live_..." },
      { key: "webhook_secret", label: "Webhook secret", secret: true, placeholder: "whsec_..." },
    ],
  },
  {
    id: "omise",
    name: "Omise",
    hint: "เจ้าไทย รองรับ PromptPay/บัตร",
    fields: [
      { key: "public_key", label: "Public key", secret: false, placeholder: "pkey_..." },
      { key: "secret_key", label: "Secret key", secret: true, placeholder: "skey_..." },
    ],
  },
  {
    id: "2c2p",
    name: "2C2P",
    hint: "gateway ไทย/อาเซียน",
    fields: [
      { key: "merchant_id", label: "Merchant ID", secret: false, placeholder: "764..." },
      { key: "secret_key", label: "Secret key", secret: true, placeholder: "วางคีย์ที่นี่" },
    ],
  },
  {
    id: "promptpay",
    name: "PromptPay",
    hint: "โอนพร้อมเพย์ / QR",
    fields: [
      { key: "promptpay_id", label: "หมายเลขพร้อมเพย์ (เบอร์/เลขบัตร)", secret: false, placeholder: "0812345678" },
    ],
  },
];

export const PAYMENT_PROVIDER_IDS = PAYMENT_PROVIDERS.map((p) => p.id);

// รูปแบบข้อมูลที่ส่งให้ client (ปิดบัง secret แล้ว)
export interface ProviderClientView {
  enabled: boolean;
  values: Record<string, string>; // เฉพาะฟิลด์ไม่ลับ
  secretSet: Record<string, boolean>; // ฟิลด์ลับที่มีค่าแล้ว
  secretLast4: Record<string, string>; // 4 ตัวท้ายของฟิลด์ลับ
}
