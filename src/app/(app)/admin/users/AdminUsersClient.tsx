"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, Notice, Pill, Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { Crown, Code2, UserRound } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { setPlatformRole, removeFromWorkspace } from "./actions";

type PlatformRole = "platform_admin" | "developer" | "user";
export interface SysUser {
  userId: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  workspaces: { tenantId: string; tenantName: string; role: string; roleKey: string }[];
  createdAt: string;
}

const PR_ICON = { platform_admin: Crown, developer: Code2, user: UserRound } as const;

export default function AdminUsersClient({ users, meId }: { users: SysUser[]; meId: string }) {
  const router = useRouter();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const prLabel = (r: PlatformRole) =>
    r === "platform_admin" ? t("admin.prAdmin") : r === "developer" ? t("admin.prDev") : t("admin.prUser");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s) || u.workspaces.some((w) => w.tenantName.toLowerCase().includes(s)));
  }, [q, users]);

  const sel: React.CSSProperties = {
    padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: ".85rem",
  };

  async function changeRole(u: SysUser, role: PlatformRole) {
    setBusy(u.userId);
    const res = await setPlatformRole(u.userId, role);
    setBusy(null);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else { setMsg({ t: t("admin.saved") }); router.refresh(); }
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
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
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={PR_ICON[u.platformRole]} className="h-[18px] w-[18px]" />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b style={{ fontSize: ".95rem" }}>{u.name || u.email || "ผู้ใช้"} {u.userId === meId && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>({t("admin.you")})</span>}</b>
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>{u.email}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{t("admin.platformRole")}</span>
                  <select value={u.platformRole} disabled={busy === u.userId} onChange={(e) => changeRole(u, e.target.value as PlatformRole)} style={sel}>
                    <option value="platform_admin">{prLabel("platform_admin")}</option>
                    <option value="developer">{prLabel("developer")}</option>
                    <option value="user">{prLabel("user")}</option>
                  </select>
                </div>
              </div>

              {u.workspaces.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)", display: "grid", gap: 6 }}>
                  <div style={{ fontSize: ".72rem", color: "var(--ink-3)", fontWeight: 600 }}>{t("admin.memberOf")}</div>
                  {u.workspaces.map((w) => (
                    <div key={w.tenantId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", flexWrap: "wrap" }}>
                      <span style={{ flex: 1, minWidth: 120 }}>{w.tenantName}</span>
                      <Pill kind={w.roleKey === "owner" ? "pass" : "na"}>{w.roleKey}</Pill>
                      {w.roleKey !== "owner" && (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!confirm(t("admin.removeConfirm"))) return;
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
          {filtered.length === 0 && <span style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{t("admin.noneFound")}</span>}
        </div>
      </Card>
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
