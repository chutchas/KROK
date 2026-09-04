"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import { inviteMember, cancelInvite, changeRole, removeMember } from "./actions";
import { useT } from "@/i18n/LanguageProvider";

type Role = "owner" | "admin" | "designer" | "operator";
export interface Member {
  user_id: string;
  role: Role;
  email: string | null;
  name: string | null;
  created_at: string;
}
export interface Invite {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "เจ้าของ",
  admin: "แอดมิน",
  designer: "ออกแบบฟอร์ม",
  operator: "หน้างาน",
};
const ROLE_HINT: Record<Role, string> = {
  owner: "จัดการทุกอย่าง รวมถึงสมาชิกและองค์กร",
  admin: "จัดการฟอร์ม สมาชิก และอนุมัติได้",
  designer: "สร้าง/แก้ฟอร์ม และอนุมัติได้",
  operator: "กรอกฟอร์มและดู dashboard",
};
const ASSIGNABLE: Role[] = ["admin", "designer", "operator"];

export default function TeamClient({
  me,
  myRole,
  tenantName,
  members,
  invites,
}: {
  me: string;
  myRole: Role;
  tenantName: string;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const { tt } = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const canOwner = myRole === "owner";

  async function doInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await inviteMember(email, role);
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setMsg({ t: `เชิญ ${email} แล้ว — ให้เขาสมัครด้วยอีเมลนี้ที่หน้าเข้าสู่ระบบ แล้วจะเข้าองค์กรอัตโนมัติ` });
      setEmail("");
      router.refresh();
    }
  }

  const selstyle: React.CSSProperties = {
    padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8,
    background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".95rem",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{tt("team.title", { name: tenantName })}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>จัดการสมาชิกและสิทธิ์การใช้งาน</p>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>เชิญสมาชิกใหม่</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>
          พิมพ์อีเมลและเลือกสิทธิ์ — เมื่อเขาสมัครด้วยอีเมลนี้ จะเข้าองค์กรให้อัตโนมัติ
        </p>
        <form onSubmit={doInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Field type="email" placeholder="อีเมลของสมาชิก" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1, minWidth: 200 }} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={selstyle}>
            {(canOwner ? (["admin", "designer", "operator", "owner"] as Role[]) : ASSIGNABLE).map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <Button variant="primary" type="submit" disabled={busy}>{busy ? "กำลังเชิญ..." : "เชิญ"}</Button>
        </form>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "8px 0 0" }}>สิทธิ์ {ROLE_LABEL[role]}: {ROLE_HINT[role]}</p>
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>

      {invites.length > 0 && (
        <Card>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>คำเชิญที่รอตอบรับ</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {invites.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: ".92rem" }}>{inv.email}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>สิทธิ์ {ROLE_LABEL[inv.role]} · รอสมัคร</small>
                </div>
                <Button variant="danger" onClick={async () => { await cancelInvite(inv.id); router.refresh(); }}>ยกเลิก</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>สมาชิก ({members.length})</h2>
        <div style={{ display: "grid", gap: 4 }}>
          {members.map((m) => {
            const isMe = m.user_id === me;
            const canEditThis = m.role === "owner" ? canOwner : true;
            return (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>👷</div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b style={{ fontSize: ".92rem" }}>{m.name || m.email || "สมาชิก"} {isMe && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(คุณ)</span>}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{m.email}</small>
                </div>
                {canEditThis && !isMe ? (
                  <select
                    defaultValue={m.role}
                    onChange={async (e) => {
                      const r = e.target.value as Role;
                      const res = await changeRole(m.user_id, r);
                      if ("error" in res) { alert(res.error); router.refresh(); }
                      else router.refresh();
                    }}
                    style={selstyle}
                  >
                    {(canOwner ? (["owner", "admin", "designer", "operator"] as Role[]) : ASSIGNABLE).map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: ".82rem", color: "var(--ink-2)", padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 20 }}>{ROLE_LABEL[m.role]}</span>
                )}
                {!isMe && canEditThis && (
                  <Button variant="danger" onClick={async () => {
                    if (!confirm(`นำ ${m.name || m.email} ออกจากองค์กร?`)) return;
                    const res = await removeMember(m.user_id);
                    if ("error" in res) alert(res.error);
                    else router.refresh();
                  }}>นำออก</Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
