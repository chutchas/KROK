"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { ShieldCheck, Lock, Trash2, Plus } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { MENUS, type MenuKey } from "@/lib/menus";
import { createRole, updateRole, deleteRole } from "./actions";

export interface RoleRow {
  key: string;
  name: string;
  canManage: boolean;
  menus: string[];
  isSystem: boolean;
  memberCount: number;
}

export default function RolesClient({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const { t } = useT();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newManage, setNewManage] = useState(false);
  const [newMenus, setNewMenus] = useState<MenuKey[]>(["forms", "dashboard"]);

  function menuLabel(k: MenuKey) {
    const d = MENUS.find((m) => m.key === k);
    return d ? t(d.labelKey) : k;
  }

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await createRole(newName, newManage, newMenus);
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setCreating(false); setNewName(""); setNewManage(false); setNewMenus(["forms", "dashboard"]);
    router.refresh();
  }

  async function toggleMenu(r: RoleRow, k: MenuKey) {
    const has = r.menus.includes(k);
    const next = has ? r.menus.filter((x) => x !== k) : [...r.menus, k];
    setBusy(true);
    const res = await updateRole(r.key, { menus: next });
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else router.refresh();
  }

  async function toggleManage(r: RoleRow) {
    setBusy(true);
    const res = await updateRole(r.key, { canManage: !r.canManage });
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("roles.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("roles.subtitle")}</p>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <Card>
        {creating ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Field value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("roles.namePlaceholder")} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".9rem", cursor: "pointer" }}>
              <input type="checkbox" checked={newManage} onChange={(e) => setNewManage(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
              {t("roles.canManage")}
            </label>
            <div>
              <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("roles.menusLabel")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MENUS.map((m) => {
                  const on = newMenus.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => setNewMenus((s) => (on ? s.filter((x) => x !== m.key) : [...s, m.key]))}
                      style={{ padding: "6px 11px", borderRadius: 20, fontSize: ".8rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
                      {menuLabel(m.key)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={add} disabled={busy || !newName.trim()}>{t("roles.create")}</Button>
              <Button onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setCreating(true)}><Icon icon={Plus} className="h-4 w-4" /> {t("roles.addRole")}</Button>
        )}
      </Card>

      <div style={{ display: "grid", gap: 12 }}>
        {roles.map((r) => {
          const owner = r.key === "owner";
          return (
            <Card key={r.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={owner ? Lock : ShieldCheck} className="h-4 w-4" />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b style={{ fontSize: "1rem" }}>{r.name}</b>
                  {r.isSystem && <span style={{ fontSize: ".7rem", color: "var(--ink-3)", marginLeft: 6 }}>{t("roles.system")}</span>}
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{t("roles.memberCount").replace("{n}", String(r.memberCount))}</small>
                </div>
                {r.canManage ? <Pill kind="pass">{t("roles.manages")}</Pill> : <Pill kind="na">{t("roles.limited")}</Pill>}
                {!r.isSystem && (
                  <Button variant="danger" onClick={async () => { if (!confirm(t("roles.deleteConfirm"))) return; setBusy(true); const res = await deleteRole(r.key); setBusy(false); if ("error" in res) setMsg({ t: res.error, err: true }); else router.refresh(); }} style={{ padding: "6px 10px" }}>
                    <Icon icon={Trash2} className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {owner ? (
                <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: 0 }}>{t("roles.ownerNote")}</p>
              ) : (
                <>
                  {!r.isSystem || r.key === "admin" ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", cursor: "pointer", marginBottom: 10 }}>
                      <input type="checkbox" checked={r.canManage} disabled={busy} onChange={() => toggleManage(r)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                      {t("roles.canManage")}
                    </label>
                  ) : null}
                  <div style={{ fontSize: ".8rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("roles.menusLabel")}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {MENUS.map((m) => {
                      const on = r.menus.includes(m.key);
                      return (
                        <button key={m.key} type="button" disabled={busy} onClick={() => toggleMenu(r, m.key)}
                          style={{ padding: "6px 11px", borderRadius: 20, fontSize: ".8rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
                          {menuLabel(m.key)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
