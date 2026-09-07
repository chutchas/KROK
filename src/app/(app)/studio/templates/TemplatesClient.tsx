"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Info } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { FORM_TEMPLATES } from "@/lib/form-templates";
import { categoryLabel } from "@/lib/form-categories";
import { createFromTemplate } from "@/app/(app)/studio/actions";

export default function TemplatesClient() {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [catFilter, setCatFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const cats = useMemo(
    () => Array.from(new Set(FORM_TEMPLATES.map((tpl) => tpl.schema.category).filter((c): c is string => !!c))),
    []
  );

  const list = FORM_TEMPLATES.filter((tpl) => catFilter === "all" || tpl.schema.category === catFilter);

  async function use(id: string) {
    setBusyId(id);
    setErr("");
    try {
      const res = await createFromTemplate(id);
      if ("error" in res) {
        setErr(res.error);
        setBusyId(null);
        return;
      }
      router.push(`/forms?f=${res.id}`);
    } catch {
      setErr("สร้างฟอร์มไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/studio" style={{ fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon icon={ArrowLeft} className="h-4 w-4" /> {t("templates.back")}
        </Link>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("templates.title")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("templates.subtitle")}</p>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", margin: "10px 0 4px", fontSize: ".8rem", color: "var(--ink-2)" }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}><Icon icon={Info} className="h-4 w-4" /></span>
          <span>{t("templates.note")}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="krok-typefilter"
            style={{ padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", minWidth: 200 }}
          >
            <option value="all">{t("forms.allCategories")}</option>
            {cats.map((c) => (
              <option key={c} value={c}>{categoryLabel(c, lang)}</option>
            ))}
          </select>
        </div>

        {err && <Notice kind="error">{err}</Notice>}

        {list.length === 0 && (
          <p style={{ color: "var(--ink-3)", fontSize: ".9rem" }}>{t("templates.emptyCat")}</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 6 }}>
          {list.map((tpl) => {
            const s = tpl.schema;
            const open = openId === tpl.id;
            const busy = busyId === tpl.id;
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
                  <Button variant="primary" onClick={() => use(tpl.id)} disabled={busy} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {busy ? t("templates.using") : <><Icon icon={Plus} className="h-4 w-4" /> {t("templates.use")}</>}
                  </Button>
                  <Button variant="ghost" onClick={() => setOpenId(open ? null : tpl.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: ".82rem" }}>
                    <Icon icon={open ? ChevronUp : ChevronDown} className="h-4 w-4" /> {open ? t("templates.hide") : t("templates.preview")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <style>{`@media(max-width:640px){ .krok-typefilter{ width:100%; min-width:0 !important; } }`}</style>
    </div>
  );
}
