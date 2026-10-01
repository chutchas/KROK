"use client";
// ============================================================
// KROK · คลังเทมเพลต — แสดงในหน้า "สร้างฟอร์ม" เป็นโหมดที่ 3 (ข้าง "พิมพ์อธิบาย (AI)" / "จากไฟล์ฟอร์มเดิม")
// กด "ใช้เทมเพลตนี้" → onUse(id) ให้หน้าสร้างฟอร์มเปิดเป็นร่างในแท็บแก้ไข (ยังไม่บันทึกจนกดเผยแพร่)
// ============================================================
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { ChevronDown, ChevronUp, Plus, Info, Search as SearchIcon, SearchX } from "lucide-react";
import { Field } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { FORM_TEMPLATES, TEMPLATE_INDUSTRIES } from "@/lib/form-templates";
import { categoryLabel } from "@/lib/form-categories";

export default function TemplateGallery({ onUse }: { onUse: (id: string) => void }) {
  const { t, tt, lang } = useT();
  const [catFilter, setCatFilter] = useState("all");
  const [indFilter, setIndFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const cats = useMemo(
    () => Array.from(new Set(FORM_TEMPLATES.map((tpl) => tpl.schema.category).filter((c): c is string => !!c))),
    []
  );
  // ค้นจากชื่อ คำอธิบาย ประเภท อุตสาหกรรม และชื่อช่องในฟอร์ม
  const indLabel = (k: string) => { const i = TEMPLATE_INDUSTRIES.find((x) => x.key === k); return i ? (lang === "en" ? i.en : i.th) : k; };
  const needle = q.trim().toLowerCase();
  const list = FORM_TEMPLATES.filter((tpl) => {
    if (catFilter !== "all" && tpl.schema.category !== catFilter) return false;
    if (indFilter !== "all" && !tpl.industries.includes(indFilter)) return false;
    if (!needle) return true;
    const s = tpl.schema;
    const hay = [s.title, s.description, categoryLabel(s.category, lang), ...tpl.industries.map(indLabel), ...s.steps.flatMap((st) => [st.title, ...st.fields.map((f) => f.label)])].join(" ").toLowerCase();
    return hay.includes(needle);
  });
  const usedInd = TEMPLATE_INDUSTRIES.filter((i) => FORM_TEMPLATES.some((tpl) => tpl.industries.includes(i.key)));
  const filtered = catFilter !== "all" || indFilter !== "all" || !!needle;
  const selStyle: React.CSSProperties = { padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", minWidth: 180, flex: "0 0 auto" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", margin: "10px 0 4px", fontSize: ".8rem", color: "var(--ink-2)" }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}><Icon icon={Info} className="h-4 w-4" /></span>
        <span>{t("templates.note")}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", alignItems: "stretch" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
          <Field type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("templates.search")} aria-label={t("templates.search")} style={{ width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="krok-typefilter" aria-label={t("templates.byTask")} style={selStyle}>
          <option value="all">{t("templates.allTasks")}</option>
          {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
        </select>
        <select value={indFilter} onChange={(e) => setIndFilter(e.target.value)} className="krok-typefilter" aria-label={t("templates.byIndustry")} style={selStyle}>
          <option value="all">{t("templates.allIndustries")}</option>
          {usedInd.map((i) => <option key={i.key} value={i.key}>{lang === "en" ? i.en : i.th}</option>)}
        </select>
      </div>
      <div style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "-4px 0 8px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {tt("templates.count", { n: list.length, total: FORM_TEMPLATES.length })}
        {filtered && (
          <button type="button" onClick={() => { setQ(""); setCatFilter("all"); setIndFilter("all"); }}
            style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", padding: 0 }}>
            {t("templates.clearFilters")}
          </button>
        )}
      </div>

      {list.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: ".9rem", padding: "28px 0" }}>
          <span style={{ display: "inline-flex" }}><Icon icon={SearchX} className="h-6 w-6" /></span>
          <p style={{ margin: "6px 0 0" }}>{t("templates.noMatch")}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 6 }}>
        {list.map((tpl) => {
          const s = tpl.schema;
          const open = openId === tpl.id;
          return (
            <div key={tpl.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, background: "var(--surface)", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontFamily: "var(--font-anuphan)", display: "block" }}>{s.title}</b>
                  <small style={{ color: "var(--ink-3)", fontSize: ".76rem" }}>
                    {s.category && (
                      <span style={{ display: "inline-block", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "0 6px", marginRight: 6, color: "var(--ink-2)" }}>
                        {categoryLabel(s.category, lang)}
                      </span>
                    )}
                    {tt("forms.stepsFields", { steps: s.steps.length, fields: s.steps.reduce((n, st) => n + st.fields.length, 0) })}
                  </small>
                </div>
              </div>

              <p style={{ color: "var(--ink-2)", fontSize: ".84rem", margin: "10px 0 12px", flex: 1 }}>{s.description}</p>

              {open && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginBottom: 12 }}>
                  {s.steps.map((st, si) => (
                    <div key={si} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--ink-2)", marginBottom: 3 }}>{si + 1}. {st.title}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {st.fields.map((f) => (
                          <span key={f.id} style={{ fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 7px", color: "var(--ink-2)" }}>
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button variant="primary" onClick={() => onUse(tpl.id)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon icon={Plus} className="h-4 w-4" /> {t("templates.use")}
                </Button>
                <Button variant="ghost" onClick={() => setOpenId(open ? null : tpl.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".82rem" }}>
                  <Icon icon={open ? ChevronUp : ChevronDown} className="h-4 w-4" /> {open ? t("templates.hide") : t("templates.preview")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@media(max-width:640px){ .krok-typefilter{ width:100%; min-width:0 !important; } }`}</style>
    </div>
  );
}
