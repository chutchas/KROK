"use client";
import { roleLabel } from "@/lib/role-label";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { ShieldCheck, Lock, Trash2, Plus, Undo2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { ALWAYS_MENUS, MENUS as ALL_MENUS, type MenuKey } from "@/lib/menus";

// เมนูที่ทุกคนมีเสมอ (รายงาน) ไม่ให้ติ๊กเปิด/ปิดที่นี่
const MENUS = ALL_MENUS.filter((m) => !ALWAYS_MENUS.includes(m.key));
import { createRole, updateRole, deleteRole } from "./actions";
import { confirmDialog } from "@/components/dialogs";
import PageHeader from "@/components/PageHeader";

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
  const { t, tt } = useT();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newManage, setNewManage] = useState(false);
  const [newMenus, setNewMenus] = useState<MenuKey[]>(["forms", "dashboard"]);

  function menuLabel(k: MenuKey) {
    const d = ALL_MENUS.find((m) => m.key === k);
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

  // ชิปบันทึกทันที — บอกว่าบันทึกแล้ว + เลิกทำได้ 8 วินาที (เดิมเปลี่ยนเงียบ ๆ ย้อนไม่ได้)
  const [undo, setUndo] = useState<{ key: string; text: string; prev: { menus?: string[]; canManage?: boolean } } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);
  async function revert() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    setBusy(true);
    const res = await updateRole(u.key, u.prev);
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else router.refresh();
  }

  async function toggleMenu(r: RoleRow, k: MenuKey) {
    const has = r.menus.includes(k);
    const next = has ? r.menus.filter((x) => x !== k) : [...r.menus, k];
    setBusy(true);
    const res = await updateRole(r.key, { menus: next });
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setUndo({ key: r.key, prev: { menus: r.menus }, text: tt(has ? "roles.savedOff" : "roles.savedOn", { role: roleLabel(r.key, r.name, t), menu: menuLabel(k) }) });
    router.refresh();
  }

  async function toggleManage(r: RoleRow) {
    setBusy(true);
    const res = await updateRole(r.key, { canManage: !r.canManage });
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setUndo({ key: r.key, prev: { canManage: r.canManage }, text: tt(r.canManage ? "roles.savedManageOff" : "roles.savedManageOn", { role: roleLabel(r.key, r.name, t) }) });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader title={t("roles.title")} help="invite-roles" subtitle={t("roles.subtitle")} />

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <Card>
        {creating ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Field value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("roles.namePlaceholder")} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".9rem", cursor: "pointer", minHeight: 44 }}>
              <input type="checkbox" checked={newManage} onChange={(e) => setNewManage(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
              {t("roles.canManage")}
            </label>
            <div>
              <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("roles.menusLabel")} <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>· {t("roles.reportsAlways")}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MENUS.map((m) => {
                  const on = newMenus.includes(m.key);
                  return (
                    <button key={m.key} type="button" aria-pressed={on} onClick={() => setNewMenus((s) => (on ? s.filter((x) => x !== m.key) : [...s, m.key]))}
                      style={{ padding: "6px 12px", minHeight: 44, minWidth: 44, borderRadius: 22, fontSize: ".8rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
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
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={owner ? Lock : ShieldCheck} className="h-4 w-4" />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b style={{ fontSize: "1rem" }}>{roleLabel(r.key, r.name, t)}</b>
                  {r.isSystem && <span style={{ fontSize: ".7rem", color: "var(--ink-3)", marginLeft: 6 }}>{t("roles.system")}</span>}
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{t("roles.memberCount").replace("{n}", String(r.memberCount))}</small>
                </div>
                {r.canManage ? <Pill kind="pass">{t("roles.manages")}</Pill> : <Pill kind="na">{t("roles.limited")}</Pill>}
                {!r.isSystem && (
                  <Button variant="danger" onClick={async () => { if (!(await confirmDialog({ title: t("dlg.delRole"), message: t("roles.deleteConfirm"), confirmLabel: t("dlg.btn.delRole"), danger: true }))) return; setBusy(true); const res = await deleteRole(r.key); setBusy(false); if ("error" in res) setMsg({ t: res.error, err: true }); else router.refresh(); }} style={{ padding: "6px 10px" }}>
                    <Icon icon={Trash2} className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {owner ? (
                <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: 0 }}>{t("roles.ownerNote")}</p>
              ) : (
                <>
                  {!r.isSystem || r.key === "admin" ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", cursor: "pointer", marginBottom: 6, minHeight: 44 }}>
                      <input type="checkbox" checked={r.canManage} disabled={busy} onChange={() => toggleManage(r)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
                      {t("roles.canManage")}
                    </label>
                  ) : null}
                  <div style={{ fontSize: ".8rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("roles.menusLabel")} <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>· {t("roles.reportsAlways")}</span></div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {MENUS.map((m) => {
                      const on = r.menus.includes(m.key);
                      return (
                        <button key={m.key} type="button" aria-pressed={on} disabled={busy} onClick={() => toggleMenu(r, m.key)}
                          style={{ padding: "6px 12px", minHeight: 44, minWidth: 44, borderRadius: 22, fontSize: ".8rem", cursor: "pointer", fontFamily: "inherit", border: on ? "1px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500 }}>
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
      {undo && (
        <div role="status" className="no-print"
          style={{ position: "fixed", left: "50%", bottom: "calc(16px + max(var(--krok-tabbar-h), env(safe-area-inset-bottom)))", transform: "translateX(-50%)", zIndex: 70, display: "flex", alignItems: "center", gap: 12, maxWidth: "calc(100vw - 32px)",
            padding: "8px 8px 8px 16px", borderRadius: 12, background: "var(--ink)", color: "var(--surface)", boxShadow: "0 8px 24px rgba(0,0,0,.2)", fontSize: ".88rem" }}>
          <span>{undo.text}</span>
          <button type="button" onClick={() => void revert()} disabled={busy} className="inline-flex items-center gap-1.5"
            style={{ minHeight: 40, padding: "0 12px", border: "none", borderRadius: 8, background: "transparent", color: "inherit", textDecoration: "underline", fontFamily: "inherit", fontSize: ".88rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            <Icon icon={Undo2} className="h-4 w-4" /> {t("dash.undo")}
          </button>
        </div>
      )}
    </div>
  );
}
