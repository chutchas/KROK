"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import {
  Check, Clock, X, Plus, Pencil, Trash2, GripVertical,
  TrendingUp, Hash, Trophy, FileText, Users, Zap,
} from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import {
  WIDGET_FORMATS, WIDGET_METRICS, RANGES_BY_FORMAT,
  formatLabel, formatHint, metricLabel, rangeLabel, metricUnit,
  type DashWidget, type WidgetFormat, type WidgetMetric, type WidgetRange,
} from "@/lib/dashboard-meta";
import { saveDashboardLayout, computeWidget, type WidgetResult } from "./actions";

export interface AnswerItem {
  label: string; type: string; display?: string; note?: string; fail?: boolean; photoField?: string;
  rows?: Record<string, string>[]; columns?: { id: string; label: string }[];
}
export interface SubRow {
  id: string; form_title: string; form_icon: string; user_name: string;
  result: "pass" | "fail"; fails: string[]; answers: AnswerItem[];
  duration_s: number | null; submitted_at: string;
  approval_status?: "none" | "pending" | "approved" | "rejected";
}
export interface FormOpt { id: string; title: string; icon: string }
export interface Summary {
  forms: { used: number; max: number };
  members: { used: number; max: number };
  ai: { used: number; max: number };
  period: string;
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function fmtValue(metric: WidgetMetric, v: number, en: boolean): string {
  if (metric === "avgtime") {
    if (v >= 60) { const m = Math.floor(v / 60), s = v % 60; return en ? `${m}m ${s}s` : `${m}น ${s}วิ`; }
    return `${v}${en ? "s" : "วิ"}`;
  }
  const u = metricUnit(metric, en);
  return `${v.toLocaleString()}${u ? (metric === "passrate" ? u : " " + u) : ""}`;
}

export default function DashboardClient({
  tenantId, initial, forms, summary, initialWidgets,
}: {
  tenantId: string; initial: SubRow[]; forms: FormOpt[]; summary: Summary; initialWidgets: DashWidget[];
}) {
  const { t, lang } = useT();
  const en = lang === "en";
  const [subs, setSubs] = useState<SubRow[]>(initial);
  const [open, setOpen] = useState<SubRow | null>(null);
  const [widgets, setWidgets] = useState<DashWidget[]>(initialWidgets);
  const [builder, setBuilder] = useState<DashWidget | null>(null); // widget กำลังสร้าง/แก้
  const [dragId, setDragId] = useState<string | null>(null);

  const formName = useMemo(() => {
    const m = new Map(forms.map((f) => [f.id, `${f.icon} ${f.title}`]));
    return (id: string) => (id === "all" ? (en ? "All forms" : "ทุกฟอร์ม") : m.get(id) || (en ? "(deleted form)" : "(ฟอร์มถูกลบ)"));
  }, [forms, en]);

  function persist(next: DashWidget[]) {
    setWidgets(next);
    saveDashboardLayout(next); // best-effort เก็บลง DB
  }
  function upsertWidget(w: DashWidget) {
    const exists = widgets.some((x) => x.id === w.id);
    persist(exists ? widgets.map((x) => (x.id === w.id ? w : x)) : [...widgets, w]);
    setBuilder(null);
  }
  function removeWidget(id: string) { persist(widgets.filter((x) => x.id !== id)); }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = widgets.filter((x) => x.id !== dragId);
    const moved = widgets.find((x) => x.id === dragId)!;
    const idx = next.findIndex((x) => x.id === targetId);
    next.splice(idx, 0, moved);
    persist(next);
    setDragId(null);
  }

