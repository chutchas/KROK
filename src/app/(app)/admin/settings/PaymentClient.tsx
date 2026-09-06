"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Lock, CreditCard } from "lucide-react";
import { PAYMENT_PROVIDERS, type PaymentProviderMeta, type ProviderClientView, type PaymentProviderId } from "@/lib/payment-meta";
import { savePaymentProvider } from "./actions";

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 46, height: 26, borderRadius: 999, border: "1px solid var(--line)", cursor: disabled ? "default" : "pointer",
        background: on ? "var(--accent)" : "var(--surface-4)", position: "relative", transition: "background .15s", flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
      }} />
    </button>
  );
}

function ProviderCard({ meta, view }: { meta: PaymentProviderMeta; view: ProviderClientView }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(view.enabled);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...view.values }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  function setVal(k: string, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  async function save(nextEnabled: boolean) {
    setBusy(true); setMsg(null);
    const res = await savePaymentProvider({ provider: meta.id, enabled: nextEnabled, values });
    setBusy(false);
    if ("error" in res) {
      setMsg({ t: res.error, err: true });
      setEnabled(view.enabled); // ย้อนสวิตช์กลับถ้าเซฟไม่ผ่าน
      return;
    }
    // เคลียร์ช่อง secret ที่เพิ่งกรอก (จะโชว์เป็น ••••last4 หลัง refresh)
    setValues((s) => {
      const c = { ...s };
      for (const f of meta.fields) if (f.secret) delete c[f.key];
      return c;
    });
    setMsg({ t: nextEnabled ? "บันทึกแล้ว — เปิดใช้งาน (ลูกค้าจะเห็นช่องทางนี้)" : "บันทึกแล้ว" });
    router.refresh();
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.05rem" }}>{meta.name}</b>
          <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".8rem", marginTop: 2 }}>{meta.hint}</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: ".82rem", color: enabled ? "var(--accent)" : "var(--ink-3)", fontWeight: 600 }}>
            {enabled ? "เปิดใช้งาน" : "ปิดอยู่"}
          </span>
          <Toggle on={enabled} disabled={busy} onClick={() => { const n = !enabled; setEnabled(n); save(n); }} />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {meta.fields.map((f) => (
          <div key={f.key}>
            <label style={{ fontWeight: 600, fontSize: ".85rem", display: "block", marginBottom: 4 }}>{f.label}</label>
            <Field
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              value={values[f.key] ?? ""}
              onChange={(e) => setVal(f.key, e.target.value)}
              placeholder={
                f.secret && view.secretSet[f.key]
                  ? `ตั้งค่าไว้แล้ว ••••${view.secretLast4[f.key]} (เว้นว่างเพื่อคงเดิม)`
                  : f.placeholder || ""
              }
            />
          </div>
        ))}
      </div>

      {meta.fields.some((f) => f.secret) && (
        <p style={{ color: "var(--ink-3)", fontSize: ".76rem", margin: "8px 0 0", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> คีย์ลับเก็บฝั่ง server เท่านั้น (เห็นได้แค่ 4 ตัวท้าย)
        </p>
      )}

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <div style={{ marginTop: 14 }}>
        <Button variant="primary" onClick={() => save(enabled)} disabled={busy}>
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>
    </Card>
  );
}

export default function PaymentClient({
  views,
  configured,
}: {
  views: Record<PaymentProviderId, ProviderClientView>;
  configured: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Icon icon={CreditCard} className="h-4 w-4" /> ตั้งค่าช่องทางรับชำระเงินระดับแพลตฟอร์ม — เปิดช่องทางไหน ลูกค้าทุก workspace จะเห็นช่องทางนั้นในหน้าแผน/โควตา
      </p>

      {!configured && (
        <Notice kind="error">
          ต้องตั้ง env <code>SUPABASE_SERVICE_ROLE_KEY</code> ฝั่ง server ก่อน หน้านี้จึงบันทึก/อ่านคีย์ได้
        </Notice>
      )}

      {PAYMENT_PROVIDERS.map((p) => (
        <ProviderCard key={p.id} meta={p} view={views[p.id]} />
      ))}
    </div>
  );
}
