"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { CalendarClock, Plus, X, Tag, HardHat, Check } from "lucide-react";
import { AsyncButton, Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { confirmDialog } from "@/components/dialogs";
import { DEFAULT_SCHEDULE, DOW_EN, DOW_TH, type ScheduleConfig, type ScheduleFreq } from "@/lib/schedule";
import { deleteFormSchedule, getFormSchedule, saveFormSchedule } from "@/app/(app)/studio/schedule-actions";

/**
 * รอบตรวจตามตาราง (ในหน้าแก้ฟอร์มของ Studio) — บันทึกแยกจากตัวฟอร์ม เพราะเป็นข้อมูลคนละตาราง (0064)
 */
const WINDOWS = [15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

export default function FormSchedulePanel({ formId, teams, members }: {
  formId: string | null;
  teams: { id: string; name: string }[];
  members: { user_id: string; name: string }[];
}) {
  const { t, tt, lang } = useT();
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<ScheduleConfig | null>(null);
  const [cfg, setCfg] = useState<ScheduleConfig | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!formId) return;
    let alive = true;
    getFormSchedule(formId).then((r) => {
      if (!alive) return;
      setLoaded(true);
      if ("error" in r) { setMsg({ kind: "err", text: localizeServerMsg(r.error, lang) }); return; }
      setMissing(!!r.missing);
      setSaved(r.schedule);
      setCfg(r.schedule);
    }).catch(() => setLoaded(true));
    return () => { alive = false; };
  }, [formId, lang]);

  const box: React.CSSProperties = { marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 10 };
  const head = (
    <>
      <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon icon={CalendarClock} className="h-4 w-4" /> {t("sch.title")}
      </b>
      <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".85rem" }}>{t("sch.sub")}</span>
    </>
  );

  if (!formId) return <div style={box}>{head}<p style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "8px 0 0" }}>{t("sch.saveFirst")}</p></div>;
  if (!loaded) return <div style={box}>{head}<p style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "8px 0 0" }}>{t("common.loading")}</p></div>;
  if (missing) return <div style={box}>{head}<p style={{ fontSize: ".8rem", color: "var(--warn)", margin: "8px 0 0" }}>{t("sch.needMigration")}</p></div>;

  const on = !!cfg;
  const set = (patch: Partial<ScheduleConfig>) => { setCfg((c) => (c ? { ...c, ...patch } : c)); setMsg(null); };
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  async function save() {
    if (!cfg) return;
    const r = await saveFormSchedule(cfg);
    if ("error" in r) { setMsg({ kind: "err", text: localizeServerMsg(r.error, lang) }); return; }
    setSaved(r.schedule);
    setCfg(r.schedule);
    setMsg({ kind: "ok", text: t("sch.saved") });
  }

  async function turnOff() {
    if (!saved) { setCfg(null); return; }
    if (!(await confirmDialog({ message: t("sch.removeConfirm"), danger: true }))) return;
    const r = await deleteFormSchedule(formId!);
    if ("error" in r) { setMsg({ kind: "err", text: localizeServerMsg(r.error, lang) }); return; }
    setSaved(null);
    setCfg(null);
    setMsg({ kind: "ok", text: t("sch.removed") });
  }

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: "7px 12px", minHeight: 36, borderRadius: 20, fontSize: ".84rem", cursor: "pointer", fontFamily: "inherit",
    border: active ? "1px solid var(--accent)" : "1px solid var(--line)", background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-text)" : "var(--ink-2)", fontWeight: active ? 600 : 500,
  });
  const label: React.CSSProperties = { fontSize: ".86rem", fontWeight: 600, margin: "12px 0 6px", display: "block" };
  const dow = lang === "en" ? DOW_EN : DOW_TH;
  const winLabel = (m: number) => (m < 60 ? tt("sch.min", { n: m }) : m % 60 === 0 ? tt("sch.hr", { n: m / 60 }) : tt("sch.hrMin", { h: Math.floor(m / 60), m: m % 60 }));
  const toggleIn = (arr: string[], id: string, v: boolean) => (v ? [...arr, id] : arr.filter((x) => x !== id));

  return (
    <div style={box}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={(e) => (e.target.checked ? setCfg(saved ?? { formId, ...DEFAULT_SCHEDULE }) : void turnOff())}
          style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)" }} />
        <span>{head}</span>
      </label>

      {cfg && (
        <div style={{ marginTop: 12, paddingTop: 4, borderTop: "1px dashed var(--line)" }}>
          <span style={label}>{t("sch.freq")}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label={t("sch.freq")}>
            {(["daily", "weekdays", "weekly", "monthly"] as ScheduleFreq[]).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={cfg.freq === f} style={chip(cfg.freq === f)}
                onClick={() => set({ freq: f, days: f === "weekly" ? (cfg.freq === "weekly" ? cfg.days : [1]) : f === "monthly" ? (cfg.freq === "monthly" ? cfg.days : [1]) : [] })}>
                {t(`sch.freq.${f}`)}
              </button>
            ))}
          </div>

          {cfg.freq === "weekly" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {dow.map((d, i) => {
                const a = cfg.days.includes(i);
                return <button key={i} type="button" aria-pressed={a} style={{ ...chip(a), minWidth: 44 }} onClick={() => set({ days: a ? cfg.days.filter((x) => x !== i) : [...cfg.days, i] })}>{d}</button>;
              })}
            </div>
          )}
          {cfg.freq === "monthly" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))", gap: 4, marginTop: 8, maxWidth: 340 }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                  const a = cfg.days.includes(d);
                  return <button key={d} type="button" aria-pressed={a} style={{ ...chip(a), padding: "6px 0", borderRadius: 8 }} onClick={() => set({ days: a ? cfg.days.filter((x) => x !== d) : [...cfg.days, d] })}>{d}</button>;
                })}
              </div>
              <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 4 }}>{t("sch.monthEndHint")}</small>
            </>
          )}

          <span style={label}>{t("sch.times")}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {cfg.times.map((tm, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}>
                <input type="time" lang="en-GB" value={tm} aria-label={tt("sch.timeN", { n: i + 1 })}
                  onChange={(e) => set({ times: cfg.times.map((x, xi) => (xi === i ? e.target.value : x)) })}
                  style={{ border: "none", background: "transparent", color: "var(--ink)", fontFamily: "inherit", fontSize: ".92rem", padding: "7px 8px", minHeight: 38 }} />
                {cfg.times.length > 1 && (
                  <button type="button" aria-label={t("common.delete")} onClick={() => set({ times: cfg.times.filter((_, xi) => xi !== i) })}
                    style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", padding: "0 8px", minHeight: 38, display: "inline-flex", alignItems: "center" }}>
                    <Icon icon={X} className="h-4 w-4" />
                  </button>
                )}
              </span>
            ))}
            {cfg.times.length < 12 && (
              <Button type="button" onClick={() => set({ times: [...cfg.times, nextTime(cfg.times)] })} style={{ padding: "8px 12px", fontSize: ".85rem" }}>
                <Icon icon={Plus} className="h-4 w-4" /> {t("sch.addTime")}
              </Button>
            )}
          </div>
          <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 4 }}>{t("sch.timesHint")}</small>

          <span style={label}>{t("sch.window")}</span>
          <select value={cfg.windowMin} onChange={(e) => set({ windowMin: Number(e.target.value) })}
            style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", minHeight: 40 }}>
            {(WINDOWS.includes(cfg.windowMin) ? WINDOWS : [...WINDOWS, cfg.windowMin].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{winLabel(m)}</option>)}
          </select>
          <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 4 }}>{t("sch.windowHint")}</small>

          <span style={label}>{t("sch.assign")}</span>
          <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", margin: "-2px 0 6px" }}>{t("sch.assignHint")}</small>
          {teams.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {teams.map((tm) => {
                const a = cfg.assignTeams.includes(tm.id);
                return <button key={tm.id} type="button" aria-pressed={a} style={chip(a)} onClick={() => set({ assignTeams: toggleIn(cfg.assignTeams, tm.id, !a) })}><Icon icon={a ? Check : Tag} className="h-3.5 w-3.5" /> {tm.name}</button>;
              })}
            </div>
          )}
          <details>
            <summary style={{ cursor: "pointer", fontSize: ".84rem", color: "var(--accent-text)", minHeight: 32, display: "flex", alignItems: "center" }}>
              {tt("sch.pickPeople", { n: cfg.assignUsers.length })}
            </summary>
            <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
              {members.map((m) => (
                <label key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".88rem", minHeight: 34 }}>
                  <input type="checkbox" checked={cfg.assignUsers.includes(m.user_id)} onChange={(e) => set({ assignUsers: toggleIn(cfg.assignUsers, m.user_id, e.target.checked) })} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                  <Icon icon={HardHat} className="h-4 w-4" /> {m.name}
                </label>
              ))}
            </div>
          </details>

          <span style={label}>{t("sch.mode")}</span>
          <div style={{ display: "grid", gap: 6 }}>
            {(["once", "each"] as const).map((m) => (
              <label key={m} style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", borderRadius: 8, border: `1px solid ${cfg.mode === m ? "var(--accent)" : "var(--line)"}`, background: cfg.mode === m ? "var(--accent-soft)" : "var(--surface)" }}>
                <input type="radio" name={`sch-mode-${formId}`} checked={cfg.mode === m} onChange={() => set({ mode: m })} style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--accent)" }} />
                <span>
                  <b style={{ fontSize: ".88rem", fontFamily: "var(--font-anuphan)" }}>{t(`sch.mode.${m}`)}</b>
                  <span style={{ display: "block", fontSize: ".78rem", color: "var(--ink-3)" }}>{t(`sch.mode.${m}Sub`)}</span>
                </span>
              </label>
            ))}
          </div>

          <span style={label}>{t("sch.notify")}</span>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".88rem", cursor: "pointer", minHeight: 34 }}>
            <input type="checkbox" checked={cfg.notifyStart} onChange={(e) => set({ notifyStart: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} /> {t("sch.notifyStart")}
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".88rem", cursor: "pointer", minHeight: 34 }}>
            <input type="checkbox" checked={cfg.notifyOverdue} onChange={(e) => set({ notifyOverdue: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} /> {t("sch.notifyOverdue")}
          </label>
          {cfg.notifyOverdue && (
            <details style={{ marginLeft: 26 }}>
              <summary style={{ cursor: "pointer", fontSize: ".82rem", color: "var(--accent-text)", minHeight: 32, display: "flex", alignItems: "center" }}>
                {cfg.escalateUsers.length ? tt("sch.escalateN", { n: cfg.escalateUsers.length }) : t("sch.escalateDefault")}
              </summary>
              <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
                {members.map((m) => (
                  <label key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".86rem", minHeight: 32 }}>
                    <input type="checkbox" checked={cfg.escalateUsers.includes(m.user_id)} onChange={(e) => set({ escalateUsers: toggleIn(cfg.escalateUsers, m.user_id, e.target.checked) })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
                    {m.name}
                  </label>
                ))}
              </div>
            </details>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
            <AsyncButton variant="primary" onClick={save} disabled={!dirty} style={{ padding: "8px 14px", fontSize: ".88rem" }}>{t("sch.save")}</AsyncButton>
            {saved && <Button type="button" variant="ghost" onClick={() => void turnOff()} style={{ padding: "8px 12px", fontSize: ".85rem", color: "var(--fail)" }}>{t("sch.remove")}</Button>}
            {dirty && saved && <small style={{ color: "var(--warn)", fontSize: ".78rem" }}>{t("sch.unsaved")}</small>}
          </div>
        </div>
      )}
      {msg && <p role={msg.kind === "err" ? "alert" : "status"} style={{ fontSize: ".82rem", color: msg.kind === "err" ? "var(--fail)" : "var(--pass)", margin: "8px 0 0" }}>{msg.text}</p>}
    </div>
  );
}

function nextTime(times: string[]): string {
  const last = [...times].sort().pop() || "08:00";
  const m = (Number(last.slice(0, 2)) * 60 + Number(last.slice(3, 5)) + 240) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
