"use client";
// ============================================================
// KROK · ตั้งค่าแพ็กเกจ (Platform Admin) — สร้าง/แก้/ซ่อน/เรียง/ลบ แพ็กเกจ
// บันทึกแล้วมีผลทันที: หน้าแผน/โควตาของลูกค้า · หน้า home · การบังคับโควตาฝั่ง DB
// ============================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Star, Trash2 } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Card, Field, Notice } from "@/components/ui";
import { confirmDialog } from "@/components/dialogs";
import { PLAN_KEY_RE, UNLIMITED, blankPlan, fmtLimit, type NumLimit, type FlagLimit, type Plan } from "@/lib/plans";
import { AI_PURPOSES, PURPOSE_LABELS, type AiPurpose } from "@/lib/ai-purpose";
import { savePlanCatalog } from "./actions";

type Group = { title: string; nums: { key: NumLimit; label: string; hint?: string }[]; flags?: { key: FlagLimit; label: string }[] };

const GROUPS: Group[] = [
  {
    title: "การใช้งานหลัก",
    nums: [
      { key: "maxForms", label: "จำนวนฟอร์ม" },
      { key: "maxMembers", label: "จำนวนผู้ใช้" },
      { key: "maxWorkspaces", label: "จำนวน Workspace" },
      { key: "maxSubmissionsMonth", label: "ส่งฟอร์ม / เดือน" },
      { key: "storageMb", label: "พื้นที่ไฟล์ (MB)", hint: "1 GB = 1024 MB" },
      { key: "auditDays", label: "ประวัติการใช้งาน (วัน)" },
    ],
  },
  {
    title: "ถังข้อมูล",
    nums: [
      { key: "maxDatasets", label: "จำนวนถังข้อมูล" },
      { key: "maxDatasetRows", label: "แถวต่อถัง", hint: "เพดานระบบ 200,000" },
    ],
  },
  {
    title: "การเชื่อมต่อ",
    flags: [{ key: "notify", label: "แจ้งเตือน LINE / อีเมล" }],
    nums: [
      { key: "maxWebhooks", label: "Webhook (เส้น)", hint: "0 = ใช้ไม่ได้" },
      { key: "maxIntakeForms", label: "API รับข้อมูล (ฟอร์ม)", hint: "0 = ใช้ไม่ได้" },
      { key: "maxDatasetApi", label: "ถังข้อมูลแบบ API", hint: "0 = ใช้ไม่ได้" },
    ],
  },
  {
    title: "งานและการอนุมัติ",
    flags: [{ key: "workflow", label: "ฟอร์มกรอกหลายคน (ส่งต่องาน)" }],
    nums: [
      { key: "maxApprovalSteps", label: "ขั้นอนุมัติสูงสุด" },
      { key: "maxDevices", label: "ล็อกอุปกรณ์ (เครื่อง)", hint: "0 = ใช้ไม่ได้" },
    ],
  },
];

