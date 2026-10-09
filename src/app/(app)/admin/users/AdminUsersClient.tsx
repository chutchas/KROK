"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, Notice, Pill, Button, EmptyState } from "@/components/ui";
import Icon from "@/components/Icon";
import { Crown, Code2, UserRound, Package, Trash2 } from "lucide-react";
import { useAdminT as useT } from "@/i18n/ns/admin";
import { setPlatformRole, removeFromWorkspace, setUserPlan, resetUserMfa, previewUserDeletion, deleteUserAccount } from "./actions";
import { confirmDialog } from "@/components/dialogs";

type PlatformRole = "platform_admin" | "developer" | "user";
export interface SysUser {
  userId: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  /** แพ็กเกจของบัญชี — ใช้ร่วมทุก workspace ที่เป็นเจ้าของ */
  plan: string;
  /** billing = ผู้ใช้นี้เป็นเจ้าของบัญชีของ workspace นี้ (นับโควตาเข้าบัญชีนี้) */
  workspaces: { tenantId: string; tenantName: string; role: string; roleKey: string; billing: boolean }[];
  createdAt: string;
}

const PR_ICON = { platform_admin: Crown, developer: Code2, user: UserRound } as const;

type DeletionPreview = Extract<Awaited<ReturnType<typeof previewUserDeletion>>, { plan: unknown }>;

export interface PlanOpt { key: string; name: string; priceThb: number; visible: boolean }

