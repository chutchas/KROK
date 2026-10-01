"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";

export default function ResetPasswordForm() {
  const { t } = useT();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setMsg({ t: t("reset.mismatch"), err: true }); return; }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ t: error.message, err: true }); return; }
    setMsg({ t: t("reset.done") });
    setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 900);
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "56px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <LogoMark size={34} title="KROK" />
        <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.4rem" }}>KROK</b>
      </div>
      <Card>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 4 }}>{t("reset.title")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", marginTop: 0 }}>{t("reset.hint")}</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 10 }}>
          <Field type="password" placeholder={t("reset.new")} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" autoFocus />
          <Field type="password" placeholder={t("reset.confirm")} value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />
          <Button variant="primary" type="submit" disabled={busy} style={{ padding: 13 }}>{busy ? t("login.working") : t("reset.save")}</Button>
        </form>
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>
    </div>
  );
}
