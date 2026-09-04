"use client";
import Link from "next/link";
import { Card } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";

export interface FormListItem {
  id: string;
  title: string;
  icon: string;
  steps: number;
  fields: number;
}

export default function FormsListClient({ forms }: { forms: FormListItem[] }) {
  const { t, tt } = useT();
  return (
    <Card>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>{t("forms.title")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("forms.subtitle")}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {forms.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("forms.empty")}</span>}
        {forms.map((f) => (
          <Link
            key={f.id}
            href={`/fill/${f.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "16px",
              background: "var(--surface)",
              textDecoration: "none",
              color: "var(--ink)",
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
              {f.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>
              <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                {tt("forms.stepsFields", { steps: f.steps, fields: f.fields })}
              </small>
            </div>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: ".9rem" }}>{t("forms.start")} →</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
