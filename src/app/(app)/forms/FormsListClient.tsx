"use client";
import FormIcon from "@/components/FormIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, EmptyState } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowRight, Search as SearchIcon, Smartphone, SearchX, Plus, LayoutTemplate, FilePen, Trash2, Clock, ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { categoryLabel } from "@/lib/form-categories";
import { deleteDraftAction, deleteSubmittedDrafts } from "./actions";
import CasesList, { type CaseListItem } from "./CasesList";
import { alertDialog, confirmDialog } from "@/components/dialogs";

export interface FormListItem {
  id: string;
  title: string;
  icon: string;
  steps: number;
  fields: number;
  category?: string;
  /** ฟอร์มกรอกหลายคน (มีขั้นที่ตั้งทีมรับผิดชอบ) */
  workflow?: boolean;
}

export interface DraftListItem {
  id: string;
  formId: string;
  formTitle: string;
  formIcon: string;
  /** ฟอร์มยังเปิดให้กรอกอยู่ไหม (ถูกปิด/ลบ = กรอกต่อไม่ได้ ลบได้อย่างเดียว) */
  available: boolean;
  title: string;
  stepIdx: number;
  steps: number;
  filled: number;
  total: number;
  updatedAt: string;
  expiresAt: string;
  /** ประเภทฟอร์ม (schema.category) — ใช้กรอง */
  category?: string;
}

type Tab = "all" | "tasks" | "drafts";
const SUBMITTED_DRAFTS_KEY = "krok_submitted_drafts";