  // realtime — รายการล่าสุด (คงเดิม)
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("krok-subs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}` },
        (payload) => { const row = payload.new as SubRow; setSubs((prev) => (prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, 100))); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}` },
        (payload) => { const row = payload.new as SubRow; setSubs((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s))); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{t("dash.title")}</h1>
        <button onClick={() => setBuilder({ id: Math.random().toString(36).slice(2), format: "stat", formId: "all", metric: "usage", range: "7d" })}
          className="inline-flex items-center gap-1.5"
          style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 600 }}>
          <Icon icon={Plus} className="h-4 w-4" /> {t("dash.addWidget")}
        </button>
      </div>

      {/* แถวสรุป workspace (ตายตัว 3 การ์ด) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }} className="krok-sumcards">
        <SummaryCard icon={FileText} label={t("dash.sumForms")} used={summary.forms.used} max={summary.forms.max} />
        <SummaryCard icon={Users} label={t("dash.sumMembers")} used={summary.members.used} max={summary.members.max} />
        <SummaryCard icon={Zap} label={t("dash.sumAi")} used={summary.ai.used} max={summary.ai.max} sub={summary.period} />
      </div>

      {/* โซน widget ปรับเองได้ */}
      {widgets.length > 0 && (
        <>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{t("dash.widgets")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
            {widgets.map((w) => (
              <div key={w.id} draggable onDragStart={() => setDragId(w.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(w.id)}>
                <WidgetCard w={w} formName={formName} en={en}
                  onEdit={() => setBuilder(w)} onRemove={() => removeWidget(w.id)} t={t} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* รายการล่าสุด (คงเดิม) */}
      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--pass)" }} />
          {t("dash.latest")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("dash.latestSub")}</p>
        <div>
          {subs.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("dash.empty")}</span>}
          {subs.map((s) => (
            <div key={s.id} onClick={() => setOpen(s)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>{s.form_icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: ".93rem" }}>{s.form_title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{s.user_name || "—"} · {fmt(s.submitted_at)}</small>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {s.approval_status === "pending" && <Pill kind="na"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Clock} className="h-3 w-3" /> {t("dash.pending")}</span></Pill>}
                {s.approval_status === "approved" && <Pill kind="pass">{t("dash.approved")}</Pill>}
                {s.approval_status === "rejected" && <Pill kind="fail">{t("dash.rejected")}</Pill>}
                {s.fails?.length ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {s.fails.length}</span></Pill> : s.result === "pass" ? <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("dash.passed")}</span></Pill> : <Pill kind="na">{t("dash.submitted")}</Pill>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {open && <DetailModal sub={open} tenantId={tenantId} onClose={() => setOpen(null)} />}
      {builder && (
        <WidgetBuilder initial={builder} forms={forms} en={en} t={t}
          onCancel={() => setBuilder(null)} onSave={upsertWidget} />
      )}

      <style>{`@media(max-width:700px){.krok-sumcards{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

// ---------- การ์ดสรุป (มี progress) ----------
function SummaryCard({ icon, label, used, max, sub }: { icon: typeof FileText; label: string; used: number; max: number; sub?: string }) {
  const unlimited = max >= 999999;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const over = !unlimited && used >= max;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--ink-3)", fontSize: ".78rem" }}>
        <Icon icon={icon} className="h-4 w-4" /> {label}{sub ? ` · ${sub}` : ""}
      </div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, margin: "6px 0 8px" }}>
        <span style={{ fontSize: "1.7rem", color: over ? "var(--fail)" : "var(--ink)" }}>{used.toLocaleString()}</span>
        <span style={{ fontSize: "1rem", color: "var(--ink-3)" }}> / {unlimited ? "∞" : max.toLocaleString()}</span>
      </div>
      <div style={{ height: 7, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: unlimited ? "8%" : `${pct}%`, height: "100%", background: over ? "var(--fail)" : "var(--accent)", borderRadius: 6, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// ---------- การ์ด widget ----------
type TFn = (k: never) => string;
function WidgetCard({ w, formName, en, onEdit, onRemove, t }: {
  w: DashWidget; formName: (id: string) => string; en: boolean;
  onEdit: () => void; onRemove: () => void; t: TFn;
}) {
  const [res, setRes] = useState<WidgetResult | null>(null);
  const key = `${w.format}|${w.formId}|${w.metric}|${w.range}`;
  useEffect(() => {
    let active = true;
    setRes(null);
    computeWidget(w).then((r) => { if (active) setRes(r); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fIcon = w.format === "stat" ? Hash : w.format === "trend" ? TrendingUp : Trophy;
  const sub = `${formName(w.formId)} · ${rangeLabel(w.range, en)}`;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span aria-hidden style={{ color: "var(--ink-3)", cursor: "grab", marginTop: 2 }}><Icon icon={GripVertical} className="h-4 w-4" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".9rem", fontWeight: 600 }}>
            <Icon icon={fIcon} className="h-4 w-4" /> {metricLabel(w.metric, en)}
          </div>
          <div style={{ color: "var(--ink-3)", fontSize: ".74rem", marginTop: 1, overflowWrap: "anywhere" }}>{sub}</div>
        </div>
        <button onClick={onEdit} title={t("common.edit" as never)} style={iconBtn}><Icon icon={Pencil} className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} title={t("common.delete" as never)} style={iconBtn}><Icon icon={Trash2} className="h-3.5 w-3.5" /></button>
      </div>

      <div style={{ marginTop: 12, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {res == null && <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{en ? "Loading…" : "กำลังโหลด…"}</div>}
        {res && "error" in res && <div style={{ color: "var(--fail)", fontSize: ".82rem" }}>{res.error}</div>}
        {res && !("error" in res) && (
          <>
            {res.kind === "stat" && <StatView res={res} metric={w.metric} en={en} />}
            {res.kind === "trend" && <TrendView res={res} metric={w.metric} en={en} />}
            {res.kind === "ranking" && <RankingView res={res} metric={w.metric} en={en} />}
          </>
        )}
      </div>
    </div>
  );
}
const iconBtn: React.CSSProperties = {
  border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 6, cursor: "pointer", padding: "4px", color: "var(--ink-2)", flexShrink: 0,
};

function StatView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "stat" }>; metric: WidgetMetric; en: boolean }) {
  const extra = metric === "passrate" && res.pass != null
    ? (en ? `pass ${res.pass} · fail ${res.fail}` : `ผ่าน ${res.pass} · ไม่ผ่าน ${res.fail}`)
    : "";
  return (
    <div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "2.1rem", fontWeight: 800, lineHeight: 1.1, color: "var(--ink)" }}>
        {fmtValue(metric, res.value, en)}
      </div>
      {extra && <div style={{ color: "var(--ink-3)", fontSize: ".78rem", marginTop: 4 }}>{extra}</div>}
    </div>
  );
}

