"use client";
import { useEffect, useState } from "react";
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
  // บัญชีที่กำลังตั้งรหัส (ให้เห็นชัดว่าเป็นของใคร)
  const [who, setWho] = useState("");
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setWho(data.user?.email || "")).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setMsg({ t: t("reset.mismatch"), err: true }); return; }
    setBusy(true);
    setMsg(null);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setBusy(false); setMsg({ t: error.message, err: true }); return; }
    setMsg({ t: t("reset.done") });
    // ตั้งรหัสใหม่แล้ว → ออกจากระบบทุกเครื่องของบัญชีนี้ แล้วให้เข้าสู่ระบบด้วยรหัสใหม่
    await sb.auth.signOut({ scope: "global" }).catch(() => sb.auth.signOut({ scope: "local" }));
    const q = new URLSearchParams({ pwreset: "1" });
    if (who) q.set("email", who);
    router.replace(`/login?${q.toString()}`);
    router.refresh();
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
        {who && <p style={{ fontSize: ".88rem", margin: "0 0 6px" }}>{t("reset.account")} <b>{who}</b></p>}
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
