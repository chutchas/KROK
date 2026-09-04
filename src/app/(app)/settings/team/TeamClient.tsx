"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { HardHat, Tag } from "lucide-react";
import { inviteMember, cancelInvite, changeRole, removeMember, createTeam, deleteTeam, setTeamMembers } from "./actions";
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
export interface Team {
  id: string;
  name: string;
  memberIds: string[];
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
  teams,
}: {
  me: string;
  myRole: Role;
  tenantName: string;
  members: Member[];
  invites: Invite[];
  teams: Team[];
}) {
  const router = useRouter();
  const { t, tt } = useT();
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
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon icon={HardHat} className="h-[18px] w-[18px]" /></div>
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

      <TeamsSection teams={teams} members={members} router={router} t={t} />
    </div>
  );
}

function TeamsSection({
  teams,
  members,
  router,
  t,
}: {
  teams: Team[];
  members: Member[];
  router: ReturnType<typeof useRouter>;
  t: (k: import("@/i18n/dictionaries").MessageKey) => string;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  function nameOf(uid: string) {
    const m = members.find((x) => x.user_id === uid);
    return m?.name || m?.email || "สมาชิก";
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    const res = await createTeam(newName);
    setBusy(false);
    if ("error" in res) { alert(res.error); return; }
    setNewName("");
    router.refresh();
  }

  function startEdit(team: Team) {
    setEditing(team.id);
    setDraftIds([...team.memberIds]);
  }

  async function saveMembers(teamId: string) {
    setBusy(true);
    const res = await setTeamMembers(teamId, draftIds);
    setBusy(false);
    if ("error" in res) { alert(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("team.teamsTitle")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("team.teamsSub")}</p>

      <form onSubmit={add} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Field value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("team.teamNamePlaceholder")} style={{ flex: 1, minWidth: 200 }} />
        <Button variant="primary" type="submit" disabled={busy || !newName.trim()}>{t("team.addTeam")}</Button>
      </form>

      {teams.length === 0 && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{t("team.noTeams")}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {teams.map((team) => (
          <div key={team.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon icon={Tag} className="h-4 w-4" /></div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <b style={{ fontSize: ".95rem" }}>{team.name}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{tt2(t("team.memberCount"), team.memberIds.length)}</small>
              </div>
              {editing === team.id ? (
                <>
                  <Button variant="primary" onClick={() => saveMembers(team.id)} disabled={busy}>{t("common.save")}</Button>
                  <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                </>
              ) : (
                <>
                  <Button onClick={() => startEdit(team)}>{t("team.editMembers")}</Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(t("team.deleteTeamConfirm"))) return;
                      const res = await deleteTeam(team.id);
                      if ("error" in res) alert(res.error);
                      else router.refresh();
                    }}
                  >
                    {t("team.deleteTeam")}
                  </Button>
                </>
              )}
            </div>

            {editing === team.id ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)", display: "grid", gap: 6 }}>
                {members.map((m) => {
                  const on = draftIds.includes(m.user_id);
                  return (
                    <label key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".9rem" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setDraftIds((ids) => (e.target.checked ? [...ids, m.user_id] : ids.filter((x) => x !== m.user_id)))
                        }
                        style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
                      />
                      {m.name || m.email || "สมาชิก"}
                    </label>
                  );
                })}
              </div>
            ) : (
              team.memberIds.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {team.memberIds.map((uid) => (
                    <span key={uid} style={{ fontSize: ".78rem", color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 20, padding: "3px 10px" }}>
                      {nameOf(uid)}
                    </span>
                  ))}
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function tt2(template: string, n: number) {
  return template.replace("{n}", String(n));
}