function TrendView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "trend" }>; metric: WidgetMetric; en: boolean }) {
  const series = res.series;
  const max = Math.max(1, ...series.map((s) => s.v));
  return (
    <div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>
        {fmtValue(metric, res.total, en)}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: series.length > 14 ? 2 : 4, height: 72 }}>
        {series.map((s) => (
          <div key={s.key} title={`${s.key.slice(5)} · ${s.v}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${Math.round((s.v / max) * 100)}%`, minHeight: s.v > 0 ? 3 : 0, background: "var(--accent)", borderRadius: 3, opacity: 0.85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: ".68rem", marginTop: 4 }}>
        <span>{series[0]?.key.slice(5)}</span>
        <span>{series[series.length - 1]?.key.slice(5)}</span>
      </div>
    </div>
  );
}

function RankingView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "ranking" }>; metric: WidgetMetric; en: boolean }) {
  const items = res.items;
  const max = Math.max(1, ...items.map((r) => r.v));
  if (items.length === 0) return <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{en ? "No data" : "ยังไม่มีข้อมูล"}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, textAlign: "right", color: "var(--ink-3)", fontSize: ".78rem" }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: ".84rem" }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.icon} {r.title}</b>
              <span className="tabnum" style={{ color: "var(--ink-2)", flexShrink: 0 }}>{fmtValue(metric, r.v, en)}</span>
            </span>
            <span style={{ display: "block", height: 5, borderRadius: 4, background: "var(--surface-2)", marginTop: 3, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.round((r.v / max) * 100)}%`, background: "var(--accent)", borderRadius: 4 }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- ตัวสร้าง/แก้ widget ----------
function WidgetBuilder({ initial, forms, en, t, onCancel, onSave }: {
  initial: DashWidget; forms: FormOpt[]; en: boolean; t: TFn;
  onCancel: () => void; onSave: (w: DashWidget) => void;
}) {
  const [format, setFormat] = useState<WidgetFormat>(initial.format);
  const [formId, setFormId] = useState<string>(initial.formId);
  const [metric, setMetric] = useState<WidgetMetric>(initial.metric);
  const [range, setRange] = useState<WidgetRange>(initial.range);

  const ranges = RANGES_BY_FORMAT[format];
  const effRange = ranges.includes(range) ? range : ranges[0];

  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 12 }}>{t("dash.widgetBuilder" as never)}</h2>

        {/* 1. รูปแบบ */}
        <Section n={1} label={t("dash.stepFormat" as never)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {WIDGET_FORMATS.map((f) => (
            <button key={f} onClick={() => setFormat(f)}
              style={pickBtn(format === f)}>
              <b style={{ fontSize: ".86rem", fontFamily: "var(--font-anuphan)" }}>{formatLabel(f, en)}</b>
              <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".7rem", marginTop: 2 }}>{formatHint(f, en)}</span>
            </button>
          ))}
        </div>

        {/* 2. ฟอร์ม (ranking = ทุกฟอร์มเสมอ) */}
        {format !== "ranking" && (
          <>
            <Section n={2} label={t("dash.stepForm" as never)} />
            <select value={formId} onChange={(e) => setFormId(e.target.value)} style={selStyle}>
              <option value="all">{en ? "All forms" : "ทุกฟอร์ม"}</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.title}</option>)}
            </select>
          </>
        )}

        {/* 3. ค่าที่แสดง */}
        <Section n={format === "ranking" ? 2 : 3} label={t("dash.stepMetric" as never)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WIDGET_METRICS.map((m) => (
            <button key={m} onClick={() => setMetric(m)} style={chip(metric === m)}>{metricLabel(m, en)}</button>
          ))}
        </div>

        {/* 4. ช่วงเวลา */}
        <Section n={format === "ranking" ? 3 : 4} label={t("dash.stepRange" as never)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ranges.map((r) => (
            <button key={r} onClick={() => setRange(r)} style={chip(effRange === r)}>{rangeLabel(r, en)}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={() => onSave({ id: initial.id, format, formId: format === "ranking" ? "all" : formId, metric, range: effRange })}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
            {t("common.save" as never)}
          </button>
          <button onClick={onCancel}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>
            {t("common.cancel" as never)}
          </button>
        </div>
      </div>
    </div>
  );
}
function Section({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", fontSize: ".76rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <b style={{ fontSize: ".9rem" }}>{label}</b>
    </div>
  );
}
const selStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".9rem",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
};
function pickBtn(on: boolean): React.CSSProperties {
  return {
    textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)",
  };
}
function chip(on: boolean): React.CSSProperties {
  return {
    padding: "7px 12px", borderRadius: 20, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit",
    border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-soft)" : "var(--surface)",
    color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
  };
}

// ---------- Detail modal (คงเดิม) ----------
function DetailModal({ sub, tenantId, onClose }: { sub: SubRow; tenantId: string; onClose: () => void }) {
  const { t, tt } = useT();
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", sub.id);
      if (!data) return;
      const out: Record<string, string> = {};
      for (const p of data) {
        const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(p.storage_path as string, 3600);
        if (signed?.signedUrl) out[p.field_id as string] = signed.signedUrl;
      }
      if (!cancelled) setPhotos(out);
    })();
    return () => { cancelled = true; };
  }, [sub.id, tenantId]);

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} className="no-print">
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{sub.form_icon} {sub.form_title}</h2>
          {sub.result === "fail" ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {t("dash.issues")}</span></Pill> : <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("dash.passed")}</span></Pill>}
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>
          {t("dash.by")} {sub.user_name || "—"} · {fmt(sub.submitted_at)} · {tt("dash.took", { s: sub.duration_s ?? "–" })}
        </p>
        {sub.answers.map((a, i) =>
          a.type === "table" && a.columns ? (
            <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ color: "var(--ink-2)", fontSize: ".9rem", marginBottom: 4 }}>{a.label}</div>
              {a.rows && a.rows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: ".82rem", minWidth: "100%" }}>
                    <thead>
                      <tr>{a.columns.map((c) => <th key={c.id} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--line)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {a.rows.map((r, ri) => (
                        <tr key={ri} style={{ borderBottom: "1px solid var(--line)" }}>
                          {a.columns!.map((c) => <td key={c.id} style={{ padding: "4px 8px", verticalAlign: "top" }}>{r[c.id] || "—"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>—</span>}
            </div>
          ) : (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 14px", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
              <div style={{ color: "var(--ink-2)" }}>
                {a.label}
                {a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}>{a.note}</div>}
              </div>
              <div style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", color: a.fail ? "var(--fail)" : a.type === "pass_fail" ? "var(--pass)" : "var(--ink)" }}>
                {a.photoField ? (
                  photos[a.photoField] ? <img src={photos[a.photoField]} alt={t("dash.photoAlt")} style={{ maxHeight: 110, borderRadius: 6 }} />
                    : <span style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{t("dash.loadingPhoto")}</span>
                ) : (a.display ?? "—")}
              </div>
            </div>
          )
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <a href={`/submission/${sub.id}`} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, textDecoration: "none", fontSize: ".9rem" }}>{t("dash.openDoc")}</a>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