export default function FormsListClient({
  forms,
  drafts = [],
  cases = [],
  initialTab = "all",
  highlightId,
  canCreate = false,
}: {
  forms: FormListItem[];
  drafts?: DraftListItem[];
  cases?: CaseListItem[];
  initialTab?: Tab;
  highlightId?: string;
  canCreate?: boolean;
}) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const shownDrafts = drafts.filter((d) => !hidden.has(d.id));

  // ร่างที่ส่งไปแล้วตอนออฟไลน์ (เครื่องจำ id ไว้) → ซ่อนทันที แล้วลบบน server เมื่อออนไลน์
  useEffect(() => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(SUBMITTED_DRAFTS_KEY) || "[]"); } catch { /* ignore */ }
    if (!ids.length) return;
    setHidden(new Set(ids));
    if (navigator.onLine === false) return;
    deleteSubmittedDrafts(ids).then(() => {
      try { localStorage.removeItem(SUBMITTED_DRAFTS_KEY); } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    router.replace(next === "all" ? "/forms" : `/forms?tab=${next}`, { scroll: false });
  }

  async function removeDraft(id: string) {
    if (!(await confirmDialog({ message: t("draft.deleteConfirm"), danger: true }))) return;
    setBusyId(id);
    const res = await deleteDraftAction(id);
    setBusyId(null);
    if ("error" in res) await alertDialog(res.error);
    else setHidden((h) => new Set([...h, id]));
  }
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [hl, setHl] = useState<string | null>(highlightId || null);
  const hlRef = useRef<HTMLAnchorElement>(null);

  const cats = useMemo(() => Array.from(new Set(forms.map((f) => f.category).filter((c): c is string => !!c))), [forms]);

  useEffect(() => {
    if (!highlightId) return;
    setHl(highlightId);
    const el = hlRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const tm = setTimeout(() => setHl(null), 4500);
    return () => clearTimeout(tm);
  }, [highlightId]);

  const filtered = forms
    .filter((f) => catFilter === "all" || (f.category || "") === catFilter)
    .filter((f) => !search.trim() || f.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Card>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("forms.title")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("forms.subtitle")}</p>

      {/* แท็บย่อย: ฟอร์มทั้งหมด | แบบร่างที่ยังบันทึกไม่เสร็จ */}
      {/* จอแคบ: แท็บไม่ตัดบรรทัด เลื่อนซ้าย-ขวาได้แทน */}
      <div role="tablist" className="krok-tabscroll" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", margin: "12px 0 4px", overflowX: "auto", scrollbarWidth: "none" }}>
        {([
          { k: "all" as const, label: t("forms.tabAll"), n: forms.length },
          { k: "tasks" as const, label: t("wf.tabTasks"), n: cases.filter((c) => c.kind !== "watch").length },
          { k: "drafts" as const, label: t("forms.tabDrafts"), n: shownDrafts.length },
        ]).map((x) => {
          const on = tab === x.k;
          return (
            <button key={x.k} role="tab" aria-selected={on} onClick={() => switchTab(x.k)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", marginBottom: -1, border: "none", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, background: "none", color: on ? "var(--accent)" : "var(--ink-2)", fontFamily: "inherit", fontSize: ".9rem", fontWeight: on ? 600 : 400, cursor: "pointer", textAlign: "left", lineHeight: 1.3, whiteSpace: "nowrap", flex: "0 0 auto" }}>
              {x.k === "drafts" && <Icon icon={FilePen} className="h-4 w-4" />}
              {x.k === "tasks" && <Icon icon={ClipboardList} className="h-4 w-4" />}
              {x.label}
              <span style={{ fontSize: ".72rem", minWidth: 20, padding: "1px 6px", borderRadius: 999, background: on ? "var(--accent-soft)" : "var(--code-bg)", color: on ? "var(--accent)" : "var(--ink-3)" }}>{x.n}</span>
            </button>
          );
        })}
      </div>

      {tab === "drafts" ? (
        <DraftsList drafts={shownDrafts} busyId={busyId} onDelete={removeDraft} />
      ) : tab === "tasks" ? (
        <CasesList cases={cases} />
      ) : (<>
      {forms.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("forms.search")} style={{ width: "100%", paddingLeft: 32 }} />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="krok-typefilter"
            style={{ padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", minWidth: 180, flex: "0 0 auto" }}>
            <option value="all">{t("forms.allCategories")}</option>
            {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
        </div>
      )}
      <style>{`@media(max-width:640px){ .krok-typefilter{ width:100%; flex:1 1 100% !important; min-width:0 !important; } }`}</style>

      <div style={{ display: "grid", gap: 10 }}>
        {forms.length === 0 && !canCreate && (
          <Card><EmptyState icon={<Icon icon={Smartphone} className="h-7 w-7" />} title={t("forms.empty")} /></Card>
        )}
        {forms.length === 0 && canCreate && (
          <Card>
            <EmptyState
              icon={<Icon icon={Smartphone} className="h-7 w-7" />}
              title={t("forms.emptyManager")}
              hint={t("forms.emptyManagerHint")}
            />
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <Link href="/studio" style={{ textDecoration: "none" }}>
                <Button variant="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon icon={Plus} className="h-4 w-4" /> {t("forms.createFirst")}
                </Button>
              </Link>
              <Link href="/studio?mode=template" style={{ textDecoration: "none" }}>
                <Button variant="ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon icon={LayoutTemplate} className="h-4 w-4" /> {t("templates.browse")}
                </Button>
              </Link>
            </div>
          </Card>
        )}
        {forms.length > 0 && filtered.length === 0 && (
          <Card><EmptyState icon={<Icon icon={SearchX} className="h-7 w-7" />} title={t("forms.noMatch")} /></Card>
        )}
        {filtered.map((f) => {
          const on = hl === f.id;
          return (
            <Link
              key={f.id}
              ref={on ? hlRef : undefined}
              href={`/fill/${f.id}`}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
                borderRadius: 12, padding: "16px",
                background: on ? "var(--accent-soft)" : "var(--surface)",
                textDecoration: "none", color: "var(--ink)",
                boxShadow: on ? "0 0 0 4px var(--accent-soft)" : "none",
                transition: "background .3s, box-shadow .3s, border-color .3s",
              }}
            >
              <FormIcon value={f.icon} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {f.category && <span style={{ display: "inline-block", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", marginRight: 6, color: "var(--ink-2)" }}>{categoryLabel(f.category, lang)}</span>}
                  {tt("forms.stepsFields", { steps: f.steps, fields: f.fields })}
                  {f.workflow && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6, color: "var(--accent)" }}><Icon icon={Users} className="h-3 w-3" /> {t("wf.multiBadge")}</span>}
                </small>
              </div>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4 }}>{t("forms.start")} <Icon icon={ArrowRight} className="h-4 w-4" /></span>
            </Link>
          );
        })}
      </div>
      </>)}
    </Card>
  );
}

