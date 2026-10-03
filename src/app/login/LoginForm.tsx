"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import LanguageToggle from "@/components/LanguageToggle";
import { LogoMark } from "@/components/Logo";
import { LEGAL_VERSION } from "@/lib/legal";

export default function LoginForm({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { t, tt } = useT();
  const sp = useSearchParams();
  // ลิงก์จากอีเมลเชิญ: /login?invite=<email> → เปิดหน้าสมัครพร้อมอีเมล ไม่ต้องตั้งชื่อองค์กร (เข้า workspace ที่เชิญ)
  const invited = (sp.get("invite") || "").trim().toLowerCase();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(invited ? "signup" : "signin");
  const [email, setEmail] = useState(invited);
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(() => {
    if (sp.get("confirmed")) return { t: t("login.confirmedOk") };
    if (sp.get("deleted")) return { t: t("login.accountDeleted") };
    const e = sp.get("auth_error");
    if (e === "reset") return { t: t("login.resetLinkFail"), err: true };
    if (e) return { t: e === "1" ? t("login.confirmFail") : `${t("login.confirmFail")} (${e})`, err: true };
    return null;
  });
  const isInvite = mode === "signup" && !!invited && email.trim().toLowerCase() === invited;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg({ t: t("login.emailInvalid"), err: true });
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      if (mode === "reset") {
        // ลืมรหัสผ่าน: Supabase ส่งลิงก์ → /auth/confirm แลก session → /reset-password ตั้งรหัสใหม่
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        });
        if (error) throw error;
        // ข้อความเดียวกันไม่ว่าอีเมลจะมีบัญชีหรือไม่ (กันเดาว่าอีเมลไหนสมัครไว้)
        setMsg({ t: tt("login.resetSent", { email: email.trim() }) });
        return;
      }
      if (mode === "signup") {
        if (!agree) { setMsg({ t: t("legal.mustAgree"), err: true }); return; }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // หลักฐานการยอมรับข้อกำหนด/รับทราบนโยบาย (ฉบับไหน เมื่อไร) — เก็บใน user metadata
            data: { org_name: isInvite ? "" : org, display_name: name, terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() },
            // ลิงก์ในอีเมลยืนยันพากลับมาที่แอปแล้วเข้าสู่ระบบให้เลย
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
          },
        });
        if (error) throw error;
        // Supabase ไม่บอก error เมื่ออีเมลนี้มีบัญชีแล้ว (กันเดาอีเมล) แต่ identities จะว่าง
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMsg({ t: t("login.alreadyRegistered"), err: true });
          setMode("signin");
          return;
        }
        // ปิดการยืนยันอีเมลไว้ → ได้ session ทันที เข้าแอปเลย
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setMsg({ t: tt("login.checkEmail", { email }) });
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // ล็อกอินสำเร็จ → เข้าแดชบอร์ดเสมอ
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : "เกิดข้อผิดพลาด", err: true });
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
      <LogoMark size={40} title="KROK" />
      <div style={{ flex: 1 }}>
        <div className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.6rem" }}>KROK</div>
        <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{t("login.tagline")}</div>
      </div>
      <LanguageToggle />
    </div>
  );

  return (
    <div style={embedded ? undefined : { maxWidth: 400, margin: "0 auto", padding: "56px 20px" }}>
      {!embedded && header}

      <Card>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 4 }}>
          {mode === "signin" ? t("login.signin") : mode === "reset" ? t("login.resetTitle") : isInvite ? t("login.inviteTitle") : t("login.signupTitle")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", marginTop: 0 }}>
          {mode === "signin" ? t("login.signinHint") : mode === "reset" ? t("login.resetHint") : isInvite ? t("login.inviteHint") : t("login.signupHint")}
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 10 }}>
          {isInvite && <Notice kind="info">{t("login.inviteNotice")}</Notice>}
          {mode === "signup" && (
            <>
              {!isInvite && <Field placeholder={t("login.org")} value={org} onChange={(e) => setOrg(e.target.value)} required />}
              <Field placeholder={t("login.name")} value={name} onChange={(e) => setName(e.target.value)} required />
            </>
          )}
          {/* Android: type="email" / inputMode="email" ทำให้คีย์บอร์ดเข้าโหมดอีเมล แล้วกดค้างปุ่มเปลี่ยนภาษาแล้วคีย์บอร์ดปิด
              → ใช้ช่องข้อความธรรมดา (คีย์บอร์ดปกติ เปลี่ยนภาษาได้) แล้วตรวจรูปแบบอีเมลเองตอนกดส่ง */}
          <Field
            type="text"
            name="email"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {mode !== "reset" && (
            <Field
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          )}
          {mode === "signin" && (
            <button type="button" onClick={() => { setMode("reset"); setMsg(null); }}
              style={{ justifySelf: "end", marginTop: -4, background: "none", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".84rem" }}>
              {t("login.forgot")}
            </button>
          )}
          {mode === "signup" && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: ".84rem", color: "var(--ink-2)", cursor: "pointer", lineHeight: 1.5 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required
                style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0, accentColor: "var(--accent)" }} />
              <span>
                {t("legal.agreePre")} <a href="/terms" target="_blank" rel="noopener" style={legalLink}>{t("legal.terms")}</a> {t("legal.agreeMid")} <a href="/privacy" target="_blank" rel="noopener" style={legalLink}>{t("legal.privacy")}</a>
              </span>
            </label>
          )}
          <Button variant="primary" type="submit" disabled={busy} style={{ padding: 13 }}>
            {busy ? t("login.working") : mode === "signin" ? t("login.doSignin") : mode === "reset" ? t("login.doReset") : isInvite ? t("login.doJoin") : t("login.doSignup")}
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
          {mode === "signin" ? t("login.toSignup") : mode === "reset" ? t("login.backToSignin") : t("login.toSignin")}
        </button>
      </Card>
      {!embedded && (
        <div style={{ marginTop: 16, textAlign: "center", fontSize: ".8rem", color: "var(--ink-3)" }}>
          <a href="/privacy" style={{ color: "inherit" }}>{t("legal.privacy")}</a> · <a href="/terms" style={{ color: "inherit" }}>{t("legal.terms")}</a>
        </div>
      )}
    </div>
  );
}

const legalLink: React.CSSProperties = { color: "var(--accent)", textDecoration: "underline" };
