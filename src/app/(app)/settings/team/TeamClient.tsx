"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, AsyncButton, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { HardHat, Tag, Mail, Link2, Check } from "lucide-react";
import { inviteMember, resendInvite, type InviteResult, cancelInvite, changeRoleKey, removeMember, createTeam, deleteTeam, setTeamMembers } from "./actions";
import { useT } from "@/i18n/LanguageProvider";
import { alertDialog, confirmDialog } from "@/components/dialogs";
import type { MessageKey } from "@/i18n/dictionaries";

type Role = "owner" | "admin" | "designer" | "operator";
export interface RoleOption { key: string; name: string; canManage: boolean }
export interface Member {
  user_id: string;
  role: Role;
  role_key: string | null;
  email: string | null;
  name: string | null;
  created_at: string;
}
export interface Invite {
  id: string;
  email: string;
  role: Role;
  role_key: string | null;
  team_ids?: string[] | null;
  created_at: string;
  /** อีเมลนี้มีบัญชี KROK แล้ว (รอกดเข้าร่วม ไม่ใช่รอสมัคร) */
  hasAccount?: boolean;
}
export interface Team {
  id: string;
  name: string;
  memberIds: string[];
}

const ROLE_LABEL: Record<Role, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  designer: "role.designer",
  operator: "role.operator",
};

