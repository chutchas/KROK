"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { Settings2, Check, Download, Eye, EyeOff, GripVertical, Clock, X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface AnswerItem {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
}
export interface SubRow {
  id: string;
  form_title: string;
  form_icon: string;
  user_name: string;
  result: "pass" | "fail";
  fails: string[];
  answers: AnswerItem[];
  duration_s: number | null;
  submitted_at: string;
  approval_status?: "none" | "pending" | "approved" | "rejected";
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
const todayKey = () => new Date().toLocaleDateString("sv");

type WidgetKey = "today" | "pass" | "fail" | "rate";
const DEFAULT_ORDER: WidgetKey[] = ["today", "pass", "fail", "rate"];
const LS_KEY = "krok_dash_widgets_v1";

export default function DashboardClient({ tenantId, initial }: { tenantId: string; initial: SubRow[] }) {
  const { t } = useT();
  const [subs, setSubs] = useState<SubRow[]>(initial);
  const [open, setOpen] = useState<SubRow | null>(null);
  const [customize, setCustomize] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<WidgetKey[]>([]);
  const [dragKey, setDragKey] = useState<WidgetKey | null>(null);

  useEffect(() => {
    // hydrate widget layout จาก localStorage ครั้งเดียวตอน mount (ค่าเริ่มต้นอยู่ฝั่ง server)
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { order?: WidgetKey[]; hidden?: WidgetKey[] };
        const ord = (p.order || []).filter((k) => DEFAULT_ORDER.includes(k));
        const merged = [...ord, ...DEFAULT_ORDER.filter((k) => !ord.includes(k))];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrder(merged);
        setHidden((p.hidden || []).filter((k) => DEFAULT_ORDER.includes(k)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  function persist(nextOrder: WidgetKey[], nextHidden: WidgetKey[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ order: nextOrder, hidden: nextHidden }));
    } catch {
      /* ignore */
    }
  }

  function onDrop(target: WidgetKey) {
    if (!dragKey || dragKey === target) return;
    const next = order.filter((k) => k !== dragKey);
    const idx = next.indexOf(target);
    next.splice(idx, 0, dragKey);
    persist(next, hidden);
    setDragKey(null);
  }

  function toggleHidden(k: WidgetKey) {
    persist(order, hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);
  }

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("krok-subs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as SubRow;
          setSubs((prev) => (prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, 100)));
        }
      )
      .on(
        // อัปเดตสด เมื่อ submission ถูกแก้ (เช่น เปลี่ยนชื่อฟอร์ม → ซิงก์ form_title, หรือสถานะอนุมัติ)
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as SubRow;
          setSubs((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId]);

  const stats = useMemo(() => {
    const today = todayKey();
    const t = subs.filter((s) => new Date(s.submitted_at).toLocaleDateString("sv") === today);
    const pass = t.filter((s) => s.result === "pass").length;
    const fail = t.filter((s) => s.result === "fail").length;
    return { today: t.length, pass, fail, rate: pass + fail ? Math.round((pass / (pass + fail)) * 100) : null };
  }, [subs]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{t("dash.title")}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setCustomize((v) => !v)}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "9px 16px", borderRadius: 8, border: customize ? "1px solid var(--accent)" : "1px solid var(--line)", background: customize ? "var(--accent-soft)" : "var(--surface)", color: customize ? "var(--accent)" : "var(--ink)", cursor: "pointer", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500 }}
          >
            <Icon icon={customize ? Check : Settings2} className="h-4 w-4" /> {customize ? t("dash.done") : t("dash.customize")}
          </button>
          <a
            href="/api/export/submissions"
            className="inline-flex items-center gap-1.5"
            style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none", fontSize: ".9rem", fontWeight: 500 }}
          >
            <Icon icon={Download} className="h-4 w-4" /> {t("dash.export")}
          </a>
        </div>
      </div>
      {customize && (
        <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: "0 0 8px" }}>{t("dash.customizeHint")}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }} className="krok-tiles">
        {order.map((k) => {
          const isHidden = hidden.includes(k);
          if (isHidden && !customize) return null;
          const map = {
            today: { v: stats.today as number | string, label: t("dash.today"), color: undefined as string | undefined },
            pass: { v: stats.pass, label: t("dash.pass"), color: "var(--pass)" },
            fail: { v: stats.fail, label: t("dash.fail"), color: "var(--fail)" },
            rate: { v: stats.rate == null ? "–" : stats.rate + "%", label: t("dash.rate"), color: undefined },
          }[k];
          return (
            <div
              key={k}
              draggable={customize}
              onDragStart={() => customize && setDragKey(k)}
              onDragOver={(e) => customize && e.preventDefault()}
              onDrop={() => customize && onDrop(k)}
              style={{ position: "relative", cursor: customize ? "grab" : "default", opacity: isHidden ? 0.4 : 1 }}
            >
              <Tile v={map.v} label={map.label} color={map.color} />
              {customize && (
                <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4, alignItems: "center" }}>
                  <button
                    onClick={() => toggleHidden(k)}
                    title={isHidden ? t("dash.show") : t("dash.hide")}
                    className="inline-flex items-center justify-center"
                    style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 6, cursor: "pointer", padding: "3px", color: "var(--ink-2)" }}
                  >
                    <Icon icon={isHidden ? Eye : EyeOff} className="h-3.5 w-3.5" />
                  </button>
                  <span aria-hidden style={{ color: "var(--ink-3)", display: "inline-flex", cursor: "grab" }}><Icon icon={GripVertical} className="h-4 w-4" /></span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--pass)" }} />
          {t("dash.latest")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("dash.latestSub")}</p>
        <div>
          {subs.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("dash.empty")}</span>}
          {subs.map((s) => (
            <div
              key={s.id}
              onClick={() => setOpen(s)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
            >
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

      <style>{`@media(max-width:700px){.krok-tiles{grid-template-columns:repeat(2,1fr)!important}}`}</style>
    </div>
  );
}

function Tile({ v, label, color }: { v: number | string; label: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.7rem", fontWeight: 700, color: color || "var(--ink)" }}>{v}</div>
      <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

function DetailModal({ sub, tenantId, onClose }: { sub: SubRow; tenantId: string; onClose: () => void }) {
  const { t, tt } = useT();
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("submission_photos")
        .select("field_id, storage_path")
        .eq("submission_id", sub.id);
      if (!data) return;
      const out: Record<string, string> = {};
      for (const p of data) {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p.storage_path as string, 3600);
        if (signed?.signedUrl) out[p.field_id as string] = signed.signedUrl;
      }
      if (!cancelled) setPhotos(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [sub.id, tenantId]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      className="no-print"
    >
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{sub.form_icon} {sub.form_title}</h2>
          {sub.result === "fail" ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {t("dash.issues")}</span></Pill> : <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("dash.passed")}</span></Pill>}
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>
          {t("dash.by")} {sub.user_name || "—"} · {fmt(sub.submitted_at)} · {tt("dash.took", { s: sub.duration_s ?? "–" })}
        </p>
        {sub.answers.map((a, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 14px", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
            <div style={{ color: "var(--ink-2)" }}>
              {a.label}
              {a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}>{a.note}</div>}
            </div>
            <div style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", color: a.fail ? "var(--fail)" : a.type === "pass_fail" ? "var(--pass)" : "var(--ink)" }}>
              {a.photoField ? (
                photos[a.photoField] ? (
                  <img src={photos[a.photoField]} alt={t("dash.photoAlt")} style={{ maxHeight: 110, borderRadius: 6 }} />
                ) : (
                  <span style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{t("dash.loadingPhoto")}</span>
                )
              ) : (
                a.display ?? "—"
              )}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <a href={`/submission/${sub.id}`} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, textDecoration: "none", fontSize: ".9rem" }}>{t("dash.openDoc")}</a>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
