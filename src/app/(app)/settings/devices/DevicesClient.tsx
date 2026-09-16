"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, EmptyState } from "@/components/ui";
import Icon from "@/components/Icon";
import { TabletSmartphone, Check, Ban, Trash2, Pencil, ShieldCheck, Clock, Grid3x3, Users } from "lucide-react";
import { deleteDevice, renameDevice, setDeviceStatus, setFormDeviceScope, toggleFormDevice, type DeviceStatus } from "./actions";

export interface DeviceRow {
  id: string;
  name: string;
  status: DeviceStatus;
  platform: string;
  firstUserName: string;
  approvedAt: string | null;
  lastSeenAt: string | null;
}

const STATUS_LABEL: Record<DeviceStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  revoked: "เพิกถอน",
};
const STATUS_COLOR: Record<DeviceStatus, string> = {
  pending: "var(--amber)",
  approved: "var(--pass)",
  revoked: "var(--fail)",
};

function fmtTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export interface LockedForm {
  id: string;
  title: string;
  icon: string;
  scope: "any" | "selected";
}

export default function DevicesClient({
  rows,
  lockedForms,
  linked,
}: {
  rows: DeviceRow[];
  lockedForms: LockedForm[];
  /** คู่ที่ผูกกันอยู่ รูปแบบ "<formId>:<deviceId>" */
  linked: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [err, setErr] = useState("");

  async function run(id: string, fn: () => Promise<{ ok: true } | { error: string }>) {
    setBusy(id);
    setErr("");
    try {
      const res = await fn();
      if ("error" in res) setErr(res.error);
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7,
    border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)",
    cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem",
  };

  const row = (d: DeviceRow) => (
    <div
      key={d.id}
      style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--surface)" }}
    >
      <Icon icon={TabletSmartphone} className="h-5 w-5" />
      <div style={{ flex: 1, minWidth: 180 }}>
        {editing === d.id ? (
          <div style={{ display: "flex", gap: 6 }}>
            <Field value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ flex: 1 }} maxLength={80} />
            <Button
              variant="primary"
              style={{ fontSize: ".8rem" }}
              onClick={async () => { await run(d.id, () => renameDevice(d.id, draftName)); setEditing(null); }}
            >
              บันทึก
            </Button>
            <Button style={{ fontSize: ".8rem" }} onClick={() => setEditing(null)}>ยกเลิก</Button>
          </div>
        ) : (
          <>
            <b style={{ fontFamily: "var(--font-anuphan)" }}>{d.name}</b>
            <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>
              {[d.platform, d.firstUserName && `ลงทะเบียนโดย ${d.firstUserName}`].filter(Boolean).join(" · ") || "—"}
            </div>
            <div style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>
              ใช้งานล่าสุด {fmtTime(d.lastSeenAt)}
            </div>
          </>
        )}
      </div>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".78rem", color: STATUS_COLOR[d.status], border: `1px solid ${STATUS_COLOR[d.status]}`, borderRadius: 999, padding: "3px 10px" }}>
        <Icon icon={d.status === "approved" ? ShieldCheck : d.status === "pending" ? Clock : Ban} className="h-3.5 w-3.5" />
        {STATUS_LABEL[d.status]}
      </span>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {d.status !== "approved" && (
          <button disabled={busy === d.id} onClick={() => run(d.id, () => setDeviceStatus(d.id, "approved"))} style={{ ...btn, color: "var(--pass)", borderColor: "var(--pass)" }}>
            <Icon icon={Check} className="h-3.5 w-3.5" /> อนุมัติ
          </button>
        )}
        {d.status === "approved" && (
          <button disabled={busy === d.id} onClick={() => run(d.id, () => setDeviceStatus(d.id, "revoked"))} style={{ ...btn, color: "var(--fail)" }}>
            <Icon icon={Ban} className="h-3.5 w-3.5" /> เพิกถอน
          </button>
        )}
        <button disabled={busy === d.id} onClick={() => { setEditing(d.id); setDraftName(d.name); }} style={btn}>
          <Icon icon={Pencil} className="h-3.5 w-3.5" /> เปลี่ยนชื่อ
        </button>
        <button
          disabled={busy === d.id}
          onClick={() => { if (confirm(`ลบ “${d.name}” ออกจากทะเบียน? เครื่องนี้จะต้องขออนุมัติใหม่`)) void run(d.id, () => deleteDevice(d.id)); }}
          style={{ ...btn, color: "var(--fail)" }}
        >
          <Icon icon={Trash2} className="h-3.5 w-3.5" /> ลบ
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <h1 style={{ fontSize: "1.15rem", margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={TabletSmartphone} className="h-5 w-5" /> อุปกรณ์
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 4 }}>
          ทะเบียนเครื่องที่ใช้กรอกฟอร์ม — ฟอร์มที่เปิด “เฉพาะเครื่องที่อนุมัติแล้ว” จะกรอกได้จากเครื่องในรายการนี้ที่สถานะ <b>อนุมัติแล้ว</b> เท่านั้น
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", marginTop: 6 }}>
          หมายเหตุ: ตัวตนของเครื่องผูกกับข้อมูลในเบราว์เซอร์ — ถ้าล้างข้อมูลเบราว์เซอร์หรือใช้โหมดส่วนตัว เครื่องจะต้องขออนุมัติใหม่
        </p>

        {err && <p style={{ color: "var(--fail)", fontSize: ".85rem", marginTop: 10 }}>{err}</p>}
      </Card>

      <MatrixCard
        devices={rows.filter((d) => d.status === "approved")}
        forms={lockedForms}
        linked={linked}
        onError={setErr}
      />

      {pending.length > 0 && (
        <Card>
          <h2 style={{ fontSize: "1rem", margin: "0 0 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon icon={Clock} className="h-4 w-4" /> รออนุมัติ ({pending.length})
          </h2>
          <div style={{ display: "grid", gap: 8 }}>{pending.map(row)}</div>
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>เครื่องทั้งหมด ({others.length})</h2>
        {others.length === 0 ? (
          <EmptyState
            icon={<Icon icon={TabletSmartphone} className="h-8 w-8" strokeWidth={1.5} />}
            title="ยังไม่มีเครื่องในทะเบียน"
            hint="เครื่องจะเข้ามาอยู่ในรายการนี้อัตโนมัติเมื่อมีคนเปิดฟอร์มที่ล็อคเครื่องเป็นครั้งแรก"
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>{others.map(row)}</div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Matrix: เครื่อง × ฟอร์มที่ล็อค
// คอลัมน์ = ฟอร์ม (สลับ "ทุกเครื่อง / เฉพาะที่เลือก" ได้จากหัวคอลัมน์)
// แถว     = เครื่องที่อนุมัติแล้ว
// ============================================================
function MatrixCard({
  devices,
  forms,
  linked,
  onError,
}: {
  devices: DeviceRow[];
  forms: LockedForm[];
  linked: string[];
  onError: (s: string) => void;
}) {
  const router = useRouter();
  const [links, setLinks] = useState<Set<string>>(() => new Set(linked));
  const [scopes, setScopes] = useState<Record<string, "any" | "selected">>(() =>
    Object.fromEntries(forms.map((f) => [f.id, f.scope]))
  );
  const [busy, setBusy] = useState<string | null>(null);

  if (forms.length === 0)
    return (
      <Card>
        <h2 style={{ fontSize: "1rem", margin: "0 0 6px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon icon={Grid3x3} className="h-4 w-4" /> เครื่อง × ฟอร์ม
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", margin: 0 }}>
          ยังไม่มีฟอร์มที่เปิด “เฉพาะเครื่องที่อนุมัติแล้ว” — เปิดได้ที่หน้าแก้ฟอร์มใน <b>สร้างฟอร์ม</b>
        </p>
      </Card>
    );

  async function toggleCell(formId: string, deviceId: string) {
    const key = `${formId}:${deviceId}`;
    const on = !links.has(key);
    setBusy(key);
    onError("");
    try {
      const res = await toggleFormDevice(formId, deviceId, on);
      if ("error" in res) { onError(res.error); return; }
      setLinks((prev) => {
        const next = new Set(prev);
        if (on) next.add(key); else next.delete(key);
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  async function switchScope(formId: string, scope: "any" | "selected") {
    setBusy(formId);
    onError("");
    try {
      const res = await setFormDeviceScope(formId, scope);
      if ("error" in res) { onError(res.error); return; }
      setScopes((prev) => ({ ...prev, [formId]: scope }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", textAlign: "center", verticalAlign: "bottom", minWidth: 132 };
  const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", textAlign: "center" };

  return (
    <Card>
      <h2 style={{ fontSize: "1rem", margin: "0 0 4px", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon icon={Grid3x3} className="h-4 w-4" /> เครื่อง × ฟอร์ม
      </h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>
        ฟอร์มที่ตั้งเป็น <b>เฉพาะเครื่องที่เลือก</b> จะกรอกได้จากเครื่องที่ติ๊กไว้ในคอลัมน์นั้นเท่านั้น — เครื่องที่อนุมัติแล้วแต่ไม่ได้ติ๊ก จะเปิดฟอร์มไม่ได้
      </p>

      {devices.length === 0 ? (
        <EmptyState
          icon={<Icon icon={TabletSmartphone} className="h-8 w-8" strokeWidth={1.5} />}
          title="ยังไม่มีเครื่องที่อนุมัติแล้ว"
          hint="อนุมัติเครื่องด้านบนก่อน แล้วค่อยเลือกว่าเครื่องไหนใช้ฟอร์มไหนได้"
        />
      ) : (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: ".85rem" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 180, position: "sticky", left: 0, background: "var(--surface)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--ink-2)" }}>
                    <Icon icon={Users} className="h-3.5 w-3.5" /> เครื่อง
                  </span>
                </th>
                {forms.map((f) => {
                  const scope = scopes[f.id] || "any";
                  return (
                    <th key={f.id} style={th}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.icon} {f.title}</div>
                      <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 7, overflow: "hidden" }}>
                        {([
                          { v: "any" as const, label: "ทุกเครื่อง" },
                          { v: "selected" as const, label: "เลือกเอง" },
                        ]).map((opt, i) => {
                          const on = scope === opt.v;
                          return (
                            <button
                              key={opt.v}
                              disabled={busy === f.id}
                              onClick={() => switchScope(f.id, opt.v)}
                              style={{
                                padding: "4px 9px", border: "none", borderLeft: i === 0 ? "none" : "1px solid var(--line)",
                                cursor: "pointer", fontFamily: "inherit", fontSize: ".74rem", fontWeight: on ? 600 : 400,
                                background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-3)",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...td, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)" }}>
                    <b style={{ fontFamily: "var(--font-anuphan)" }}>{d.name}</b>
                    {d.platform && <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{d.platform}</div>}
                  </td>
                  {forms.map((f) => {
                    const scope = scopes[f.id] || "any";
                    const key = `${f.id}:${d.id}`;
                    if (scope === "any")
                      return (
                        <td key={f.id} style={{ ...td, color: "var(--ink-3)", fontSize: ".78rem" }} title="ฟอร์มนี้รับทุกเครื่องที่อนุมัติแล้ว">
                          ทุกเครื่อง
                        </td>
                      );
                    return (
                      <td key={f.id} style={td}>
                        <input
                          type="checkbox"
                          checked={links.has(key)}
                          disabled={busy === key}
                          onChange={() => toggleCell(f.id, d.id)}
                          style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }}
                          aria-label={`${d.name} × ${f.title}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