export default function TeamClient({
  me,
  myRole,
  tenantName,
  members,
  invites,
  teams,
  roleOptions,
}: {
  me: string;
  myRole: Role;
  tenantName: string;
  members: Member[];
  invites: Invite[];
  teams: Team[];
  roleOptions: RoleOption[];
}) {
  const router = useRouter();
  const { t, tt } = useT();
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<string>("user");
  const [msg, setMsg] = useState<{ t: string; err?: boolean; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteTeams, setInviteTeams] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name;

  /** ข้อความผลการเชิญ/ส่งซ้ำ: ส่งอีเมลแล้ว หรือบันทึกแล้วแต่ส่งไม่สำเร็จ (ให้คัดลอกลิงก์ส่งเอง) */
  function inviteMsg(res: InviteResult, to: string): { t: string; err?: boolean; link?: string } {
    if ("error" in res) return { t: res.error, err: true };
    if (res.emailed) return { t: tt("team.invitedEmailed", { email: to }), link: res.link };
    return { t: res.notConfigured ? tt("team.invitedNoEmailSetup", { email: to }) : tt("team.invitedEmailFail", { email: to, err: res.emailError || "" }), err: !res.notConfigured, link: res.link };
  }
  async function copyLink(link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(link); setTimeout(() => setCopied(null), 2000); } catch { await alertDialog(link); }
  }

  const canOwner = myRole === "owner";
  const inviteOptions = canOwner ? roleOptions : roleOptions.filter((r) => r.key !== "owner");
  const selectedRoleName = roleOptions.find((r) => r.key === roleKey)?.name || roleKey;

  async function doInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await inviteMember(email, roleKey, inviteTeams);
    setBusy(false);
    setMsg(inviteMsg(res, email));
    if (!("error" in res)) {
      setEmail("");
      setInviteTeams([]);
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
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("team.subtitle")}</p>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("team.inviteTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>
          {t("team.inviteSub")}
        </p>
        <form onSubmit={doInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Field type="email" placeholder={t("team.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1, minWidth: 200 }} />
          <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} aria-label={t("team.inviteRoleSel")} style={selstyle}>
            {inviteOptions.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
          <Button variant="primary" type="submit" loading={busy}>{t("team.invite")}</Button>
        </form>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "8px 0 0" }}>{t("team.roleToGet")} <b>{selectedRoleName}</b></p>
        {teams.length > 0 && (
          // ทีม/แผนก (ไม่บังคับ) — เลือกได้หลายทีม ใส่ให้อัตโนมัติเมื่อรับคำเชิญ
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("team.inviteTeams")} <span style={{ color: "var(--ink-3)" }}>({t("team.optional")})</span></div>
            <div role="group" aria-label={t("team.inviteTeams")} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((tm) => {
                const on = inviteTeams.includes(tm.id);
                return (
                  <button key={tm.id} type="button" aria-pressed={on}
                    onClick={() => setInviteTeams((cur) => (on ? cur.filter((x) => x !== tm.id) : [...cur, tm.id]))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: ".84rem",
                      border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 400 }}>
                    {on ? <Icon icon={Check} className="h-3.5 w-3.5" /> : <Icon icon={Tag} className="h-3.5 w-3.5" />} {tm.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {msg && (
          <Notice kind={msg.err ? "error" : "info"}>
            {msg.t}
            {msg.link && (
              <button type="button" onClick={() => copyLink(msg.link!)}
                style={{ marginLeft: 8, border: "none", background: "none", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", padding: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Icon icon={copied === msg.link ? Check : Link2} className="h-3.5 w-3.5" /> {copied === msg.link ? t("team.linkCopied") : t("team.copyLink")}
              </button>
            )}
          </Notice>
        )}
      </Card>

      {invites.length > 0 && (
        <Card>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>{t("team.pending")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {invites.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <b style={{ fontSize: ".92rem" }}>{inv.email}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>
                    {tt(inv.hasAccount ? "team.inviteRoleHasAccount" : "team.inviteRole", { role: roleOptions.find((r) => r.key === inv.role_key)?.name || t(ROLE_LABEL[inv.role]) })}
                    {(inv.team_ids || []).map(teamName).filter(Boolean).length > 0 && <> · {t("team.inviteTeamsShort")}: {(inv.team_ids || []).map(teamName).filter(Boolean).join(", ")}</>}
                  </small>
                </div>
                <AsyncButton onClick={async () => { setMsg(inviteMsg(await resendInvite(inv.id), inv.email)); }} title={t("team.resend")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon icon={Mail} className="h-4 w-4" /> {t("team.resend")}</span>
                </AsyncButton>
                <AsyncButton variant="danger" onClick={async () => { await cancelInvite(inv.id); router.refresh(); }}>{t("common.cancel")}</AsyncButton>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>{tt("team.members", { n: members.length })}</h2>
        <div style={{ display: "grid", gap: 4 }}>
          {members.map((m) => {
            const isMe = m.user_id === me;
            const curKey = m.role_key || (m.role === "operator" ? "user" : m.role);
            const canEditThis = curKey === "owner" ? canOwner : true;
            const roleName = roleOptions.find((r) => r.key === curKey)?.name || curKey;
            const options = canOwner ? roleOptions : roleOptions.filter((r) => r.key !== "owner");
            return (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)" }}><Icon icon={HardHat} className="h-[18px] w-[18px]" /></div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b style={{ fontSize: ".92rem" }}>{m.name || m.email || t("team.memberFallback")} {isMe && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("team.you")}</span>}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{m.email}</small>
                </div>
                {canEditThis && !isMe ? (
                  <select
                    aria-label={tt("team.roleOf", { name: m.name || m.email || t("team.memberFallback") })}
                    defaultValue={curKey}
                    onChange={async (e) => {
                      const v = e.target.value;
                      let res = await changeRoleKey(m.user_id, v);
                      if ("needConfirm" in res) {
                        const s = res.needConfirm;
                        if (await confirmDialog({ message: tt("team.planShift", { from: s.from, to: s.to, owner: s.nextOwner }), confirmLabel: t("common.confirm"), danger: true }))
                          res = await changeRoleKey(m.user_id, v, true);
                      }
                      if ("error" in res) await alertDialog(res.error);
                      router.refresh();
                    }}
                    style={selstyle}
                  >
                    {options.map((r) => (
                      <option key={r.key} value={r.key}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: ".82rem", color: "var(--ink-2)", padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 20 }}>{roleName}</span>
                )}
                {!isMe && canEditThis && (
                  <AsyncButton variant="danger" onClick={async () => {
                    if (!(await confirmDialog({ message: tt("team.removeConfirm", { name: m.name || m.email || "" }), confirmLabel: t("team.remove"), danger: true }))) return;
                    let res = await removeMember(m.user_id);
                    if ("needConfirm" in res) {
                      const s = res.needConfirm;
                      if (!(await confirmDialog({ message: tt("team.planShift", { from: s.from, to: s.to, owner: s.nextOwner }), confirmLabel: t("common.confirm"), danger: true }))) return;
                      res = await removeMember(m.user_id, true);
                    }
                    if ("error" in res) await alertDialog(res.error);
                    else router.refresh();
                  }}>{t("team.remove")}</AsyncButton>
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
    return m?.name || m?.email || t("team.memberFallback");
  }

  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // ยังไม่ใส่ชื่อ: กดได้ แต่บอกเหตุผล + โฟกัสช่องชื่อ (เดิมปุ่มกดไม่ได้เฉย ๆ ไม่รู้ว่าทำไม)
    if (!newName.trim()) { setNameErr(true); nameRef.current?.focus(); return; }
    setBusy(true);
    const res = await createTeam(newName);
    setBusy(false);
    if ("error" in res) { await alertDialog(res.error); return; }
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
    if ("error" in res) { await alertDialog(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("team.teamsTitle")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("team.teamsSub")}</p>

      <form onSubmit={add} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Field ref={nameRef} value={newName} onChange={(e) => { setNewName(e.target.value); setNameErr(false); }} placeholder={t("team.teamNamePlaceholder")} aria-label={t("team.teamNamePlaceholder")}
          aria-invalid={nameErr || undefined} aria-describedby={nameErr ? "team-name-err" : undefined} style={{ flex: 1, minWidth: 200 }} />
        <Button variant="primary" type="submit" disabled={busy}>{t("team.addTeam")}</Button>
        {nameErr && <span id="team-name-err" role="alert" style={{ flexBasis: "100%", fontSize: ".8rem", color: "var(--fail)" }}>{t("team.nameRequired")}</span>}
      </form>

      {teams.length === 0 && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{t("team.noTeams")}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {teams.map((team) => (
          <div key={team.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)" }}><Icon icon={Tag} className="h-4 w-4" /></div>
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
                      if (!(await confirmDialog({ message: t("team.deleteTeamConfirm"), danger: true }))) return;
                      const res = await deleteTeam(team.id);
                      if ("error" in res) await alertDialog(res.error);
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
                      {m.name || m.email || t("team.memberFallback")}
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
