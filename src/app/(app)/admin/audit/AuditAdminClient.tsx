"use client";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { ScrollText, Filter, X } from "lucide-react";

export interface AuditRow {
  id: number;
  created_at: string;
  tenant_id: string | null;
  tenant_name: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  meta: Record<string, unknown>;
}
export interface Facet {
  tenants: { id: string; label: string }[];
  users: { id: string; label: string }[];
  forms: { id: string; label: string }[];
  actions: string[];
}
type Filters = { tenant: string; actor: string; form: string; action: string };

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function AuditAdminClient({ rows, facets, filters }: { rows: AuditRow[]; facets: Facet; filters: Filters }) {
  const router = useRouter();

  function setParam(key: keyof Filters, value: string) {
    const next = { ...filters, [key]: value };
    const qs = new URLSearchParams();
    (Object.keys(next) as (keyof Filters)[]).forEach((k) => { if (next[k]) qs.set(k, next[k]); });
    router.push(`/admin/audit${qs.toString() ? "?" + qs.toString() : ""}`);
  }
  const hasFilter = filters.tenant || filters.actor || filters.form || filters.action;

  const sel: React.CSSProperties = {
    padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", minWidth: 0, flex: "1 1 180px", maxWidth: 260,
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: "100%", minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ScrollText} className="h-5 w-5" /> Audit ทั้งระบบ
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          บันทึกเหตุการณ์สำคัญทุก workspace — กรองตาม workspace / ผู้ใช้ / ฟอร์ม / ประเภทการกระทำ (แสดง 300 รายการล่าสุด)
        </p>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: ".85rem" }}>
            <Icon icon={Filter} className="h-4 w-4" /> กรอง:
          </span>
          <select style={sel} value={filters.tenant} onChange={(e) => setParam("tenant", e.target.value)}>
            <option value="">ทุก workspace</option>
            {facets.tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select style={sel} value={filters.actor} onChange={(e) => setParam("actor", e.target.value)}>
            <option value="">ทุกผู้ใช้</option>
            {facets.users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <select style={sel} value={filters.form} onChange={(e) => setParam("form", e.target.value)}>
            <option value="">ทุกฟอร์ม</option>
            {facets.forms.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select style={sel} value={filters.action} onChange={(e) => setParam("action", e.target.value)}>
            <option value="">ทุกการกระทำ</option>
            {facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasFilter && (
            <button onClick={() => router.push("/admin/audit")} className="inline-flex items-center gap-1.5"
              style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
              <Icon icon={X} className="h-4 w-4" /> ล้างตัวกรอง
            </button>
          )}
        </div>

        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".86rem", minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>เวลา</th>
                <th style={{ padding: "8px 10px" }}>Workspace</th>
                <th style={{ padding: "8px 10px" }}>ผู้ใช้</th>
                <th style={{ padding: "8px 10px" }}>การกระทำ</th>
                <th style={{ padding: "8px 10px" }}>เป้าหมาย / รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "20px 10px", color: "var(--ink-3)", textAlign: "center" }}>ไม่พบรายการ</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{fmt(r.created_at)}</td>
                  <td style={{ padding: "8px 10px" }}>{r.tenant_name}</td>
                  <td style={{ padding: "8px 10px" }}>{r.actor_name}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <code style={{ background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 7px", fontSize: ".78rem" }}>{r.action}</code>
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--ink-2)", minWidth: 220 }}>
                    {r.target_label && <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.target_label}</div>}
                    {r.target_type && <span style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{r.target_type}{r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}</span>}
                    {r.meta && Object.keys(r.meta).length > 0 && (
                      <div style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 2, wordBreak: "break-word" }}>
                        {Object.entries(r.meta).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
