"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import type { Lang, MessageKey } from "@/i18n/dictionaries";
import { saveProfile } from "./actions";

export interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  language: Lang;
  email: string;
  role: "owner" | "admin" | "designer" | "operator";
}

export default function ProfileClient({ initial }: { initial: ProfileData }) {
  const router = useRouter();
  const { t, setLang } = useT();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const set = (k: keyof ProfileData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveProfile({
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      position: form.position,
      language: form.language,
    });
    setBusy(false);
    if ("error" in res) {
      setMsg({ t: res.error, err: true });
      return;
    }
    setLang(form.language); // ใช้ภาษาใหม่ทันที
    setMsg({ t: t("common.saved"), err: false });
    router.refresh();
  }

  const label: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", display: "block", marginBottom: 4 };
  const roleLabel = t(("role." + form.role) as MessageKey);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("profile.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("profile.subtitle")}</p>
      </div>

      <Card>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.firstName")}</label>
              <Field value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <label style={label}>{t("profile.lastName")}</label>
              <Field value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>

          <div>
            <label style={label}>{t("profile.email")}</label>
            <Field value={form.email} readOnly disabled style={{ opacity: 0.7 }} />
            <p style={{ color: "var(--ink-3)", fontSize: ".76rem", margin: "4px 0 0" }}>{t("profile.emailReadonly")}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.phone")}</label>
              <Field value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" />
            </div>
            <div>
              <label style={label}>{t("profile.position")}</label>
              <Field value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="เช่น หัวหน้ากะ / QA" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.role")}</label>
              <div style={{ padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2, var(--code-bg))", color: "var(--ink-2)", fontSize: ".95rem" }}>
                {roleLabel}
              </div>
            </div>
            <div>
              <label style={label}>{t("profile.language")}</label>
              <select
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
                style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem" }}
              >
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

          <div>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
