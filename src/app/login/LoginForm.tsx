"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import LanguageToggle from "@/components/LanguageToggle";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { org_name: org, display_name: name } },
        });
        if (error) throw error;
        setMsg({ t: t("login.signupOk") });
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(params.get("next") || "/dashboard");
        router.refresh();
      }
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : "เกิดข้อผิดพลาด", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "56px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div className="hazard" style={{ width: 40, height: 40, borderRadius: 9 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.6rem" }}>KROK</div>
          <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{t("login.tagline")}</div>
        </div>
        <LanguageToggle />
      </div>

      <Card>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 4 }}>
          {mode === "signin" ? t("login.signin") : t("login.signupTitle")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", marginTop: 0 }}>
          {mode === "signin" ? t("login.signinHint") : t("login.signupHint")}
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 10 }}>
          {mode === "signup" && (
            <>
              <Field placeholder={t("login.org")} value={org} onChange={(e) => setOrg(e.target.value)} required />
              <Field placeholder={t("login.name")} value={name} onChange={(e) => setName(e.target.value)} required />
            </>
          )}
          <Field
            type="email"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Field
            type="password"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          <Button variant="primary" type="submit" disabled={busy} style={{ padding: 13 }}>
            {busy ? t("login.working") : mode === "signin" ? t("login.doSignin") : t("login.doSignup")}
          </Button>
        </form>

        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
          style={{
            marginTop: 14,
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: ".88rem",
          }}
        >
          {mode === "signin" ? t("login.toSignup") : t("login.toSignin")}
        </button>
      </Card>
    </div>
  );
}