export default function AdminUsersClient({ users, meId, plans = [] }: { users: SysUser[]; meId: string; plans?: PlanOpt[] }) {
  const router = useRouter();
  const { t, tt } = useT();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** แผงยืนยันการลบผู้ใช้ — เปิดได้ทีละคน */
  const [del, setDel] = useState<(DeletionPreview & { userId: string }) | null>(null);
  const [delEmail, setDelEmail] = useState("");

  const prLabel = (r: PlatformRole) =>
    r === "platform_admin" ? t("admin.prAdmin") : r === "developer" ? t("admin.prDev") : t("admin.prUser");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s)
      || u.workspaces.some((w) => w.tenantName.toLowerCase().includes(s)) || planName(u.plan).toLowerCase().includes(s) || u.plan.includes(s));
  }, [q, users]); // eslint-disable-line react-hooks/exhaustive-deps

  function planName(key: string) {
    return plans.find((p) => p.key === key)?.name ?? key;
  }

  async function changePlan(u: SysUser, plan: string) {
    const who = u.name || u.email || "ผู้ใช้";
    const n = u.workspaces.filter((w) => w.billing).length;
    if (!(await confirmDialog({ message: tt("admin.planConfirm", { who, plan: planName(plan), n }) }))) return;
    setBusy(u.userId);
    const res = await setUserPlan(u.userId, plan);
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else { setMsg({ t: tt("admin.planSaved", { who, plan: planName(plan) }) }); router.refresh(); }
  }

  const sel: React.CSSProperties = {
    padding: "7px 10px", border: "1px solid var(--line-strong)", borderRadius: 8, background: "var(--surface)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: ".85rem",
  };

  async function changeRole(u: SysUser, role: PlatformRole) {
    setBusy(u.userId);
    const res = await setPlatformRole(u.userId, role);
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else { setMsg({ t: t("admin.saved") }); router.refresh(); }
  }

  async function openDelete(u: SysUser) {
    setBusy(u.userId);
    const res = await previewUserDeletion(u.userId);
    setBusy(null);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setMsg(null);
    setDelEmail("");
    setDel({ ...res, userId: u.userId });
  }

  async function confirmDelete(u: SysUser) {
    if (!del) return;
    setBusy(u.userId);
    const res = await deleteUserAccount(u.userId, delEmail);
    setBusy(null);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setDel(null);
    setMsg({ t: tt("admin.deleted", { who: u.name || del.email }) });
    router.refresh();
  }

  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.platformRole === "platform_admin").length,
    devs: users.filter((u) => u.platformRole === "developer").length,
  }), [users]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("admin.usersTitle")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("admin.usersSub")}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 12 }}>
        <Stat v={counts.total} label={t("admin.statUsers")} />
        <Stat v={counts.admins} label={t("admin.statAdmins")} />
        <Stat v={counts.devs} label={t("admin.statDevs")} />
      </div>

      <Card>
        <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.search")} style={{ marginBottom: 12 }} />
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((u) => (
            <div key={u.userId} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={PR_ICON[u.platformRole]} className="h-[18px] w-[18px]" />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b style={{ fontSize: ".95rem" }}>{u.name || u.email || "ผู้ใช้"} {u.userId === meId && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>({t("admin.you")})</span>}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>{u.email}</small>
                </div>
                {plans.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} title={t("admin.planHint")}>
                    <span style={{ fontSize: ".72rem", color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}><Icon icon={Package} className="h-3.5 w-3.5" />{t("admin.plan")}</span>
                    <select value={u.plan} disabled={busy === u.userId} aria-label={t("admin.plan")} onChange={(e) => changePlan(u, e.target.value)} style={sel}>
                      {!plans.some((p) => p.key === u.plan) && <option value={u.plan}>{u.plan}</option>}
                      {plans.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} · {p.priceThb > 0 ? `฿${p.priceThb.toLocaleString()}` : t("admin.planFree")}{p.visible ? "" : ` (${t("admin.planHidden")})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Button
                  onClick={async () => {
                    if (!(await confirmDialog({ message: t("mfa.adminResetConfirm"), danger: true }))) return;
                    setBusy(u.userId);
                    const res = await resetUserMfa(u.userId);
                    setBusy(null);
                    setMsg("error" in res ? { t: res.error, err: true } : { t: t("mfa.adminResetDone") });
                  }}
                  disabled={busy === u.userId}
                  style={{ padding: "5px 10px", fontSize: ".78rem" }}
                >
                  {t("mfa.adminReset")}
                </Button>
                {u.userId !== meId && (
                  <Button
                    variant="danger"
                    onClick={() => (del?.userId === u.userId ? setDel(null) : openDelete(u))}
                    disabled={busy === u.userId || u.platformRole === "platform_admin"}
                    title={u.platformRole === "platform_admin" ? t("admin.deleteAdminHint") : undefined}
                    style={{ padding: "5px 10px", fontSize: ".78rem", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Icon icon={Trash2} className="h-3.5 w-3.5" />{t("admin.deleteUser")}
                  </Button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{t("admin.platformRole")}</span>
                  <select value={u.platformRole} disabled={busy === u.userId} onChange={(e) => changeRole(u, e.target.value as PlatformRole)} style={sel}>
                    <option value="platform_admin">{prLabel("platform_admin")}</option>
                    <option value="developer">{prLabel("developer")}</option>
                    <option value="user">{prLabel("user")}</option>
                  </select>
                </div>
              </div>

              {del?.userId === u.userId && (
                <DeletePanel
                  who={u.name || del.email}
                  preview={del}
                  email={delEmail}
                  onEmail={setDelEmail}
                  busy={busy === u.userId}
                  onCancel={() => setDel(null)}
                  onConfirm={() => confirmDelete(u)}
                />
              )}

              {u.workspaces.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)", display: "grid", gap: 6 }}>
                  <div style={{ fontSize: ".72rem", color: "var(--ink-3)", fontWeight: 600 }}>{t("admin.memberOf")}</div>
                  {u.workspaces.map((w) => (
                    <div key={w.tenantId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", flexWrap: "wrap" }}>
                      <span style={{ flex: 1, minWidth: 120 }}>{w.tenantName}</span>
                      {w.billing ? (
                        <span style={{ fontSize: ".72rem", color: "var(--accent-text)" }}>{t("admin.billingWs")}</span>
                      ) : (
                        <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{t("admin.otherOwnerWs")}</span>
                      )}
                      <Pill kind={w.roleKey === "owner" ? "pass" : "na"}>{w.roleKey}</Pill>
                      {w.roleKey !== "owner" && (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!(await confirmDialog({ message: t("admin.removeConfirm"), danger: true }))) return;
                            setBusy(u.userId);
                            const res = await removeFromWorkspace(u.userId, w.tenantId);
                            setBusy(null);
                            if ("error" in res) setMsg({ t: res.error, err: true });
                            else router.refresh();
                          }}
                          style={{ padding: "5px 10px", fontSize: ".78rem" }}
                        >
                          {t("admin.removeFromWs")}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <EmptyState icon={<Icon icon={UserRound} className="h-7 w-7" />} title={t("admin.noneFound")} />}
        </div>
      </Card>
    </div>
  );
}

function DeletePanel({ who, preview, email, onEmail, busy, onCancel, onConfirm }: {
  who: string; preview: DeletionPreview; email: string; onEmail: (v: string) => void;
  busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const { t, tt } = useT();
  const { plan } = preview;
  const blocked = plan.blockers.length > 0;
  const empty = !plan.deleteTenants.length && !plan.leaveTenants.length && !blocked;
  const matches = !!preview.email && email.trim().toLowerCase() === preview.email.toLowerCase();
  const list = (title: string, items: { tenantId: string; name: string; members?: number }[]) =>
    items.length > 0 && (
      <div>
        {title && <div style={{ fontSize: ".76rem", color: "var(--ink-3)", fontWeight: 600, marginBottom: 2 }}>{title}</div>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".85rem" }}>
          {items.map((w) => <li key={w.tenantId}>{w.name}{w.members != null && ` · ${tt("admin.deleteMembers", { n: w.members })}`}</li>)}
        </ul>
      </div>
    );
  return (
    <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--fail)", borderRadius: 10, display: "grid", gap: 10 }}>
      <b style={{ fontSize: ".9rem", color: "var(--fail)" }}>{tt("admin.deleteTitle", { who })}</b>
      {blocked && <Notice kind="error">{t("admin.deleteBlocked")}</Notice>}
      {list("", plan.blockers)}
      {list(t("admin.deleteWsGone"), plan.deleteTenants)}
      {list(t("admin.deleteWsLeave"), plan.leaveTenants)}
      {list(t("admin.deletePlanDrop"), plan.planDrops)}
      {empty && <div style={{ fontSize: ".85rem", color: "var(--ink-2)" }}>{t("admin.deleteNothing")}</div>}
      {!blocked && (
        <Field
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder={tt("admin.deleteTypeEmail", { email: preview.email })}
          aria-label={tt("admin.deleteTypeEmail", { email: preview.email })}
          autoComplete="off"
        />
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={busy} style={{ padding: "5px 12px", fontSize: ".82rem" }}>{t("admin.cancel")}</Button>
        {!blocked && (
          <Button variant="danger" onClick={onConfirm} disabled={busy || !matches} style={{ padding: "5px 12px", fontSize: ".82rem" }}>
            {t("admin.deleteConfirmBtn")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ v, label }: { v: number; label: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.6rem", fontWeight: 700 }}>{v}</div>
      <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}
