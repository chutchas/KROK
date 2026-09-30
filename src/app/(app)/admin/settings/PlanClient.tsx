"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import { PLAN_ORDER, UNLIMITED, type AiCredits, type Plan, type PlanKey, type PlanOverrides } from "@/lib/plans";
import { AI_PURPOSES, PURPOSE_LABELS, type AiPurpose } from "@/lib/ai-purpose";
import { savePlanSettings } from "./actions";

type QuotaField = "maxForms" | "maxMembers" | "maxWorkspaces";
const QUOTA_FIELDS: { key: QuotaField; label: string }[] = [
  { key: "maxForms", label: "จำนวนฟอร์ม" },
  { key: "maxMembers", label: "จำนวนผู้ใช้" },
  { key: "maxWorkspaces", label: "จำนวน Workspace" },
];

interface Row {
  name: string; nameEn: string; priceThb: number;
  maxForms: number; maxMembers: number; maxWorkspaces: number;
  aiCredits: AiCredits;
}

export default function PlanClient({ plans, configured }: { plans: Record<PlanKey, Plan>; configured: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<PlanKey, Row>>(() => {
    const init = {} as Record<PlanKey, Row>;
    for (const k of PLAN_ORDER) {
      const p = plans[k];
      init[k] = {
        name: p.name, nameEn: p.nameEn,
        priceThb: p.priceThb, maxForms: p.maxForms,
        maxMembers: p.maxMembers, maxWorkspaces: p.maxWorkspaces,
        aiCredits: { ...p.aiCredits },
      };
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  function set(k: PlanKey, field: keyof Row, value: number | string) {
    setRows((s) => ({ ...s, [k]: { ...s[k], [field]: value } }));
  }

  function setCredit(k: PlanKey, purpose: AiPurpose, value: number) {
    setRows((s) => ({ ...s, [k]: { ...s[k], aiCredits: { ...s[k].aiCredits, [purpose]: value } } }));
  }

  async function save() {
    setBusy(true); setMsg(null);
    const overrides: PlanOverrides = {};
    for (const k of PLAN_ORDER) overrides[k] = { ...rows[k] };
    const res = await savePlanSettings(overrides);
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setMsg({ t: "บันทึกแล้ว — ราคา/โควตามีผลกับทุก workspace ทันที" });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
        ตั้งราคาและโควตาของแต่ละแพ็กเกจ — มีผลกับการจำกัดการใช้งานและหน้าแผน/โควตาของทุก workspace (ติ๊ก “ไม่จำกัด” เพื่อปลดเพดาน)
        <br />
        <span style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>
          เครดิต AI แยกถังต่องาน — ใช้งานหน้างานจนหมดถังจะไม่ทำให้สร้างฟอร์มด้วย AI ไม่ได้
          · การสแกนบาร์โค้ด/QR ไม่ใช้เครดิต (ทำงานบนเครื่องผู้ใช้)
        </span>
      </p>

      {!configured && (
        <Notice kind="error">ต้องตั้ง env <code>SUPABASE_SERVICE_ROLE_KEY</code> ฝั่ง server ก่อน จึงจะบันทึกได้</Notice>
      )}

      {PLAN_ORDER.map((k) => {
        const p = plans[k];
        const r = rows[k];
        return (
          <Card key={k}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>{p.name}</b>
              <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>{p.nameEn}</span>
              {p.highlight && <span style={{ fontSize: ".68rem", fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 20, padding: "2px 8px" }}>แนะนำ</span>}
            </div>

            {/* ชื่อแพ็กเกจ + ราคา */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>ชื่อแพ็กเกจ (ไทย)</label>
                <Field value={r.name} onChange={(e) => set(k, "name", e.target.value)} placeholder={p.name} />
              </div>
              <div>
                <label style={labelStyle}>ชื่อแพ็กเกจ (EN)</label>
                <Field value={r.nameEn} onChange={(e) => set(k, "nameEn", e.target.value)} placeholder={p.nameEn} />
              </div>
              <div>
                <label style={labelStyle}>ราคา (บาท / เดือน)</label>
                <Field type="number" min={0} value={String(r.priceThb)}
                  onChange={(e) => set(k, "priceThb", Math.max(0, parseInt(e.target.value || "0", 10) || 0))} />
              </div>
            </div>

            {/* โควตา */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {QUOTA_FIELDS.map((qf) => {
                const val = r[qf.key];
                const unlimited = val >= UNLIMITED;
                return (
                  <div key={qf.key}>
                    <label style={labelStyle}>{qf.label}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Field type="number" min={0} value={unlimited ? "" : String(val)} disabled={unlimited}
                          placeholder={unlimited ? "ไม่จำกัด" : ""}
                          onChange={(e) => set(k, qf.key, Math.max(0, parseInt(e.target.value || "0", 10) || 0))} />
                      </div>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".8rem", color: "var(--ink-2)", whiteSpace: "nowrap", cursor: "pointer" }}>
                        <input type="checkbox" checked={unlimited} style={{ accentColor: "var(--accent)" }}
                          onChange={(e) => set(k, qf.key, e.target.checked ? UNLIMITED : (qf.key === "maxForms" ? 10 : 50))} />
                        ไม่จำกัด
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* เครดิต AI แยกต่องาน */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600, fontSize: ".9rem", marginBottom: 2 }}>เครดิต AI / เดือน (แยกต่องาน)</div>
              <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" }}>
                รวม {Object.values(r.aiCredits).reduce((a, b) => a + b, 0).toLocaleString()} ครั้ง/เดือน
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {AI_PURPOSES.map((purpose) => {
                  const val = r.aiCredits[purpose];
                  const unlimited = val >= UNLIMITED;
                  return (
                    <div key={purpose}>
                      <label style={labelStyle}>{PURPOSE_LABELS[purpose]}</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Field type="number" min={0} value={unlimited ? "" : String(val)} disabled={unlimited}
                            placeholder={unlimited ? "ไม่จำกัด" : ""}
                            onChange={(e) => setCredit(k, purpose, Math.max(0, parseInt(e.target.value || "0", 10) || 0))} />
                        </div>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".8rem", color: "var(--ink-2)", whiteSpace: "nowrap", cursor: "pointer" }}>
                          <input type="checkbox" checked={unlimited} style={{ accentColor: "var(--accent)" }}
                            onChange={(e) => setCredit(k, purpose, e.target.checked ? UNLIMITED : 100)} />
                          ไม่จำกัด
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      <div>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกทุกแพ็กเกจ"}</Button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", display: "block", marginBottom: 4 };