function fmtWhen(s: string, lang: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

type DraftSort = "updated" | "expiry" | "progress" | "form";

function DraftsList({ drafts, busyId, onDelete }: { drafts: DraftListItem[]; busyId: string | null; onDelete: (id: string) => void }) {
  const { t, tt, lang } = useT();
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<DraftSort>("updated");
  const cats = useMemo(() => Array.from(new Set(drafts.map((d) => d.category).filter((c): c is string => !!c))), [drafts]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = drafts.filter((d) => (cat === "all" || d.category === cat) && (!n || `${d.formTitle} ${d.title}`.toLowerCase().includes(n)));
    const time = (s: string) => new Date(s).getTime() || 0;
    const cmp: Record<DraftSort, (a: DraftListItem, b: DraftListItem) => number> = {
      updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
      expiry: (a, b) => time(a.expiresAt) - time(b.expiresAt),
      progress: (a, b) => (b.total ? b.filled / b.total : 0) - (a.total ? a.filled / a.total : 0),
      form: (a, b) => a.formTitle.localeCompare(b.formTitle, lang === "en" ? "en" : "th") || time(b.updatedAt) - time(a.updatedAt),
    };
    return [...list].sort(cmp[sort]);
  }, [drafts, q, cat, sort, lang]);
  if (drafts.length === 0)
    return <Card><EmptyState icon={<Icon icon={FilePen} className="h-7 w-7" />} title={t("draft.empty")} hint={t("draft.emptyHint")} /></Card>;
  const selStyle: React.CSSProperties = { padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", flex: "0 0 auto" };
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
          <Field type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("draft.searchPh")} aria-label={t("draft.searchPh")} style={{ width: "100%", paddingLeft: 32 }} />
        </div>
        {cats.length > 0 && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("forms.allCategories")} className="krok-listsort" style={selStyle}>
            <option value="all">{t("forms.allCategories")}</option>
            {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as DraftSort)} aria-label={t("list.sortBy")} className="krok-listsort" style={selStyle}>
          <option value="updated">{t("draft.sortUpdated")}</option>
          <option value="expiry">{t("draft.sortExpiry")}</option>
          <option value="progress">{t("draft.sortProgress")}</option>
          <option value="form">{t("draft.sortForm")}</option>
        </select>
      </div>
      {shown.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: ".9rem", padding: "20px 0" }}>
          <span style={{ display: "inline-flex" }}><Icon icon={SearchX} className="h-6 w-6" /></span>
          <p style={{ margin: "6px 0 0" }}>{t("list.noMatch")}</p>
        </div>
      )}
      {shown.map((d) => {
        const pct = d.total ? Math.round((d.filled / d.total) * 100) : 0;
        const days = Math.max(0, Math.ceil((new Date(d.expiresAt).getTime() - now) / 864e5));
        return (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--surface)", flexWrap: "wrap", opacity: d.available ? 1 : 0.65 }}>
            <FormIcon value={d.formIcon} size={44} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{d.formTitle}</b>
              <div style={{ fontSize: ".85rem", color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || t("draft.untitled")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ flex: "0 1 140px", height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                </div>
                <small style={{ color: "var(--ink-3)", fontSize: ".74rem" }}>
                  {tt("draft.progress", { n: d.filled, total: d.total })} · {tt("draft.step", { n: Math.min(d.stepIdx + 1, d.steps), total: d.steps })}
                </small>
              </div>
              <small style={{ display: "flex", alignItems: "center", gap: 4, color: days <= 3 ? "#d97706" : "var(--ink-3)", fontSize: ".72rem", marginTop: 4 }}>
                <Icon icon={Clock} className="h-3 w-3" /> {tt("draft.updated", { t: fmtWhen(d.updatedAt, lang) })} · {tt("draft.expires", { d: days })}
              </small>
              {!d.available && <small style={{ display: "block", color: "var(--fail)", fontSize: ".74rem" }}>{t("draft.formGone")}</small>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => onDelete(d.id)} disabled={busyId === d.id} aria-label={t("draft.delete")} title={t("draft.delete")}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--fail)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>
                <Icon icon={Trash2} className="h-4 w-4" />
              </button>
              {d.available && (
                <Link href={`/fill/${d.formId}?draft=${d.id}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, padding: "8px 14px", borderRadius: 8, fontSize: ".88rem", fontWeight: 600, textDecoration: "none", background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}>
                  {t("draft.continue")} <Icon icon={ArrowRight} className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
