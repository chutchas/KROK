"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowRight, Search as SearchIcon } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { categoryLabel } from "@/lib/form-categories";

export interface FormListItem {
  id: string;
  title: string;
  icon: string;
  steps: number;
  fields: number;
  category?: string;
}

export default function FormsListClient({ forms, highlightId }: { forms: FormListItem[]; highlightId?: string }) {
  const { t, tt, lang } = useT();
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

      {forms.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("forms.search")} style={{ width: "100%", paddingLeft: 32 }} />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem" }}>
            <option value="all">{t("forms.allCategories")}</option>
            {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {forms.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("forms.empty")}</span>}
        {forms.length > 0 && filtered.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("forms.noMatch")}</span>}
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
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                {f.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {f.category && <span style={{ display: "inline-block", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", marginRight: 6, color: "var(--ink-2)" }}>{categoryLabel(f.category, lang)}</span>}
                  {tt("forms.stepsFields", { steps: f.steps, fields: f.fields })}
                </small>
              </div>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4 }}>{t("forms.start")} <Icon icon={ArrowRight} className="h-4 w-4" /></span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