export default function PlanClient({ plans, configured, tenantCounts = {} }: {
  plans: Plan[];
  configured: boolean;
  tenantCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Plan[]>(() => plans.map((p) => ({ ...p, aiCredits: { ...p.aiCredits } })));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [newKey, setNewKey] = useState("");
  const [copyFrom, setCopyFrom] = useState("pro");

  function patch(key: string, p: Partial<Plan>) {
    setRows((s) => s.map((r) => (r.key === key ? { ...r, ...p } : r)));
    setDirty(true);
  }
  function setCredit(key: string, purpose: AiPurpose, v: number) {
    setRows((s) => s.map((r) => (r.key === key ? { ...r, aiCredits: { ...r.aiCredits, [purpose]: v } } : r)));
    setDirty(true);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next.map((r, k) => ({ ...r, sort: (k + 1) * 10 })));
    setDirty(true);
  }
  function add() {
    const key = newKey.trim().toLowerCase();
    if (!PLAN_KEY_RE.test(key)) { setMsg({ t: "รหัสแพ็กเกจใช้ a-z, 0-9, -, _ ยาว 2–30 ตัว ขึ้นต้นด้วยตัวอักษร", err: true }); return; }
    if (rows.some((r) => r.key === key)) { setMsg({ t: `มีแพ็กเกจรหัส "${key}" แล้ว`, err: true }); return; }
    const src = rows.find((r) => r.key === copyFrom);
    const base = src ? { ...src, aiCredits: { ...src.aiCredits }, extras: [...src.extras], extrasEn: [...src.extrasEn] } : blankPlan(key);
    const p: Plan = { ...base, key, name: key, nameEn: key, builtin: false, visible: false, highlight: false, sort: (rows.length + 1) * 10 };
    setRows((s) => [...s, p]);
    setOpen(key);
    setNewKey("");
    setDirty(true);
    setMsg({ t: `เพิ่ม "${key}" แล้ว (ยังซ่อนอยู่) — ตั้งชื่อ/ราคา/โควตา แล้วเปิด "แสดงให้ลูกค้า" และกดบันทึก` });
  }
  async function remove(p: Plan) {
    if ((tenantCounts[p.key] ?? 0) > 0) { setMsg({ t: `มี ${tenantCounts[p.key]} บัญชีใช้แพ็กเกจนี้อยู่ — ซ่อนแทนการลบ`, err: true }); return; }
    if (!(await confirmDialog({ message: `ลบแพ็กเกจ "${p.name}"? (มีผลเมื่อกดบันทึก)`, danger: true }))) return;
    setRows((s) => s.filter((r) => r.key !== p.key));
    setDirty(true);
  }
  async function save() {
    setBusy(true); setMsg(null);
    const res = await savePlanCatalog(rows.map((r, i) => ({ ...r, sort: (i + 1) * 10 })));
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setDirty(false);
    setMsg({ t: "บันทึกแล้ว — มีผลกับหน้าแผน/โควตา หน้า home และการจำกัดการใช้งานทันที" });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
        สร้างและตั้งราคา/โควตาของแต่ละแพ็กเกจ — แพ็กเกจที่ “แสดงให้ลูกค้า” จะขึ้นในหน้าแผน/โควตาและหน้า home ทันทีที่บันทึก
        <br />
        <span style={{ color: "var(--ink-3)", fontSize: ".84rem" }}>
          แพ็กเกจผูกกับบัญชีผู้ใช้ — โควตานับรวมทุก workspace ที่บัญชีนั้นสร้าง · ของที่มีอยู่แล้วเกินโควตา “ใช้ต่อได้” บล็อกเฉพาะการเพิ่มใหม่ · แพ็กเกจที่ซ่อนยังใช้ได้กับบัญชีที่อยู่ในแพ็กเกจนั้น (กำหนดให้ได้ที่หน้าจัดการผู้ใช้)
        </span>
      </p>

      {!configured && <Notice kind="error">ต้องตั้ง env <code>SUPABASE_SERVICE_ROLE_KEY</code> ฝั่ง server ก่อน จึงจะบันทึกได้</Notice>}

      {rows.map((p, i) => {
        const isOpen = open === p.key;
        const users = tenantCounts[p.key] ?? 0;
        return (
          <Card key={p.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.key)} aria-expanded={isOpen}
                style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200, border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", textAlign: "left" }}>
                <span style={{ display: "inline-flex", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><Icon icon={ChevronDown} className="h-4 w-4" /></span>
                <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.08rem" }}>{p.name}</b>
                <code style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>{p.key}</code>
                <span style={{ color: "var(--accent-text)", fontWeight: 600, fontSize: ".88rem" }}>{p.priceThb > 0 ? `฿${p.priceThb.toLocaleString()}` : "ฟรี"}</span>
                {p.highlight && <Badge c="var(--accent)">แนะนำ</Badge>}
                {p.visible ? <Badge c="var(--pass)">แสดงให้ลูกค้า</Badge> : <Badge c="var(--ink-3)">ซ่อน</Badge>}
                <span style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>{users} บัญชี</span>
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                <IconBtn label="เลื่อนขึ้น" onClick={() => move(i, -1)} disabled={i === 0}><Icon icon={ArrowUp} className="h-4 w-4" /></IconBtn>
                <IconBtn label="เลื่อนลง" onClick={() => move(i, 1)} disabled={i === rows.length - 1}><Icon icon={ArrowDown} className="h-4 w-4" /></IconBtn>
                {p.key !== "free" && (
                  <IconBtn label={p.visible ? "ซ่อนจากลูกค้า" : "แสดงให้ลูกค้า"} onClick={() => patch(p.key, { visible: !p.visible })}>
                    <Icon icon={p.visible ? Eye : EyeOff} className="h-4 w-4" />
                  </IconBtn>
                )}
                {!p.builtin && <IconBtn label="ลบแพ็กเกจ" danger onClick={() => remove(p)}><Icon icon={Trash2} className="h-4 w-4" /></IconBtn>}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
                <div style={grid(180)}>
                  <L label="ชื่อแพ็กเกจ (ไทย)"><Field value={p.name} maxLength={40} onChange={(e) => patch(p.key, { name: e.target.value })} /></L>
                  <L label="ชื่อแพ็กเกจ (EN)"><Field value={p.nameEn} maxLength={40} onChange={(e) => patch(p.key, { nameEn: e.target.value })} /></L>
                  <L label="ราคา (บาท / เดือน)">
                    <Field type="number" min={0} value={String(p.priceThb)} onChange={(e) => patch(p.key, { priceThb: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} />
                  </L>
                  <L label="คำอธิบายสั้น (ไทย)"><Field value={p.desc} maxLength={80} onChange={(e) => patch(p.key, { desc: e.target.value })} placeholder="เช่น สำหรับทีมที่ใช้งานทุกวัน" /></L>
                  <L label="คำอธิบายสั้น (EN)"><Field value={p.descEn} maxLength={80} onChange={(e) => patch(p.key, { descEn: e.target.value })} /></L>
                  <L label="การแสดงผล">
                    <div style={{ display: "grid", gap: 6, paddingTop: 4 }}>
                      <Check on={p.visible || p.key === "free"} disabled={p.key === "free"} onChange={(v) => patch(p.key, { visible: v })}>แสดงให้ลูกค้าเห็น/เลือกได้</Check>
                      <Check on={!!p.highlight} onChange={(v) => patch(p.key, { highlight: v })}><Icon icon={Star} className="h-3.5 w-3.5" /> ป้าย “แนะนำ”</Check>
                    </div>
                  </L>
                </div>

                {GROUPS.map((g) => (
                  <div key={g.title} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: ".9rem", marginBottom: 8 }}>{g.title}</div>
                    {g.flags && (
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
                        {g.flags.map((f) => <Check key={f.key} on={p[f.key]} onChange={(v) => patch(p.key, { [f.key]: v } as Partial<Plan>)}>{f.label}</Check>)}
                      </div>
                    )}
                    <div style={grid(200)}>
                      {g.nums.map((n) => (
                        <Limit key={n.key} label={n.label} hint={n.hint} value={p[n.key]} onChange={(v) => patch(p.key, { [n.key]: v } as Partial<Plan>)} />
                      ))}
                    </div>
                  </div>
                ))}

                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: ".9rem" }}>เครดิต AI / เดือน (แยกต่องาน)</div>
                  <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "2px 0 10px" }}>
                    รวม {fmtLimit(Object.values(p.aiCredits).reduce((a, b) => a + b, 0))} ครั้ง/เดือน · การสแกนบาร์โค้ด/QR ไม่ใช้เครดิต
                  </p>
                  <div style={grid(200)}>
                    {AI_PURPOSES.map((k) => <Limit key={k} label={PURPOSE_LABELS[k]} value={p.aiCredits[k]} onChange={(v) => setCredit(p.key, k, v)} />)}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, ...grid(260) }}>
                  <L label="ข้อดีเพิ่มเติม (ไทย) — บรรทัดละข้อ">
                    <textarea value={p.extras.join("\n")} rows={3} onChange={(e) => patch(p.key, { extras: e.target.value.split("\n") })} style={ta} placeholder="เช่น ช่วยตั้งค่าระบบฟรี" />
                  </L>
                  <L label="ข้อดีเพิ่มเติม (EN)">
                    <textarea value={p.extrasEn.join("\n")} rows={3} onChange={(e) => patch(p.key, { extrasEn: e.target.value.split("\n") })} style={ta} />
                  </L>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon icon={Plus} className="h-4 w-4" /> เพิ่มแพ็กเกจใหม่</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <L label="รหัส (ภาษาอังกฤษ ใช้ภายใน เปลี่ยนไม่ได้)">
            <Field value={newKey} onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder="เช่น starter, enterprise" maxLength={30} />
          </L>
          <L label="คัดลอกค่าจาก">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={sel}>
              {rows.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              <option value="">(ค่าเริ่มต้น)</option>
            </select>
          </L>
          <Button onClick={add} disabled={!newKey.trim()}>เพิ่ม</Button>
        </div>
      </Card>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      <div style={{ position: "sticky", bottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <Button variant="primary" onClick={save} disabled={busy || !configured}>{busy ? "กำลังบันทึก..." : "บันทึกแพ็กเกจทั้งหมด"}</Button>
        {dirty && <span style={{ fontSize: ".82rem", color: "var(--amber, #b45309)", background: "var(--surface)", padding: "2px 8px", borderRadius: 8 }}>มีการแก้ไขที่ยังไม่บันทึก</span>}
      </div>
    </div>
  );
}

function Limit({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  const unlimited = value >= UNLIMITED;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field type="number" min={0} value={unlimited ? "" : String(value)} disabled={unlimited} placeholder={unlimited ? "ไม่จำกัด" : ""} aria-label={label}
            onChange={(e) => onChange(Math.max(0, Math.min(UNLIMITED - 1, parseInt(e.target.value || "0", 10) || 0)))} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".8rem", color: "var(--ink-2)", whiteSpace: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={unlimited} style={{ accentColor: "var(--accent)" }} onChange={(e) => onChange(e.target.checked ? UNLIMITED : 0)} />
          ไม่จำกัด
        </label>
      </div>
      {hint && <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ minWidth: 0 }}><label style={labelStyle}>{label}</label>{children}</div>;
}

function Check({ on, onChange, disabled, children }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: ".86rem", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.7 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{children}</span>
    </label>
  );
}

function Badge({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ fontSize: ".68rem", fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 20, padding: "1px 8px", whiteSpace: "nowrap" }}>{children}</span>;
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: danger ? "var(--fail)" : "var(--ink-2)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 });
const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: ".82rem", display: "block", marginBottom: 4, color: "var(--ink-2)" };
const ta: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", resize: "vertical" };
const sel: React.CSSProperties = { padding: "9px 11px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" };
