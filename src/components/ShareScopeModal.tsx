"use client";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { X, Globe, Building2, Tag, HardHat } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { setFormVisibility } from "@/app/(app)/studio/actions";

export type VisMode = "public" | "all" | "teams" | "users";
export interface ShareValue { mode: VisMode; teamIds: string[]; userIds: string[] }
interface Member { user_id: string; name: string }
interface Team { id: string; name: string }

export default function ShareScopeModal({
  formId,
  title,
  initial,
  teams,
  members,
  onClose,
  onSaved,
}: {
  formId: string;
  title: string;
  initial: ShareValue;
  teams: Team[];
  members: Member[];
  onClose: () => void;
  onSaved: (v: ShareValue) => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<VisMode>(initial.mode);
  const [teamIds, setTeamIds] = useState<string[]>(initial.teamIds);
  const [userIds, setUserIds] = useState<string[]>(initial.userIds);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const MODES: { m: VisMode; icon: typeof Globe; label: string; sub: string }[] = [
    { m: "public", icon: Globe, label: t("share.public"), sub: t("share.publicSub") },
    { m: "all", icon: Building2, label: t("share.workspace"), sub: t("share.workspaceSub") },
    { m: "teams", icon: Tag, label: t("share.teams"), sub: t("share.teamsSub") },
    { m: "users", icon: HardHat, label: t("share.users"), sub: t("share.usersSub") },
  ];

  async function save() {
    if (mode === "teams" && teamIds.length === 0) { setErr(t("share.pickTeam")); return; }
    if (mode === "users" && userIds.length === 0) { setErr(t("share.pickUser")); return; }
    setBusy(true);
    setErr(null);
    const value: ShareValue = { mode, teamIds: mode === "teams" ? teamIds : [], userIds: mode === "users" ? userIds : [] };
    const res = await setFormVisibility(formId, value);
    setBusy(false);
    if ("error" in res) { setErr(res.error); return; }
    onSaved(value);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,10,14,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", background: "var(--surface)", borderRadius: 16, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--surface)" }}>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("share.title")}</b>
          <button onClick={onClose} aria-label={t("common.close")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "0 0 12px" }}>{title}</p>

          <div style={{ display: "grid", gap: 8 }}>
            {MODES.map((o) => {
              const on = mode === o.m;
              return (
                <button
                  key={o.m}
                  onClick={() => setMode(o.m)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: "11px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-soft)" : "var(--surface)" }}
                >
                  <span style={{ color: on ? "var(--accent)" : "var(--ink-3)", marginTop: 1 }}><Icon icon={o.icon} className="h-5 w-5" /></span>
                  <span>
                    <b style={{ fontSize: ".92rem", color: on ? "var(--accent)" : "var(--ink)" }}>{o.label}</b>
                    <span style={{ display: "block", fontSize: ".78rem", color: "var(--ink-3)" }}>{o.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === "teams" && (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {teams.length === 0 ? (
                <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: 0 }}>{t("share.noTeams")}</p>
              ) : teams.map((tm) => {
                const on = teamIds.includes(tm.id);
                return (
                  <label key={tm.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".9rem" }}>
                    <input type="checkbox" checked={on} onChange={(e) => setTeamIds((ids) => (e.target.checked ? [...ids, tm.id] : ids.filter((x) => x !== tm.id)))} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                    <Icon icon={Tag} className="h-4 w-4" /> {tm.name}
                  </label>
                );
              })}
            </div>
          )}

          {mode === "users" && (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {members.map((m) => {
                const on = userIds.includes(m.user_id);
                return (
                  <label key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".9rem" }}>
                    <input type="checkbox" checked={on} onChange={(e) => setUserIds((ids) => (e.target.checked ? [...ids, m.user_id] : ids.filter((x) => x !== m.user_id)))} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                    <Icon icon={HardHat} className="h-4 w-4" /> {m.name}
                  </label>
                );
              })}
            </div>
          )}

          {err && <div style={{ marginTop: 10 }}><Notice kind="error">{err}</Notice></div>}

          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <Button onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save} loading={busy}>{t("common.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
