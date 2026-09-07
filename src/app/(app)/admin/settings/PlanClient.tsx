"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import { PLAN_ORDER, UNLIMITED, type Plan, type PlanKey, type PlanOverrides } from "@/lib/plans";
import { savePlanSettings } from "./actions";

type QuotaField = "maxForms" | "aiCreditsPerMonth" | "maxMembers" | "maxWorkspaces";
const QUOTA_FIELDS: { key: QuotaField; label: string }[] = [
  { key: "maxForms", label: "จำนวนฟอร์ม" },
  { key: "aiCreditsPerMonth", label: "เครดิต AI / เดือน" },
  { key: "maxMembers", label: "จำนวนผู้ใช้" },
  { key: "maxWorkspaces", label: "จำนวน Workspace" },
];

interface Row { priceThb: number; maxForms: number; aiCreditsPerMonth: number; maxMembers: number; maxWorkspaces: number }

export default function PlanClient({ plans, configured }: { plans: Record<PlanKey, Plan>; configured: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<PlanKey, Row>>(() => {
    const init = {} as Record<PlanKey, Row>;
    for (const k of PLAN_ORDER) {
      const p = plans[k];
      init[k] = {
        priceThb: p.priceThb, maxForms: p.maxForms, aiCreditsPerMonth: p.aiCreditsPerMonth,
        maxMembers: p.maxMembers, maxWorkspaces: p.maxWorkspaces,
      };
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  function set(k: PlanKey, field: keyof Row, value: number) {
    setRows((s) => ({ ...s, [k]: { ...s[k], [field]: value } }));
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

            {/* ราคา */}
            <div style={{ marginBottom: 12, maxWidth: 260 }}>
              <label style={labelStyle}>ราคา (บาท / เดือน)</label>
              <Field type="number" min={0} value={String(r.priceThb)}
                onChange={(e) => set(k, "priceThb", Math.max(0, parseInt(e.target.value || "0", 10) || 0))} />
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
