"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
// supabase-js (~58KB gz) โหลดเมื่อจะใช้จริงเท่านั้น — หน้า landing/login แสดงผลได้เร็วขึ้น
const createClient = async () => (await import("@/lib/supabase/client")).createClient();
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import LanguageToggle from "@/components/LanguageToggle";
import { LogoMark } from "@/components/Logo";
import { LEGAL_VERSION } from "@/lib/legal";
import { safeNextPath } from "@/lib/safe-next";
import GoogleSignInButton, { googleClientId } from "@/components/GoogleSignInButton";
import { emailIssue, hasNonAscii, passwordIssue, PASSWORD_MIN } from "@/lib/auth-validate";
import { clearBundles } from "@/lib/offline-store";

export default function LoginForm({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { t, tt, lang } = useT();
  const sp = useSearchParams();
  // ลิงก์จากอีเมลเชิญ: /login?invite=<email> → เปิดหน้าสมัครพร้อมอีเมล ไม่ต้องตั้งชื่อองค์กร (เข้า workspace ที่เชิญ)
  const invited = (sp.get("invite") || "").trim().toLowerCase();
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "mfa">(invited ? "signup" : "signin");
  // ยืนยันตัวตน 2 ขั้น: factor TOTP ที่ต้องกรอกรหัส
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(invited || "");
  // หลังตั้งรหัสใหม่: เติมอีเมลบัญชีที่เพิ่งรีเซ็ต (ส่งมาทาง sessionStorage ไม่ใช่ URL) แล้วลบทิ้ง
  useEffect(() => {
    if (!sp.get("pwreset") || invited) return;
    try {
      const e = sessionStorage.getItem("krok_pwreset_email");
      sessionStorage.removeItem("krok_pwreset_email");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (e) setEmail(e.trim().slice(0, 200));
    } catch { /* ไม่มี storage */ }
  }, [sp, invited]);
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  // ตรวจระหว่างกรอก: แสดงหลังออกจากช่อง (หรือหลังกดส่งครั้งแรก) · พิมพ์ภาษาไทยในช่องอีเมล = แจ้งทันที
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean; org?: boolean; name?: boolean }>({});
  const [tried, setTried] = useState(false);
  // เปลี่ยนโหมด (เข้าสู่ระบบ ↔ สมัคร ↔ ลืมรหัส) → เริ่มตรวจใหม่ ไม่ค้างข้อความแดงจากโหมดก่อน
  useEffect(() => { setTried(false); setTouched({}); }, [mode]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(() => {
    if (sp.get("confirmed")) return { t: t("login.confirmedOk") };
    if (sp.get("pwreset")) return { t: t("login.pwResetOk") };
    if (sp.get("deleted")) return { t: t("login.accountDeleted") };
    const e = sp.get("auth_error");
    if (e === "reset") return { t: t("login.resetLinkFail"), err: true };
    if (e === "expired") return { t: t("login.linkExpired"), err: true };
    if (e) return { t: t("login.confirmFail"), err: true }; // ไม่แสดงข้อความจาก URL (กันข้อความหลอกบนโดเมนเรา)
    return null;
  });
  const isInvite = mode === "signup" && !!invited && email.trim().toLowerCase() === invited;
  const eIssue = emailIssue(email);
  const showEmailErr = !!eIssue && (tried || !!touched.email || (eIssue === "login.emailThai" && hasNonAscii(email)));
  const pIssue = passwordIssue(password, mode === "signup");
  const showPwErr = mode !== "reset" && mode !== "mfa" && !!pIssue && (tried || !!touched.password);
  const showOrgErr = mode === "signup" && !isInvite && !org.trim() && (tried || !!touched.org);
  const showNameErr = mode === "signup" && !name.trim() && (tried || !!touched.name);
  const errBorder = (on: boolean): React.CSSProperties | undefined => (on ? { borderColor: "var(--fail)", boxShadow: "0 0 0 1px var(--fail)" } : undefined);

  // /login?mfa=1 — ล็อกอินด้วยรหัสผ่านแล้วแต่ยังไม่ได้กรอกรหัส 2FA (เช่น เปิดแท็บใหม่ / session หมดระดับ aal2)
  const mfaParam = sp.has("mfa");
  // ถึงหน้าล็อกอิน = ไม่มี session แล้ว (ออกจากระบบ / หมดอายุ) → ไม่เก็บฟอร์มของผู้ใช้คนก่อนไว้ในเครื่อง
  // (คิวที่รอส่งและร่างในเครื่องยังอยู่ — ส่ง/เปิดต่อได้เมื่อคนเดิมล็อกอินกลับมา)
  useEffect(() => { void clearBundles(); }, []);

  // หลังเข้าสู่ระบบ: ไปหน้าที่ตั้งใจจะเข้า (?next= — path ภายในเท่านั้น) ไม่งั้นแดชบอร์ด
  const nextRaw = sp.get("next") || "";
  const nextPath = safeNextPath(nextRaw);

  // ปุ่ม Google แสดงเมื่อเปิด provider ใน Supabase แล้วเท่านั้น (อ่านจาก /auth/v1/settings ซึ่งเป็นข้อมูลสาธารณะ)
  const [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) return;
    let alive = true;
    fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.external?.google === true) setGoogleOn(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ปุ่ม Google แบบล็อกอินบนหน้าเว็บ KROK เอง (ตั้ง NEXT_PUBLIC_GOOGLE_CLIENT_ID แล้ว) · ใช้ไม่ได้ = ปุ่มแบบเดิม (ผ่านหน้า Supabase)
  const [gsiOk, setGsiOk] = useState(() => !!googleClientId());

  async function signInWithGoogleToken(token: string, nonce: string) {
    setBusy(true);
    setMsg(null);
    try { if (isInvite) sessionStorage.setItem("krok_invite_auto", "1"); else sessionStorage.removeItem("krok_invite_auto"); } catch { /* ignore */ }
    try {
      const { data, error } = await (await createClient()).auth.signInWithIdToken({ provider: "google", token, nonce });
      if (error) throw error;
      // เปิด 2FA ไว้ → ขอรหัสก่อนเข้าแอป (เหมือนเข้าด้วยรหัสผ่าน)
      const totp = data.user?.factors?.find((f) => f.status === "verified" && f.factor_type === "totp");
      if (totp) { setFactorId(totp.id); setMode("mfa"); return; }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : "เกิดข้อผิดพลาด", err: true });
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMsg(null);
    // มาจากลิงก์เชิญ → หลังเข้าระบบให้รับคำเชิญให้อัตโนมัติ (ผู้ใช้กด "เข้าร่วมด้วย Google" เอง = ยินยอม)
    try { if (isInvite) sessionStorage.setItem("krok_invite_auto", "1"); else sessionStorage.removeItem("krok_invite_auto"); } catch { /* ignore */ }
    // กลับมาที่ /auth/confirm (แลก code เป็น session) แล้วไปหน้าที่ตั้งใจจะเข้า — 2FA / ยอมรับข้อกำหนด ตรวจต่อในแอปตามปกติ
    const next = nextPath;
    const { error } = await (await createClient()).auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) { setBusy(false); setMsg({ t: error.message, err: true }); }
  }
  useEffect(() => {
    if (!mfaParam) return;
    let alive = true;
    createClient().then((sb) => sb.auth.mfa.listFactors()).then(({ data }) => {
      const f = data?.totp?.find((x) => x.status === "verified");
      if (alive && f) { setFactorId(f.id); setMode("mfa"); }
    }, () => {});
    return () => { alive = false; };
  }, [mfaParam]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "mfa") {
      if (!factorId || !/^\d{6}$/.test(code.trim())) { setMsg({ t: t("mfa.codeInvalid"), err: true }); return; }
      setBusy(true);
      setMsg(null);
      const { error } = await (await createClient()).auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) { setBusy(false); setMsg({ t: t("mfa.codeWrong"), err: true }); return; }
      router.push(nextPath);
      router.refresh();
      return;
    }
    setTried(true);
    if (emailIssue(email) || (mode !== "reset" && passwordIssue(password, mode === "signup"))
      || (mode === "signup" && ((!isInvite && !org.trim()) || !name.trim() || !agree))) {
      // ช่องที่ผิดแสดงข้อความใต้ช่องอยู่แล้ว → พาไปช่องแรกที่ต้องแก้
      const first = document.querySelector<HTMLInputElement>("[data-auth-form] [aria-invalid='true']");
      first?.focus();
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = await createClient();
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
        if (!agree) return; // ข้อความแจ้งใต้ช่องติ๊กแล้ว
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // หลักฐานการยอมรับข้อกำหนด/รับทราบนโยบาย (ฉบับไหน เมื่อไร) — เก็บใน user metadata
            data: { org_name: isInvite ? "" : org, ...(isInvite ? { via_invite: true } : {}), display_name: name, terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() },
            // ลิงก์ในอีเมลยืนยันพากลับมาที่แอปแล้วเข้าสู่ระบบให้เลย
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
          },
        });
        if (error) throw error;
        // Supabase ไม่บอก error เมื่ออีเมลนี้มีบัญชีแล้ว (กันเดาอีเมล) แต่ identities จะว่าง
        // ตอบเหมือนสมัครสำเร็จ (ไม่บอกว่าอีเมลนี้มีบัญชีแล้ว — กันเดารายชื่ออีเมลผู้ใช้)
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMsg({ t: tt("login.checkEmail", { email }) });
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
        const { data: signed, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // เปิด 2FA ไว้ → ขอรหัสจากแอปยืนยันตัวตนก่อนเข้าแอป
        const totp = signed.user?.factors?.find((f) => f.status === "verified" && f.factor_type === "totp");
        if (totp) {
          setFactorId(totp.id);
          setPassword("");
          setMode("mfa");
          return;
        }
        // ล็อกอินสำเร็จ → หน้าที่ตั้งใจจะเข้า (หรือแดชบอร์ด)
        router.push(nextPath);
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
        <h2 style={{ fontSize: "1.2rem", marginBottom: 4, paddingRight: embedded ? 40 : undefined }}>
          {mode === "mfa" ? t("mfa.loginTitle") : mode === "signin" ? t("login.signin") : mode === "reset" ? t("login.resetTitle") : isInvite ? t("login.inviteTitle") : t("login.signupTitle")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", marginTop: 0 }}>
          {mode === "mfa" ? t("mfa.loginHint") : mode === "signin" ? t("login.signinHint") : mode === "reset" ? t("login.resetHint") : isInvite ? t("login.inviteHint") : t("login.signupHint")}
        </p>

        {googleOn && (mode === "signin" || mode === "signup") && (
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {gsiOk ? (
              <GoogleSignInButton lang={lang} onCredential={signInWithGoogleToken} onUnavailable={() => setGsiOk(false)} />
            ) : (
              <Button type="button" onClick={signInWithGoogle} disabled={busy} style={{ padding: 12, fontWeight: 600, gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/google-g.webp" alt="" width={22} height={22} style={{ display: "block", flex: "0 0 auto" }} />
                {isInvite ? t("login.googleJoin") : t("login.google")}
              </Button>
            )}
            {mode === "signup" && <span style={{ fontSize: ".76rem", color: "var(--ink-3)", lineHeight: 1.5 }}>{isInvite ? tt("login.googleInviteNote", { email: invited }) : t("login.googleSignupNote")}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-3)", fontSize: ".8rem" }}>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />{t("login.orEmail")}<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
          </div>
        )}

        <form onSubmit={submit} noValidate data-auth-form style={{ display: "grid", gap: 12, marginTop: 10 }}>
          {isInvite && <Notice kind="info">{t("login.inviteNotice")}</Notice>}
          {mode === "signup" && (
            <>
              {!isInvite && (
                <div>
                  <FieldLabel htmlFor="f-org" text={t("login.org")} />
                  <Field id="f-org" placeholder={t("login.orgPh")} value={org} onChange={(e) => setOrg(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, org: true }))}
                    aria-label={t("login.org")} aria-invalid={showOrgErr} aria-describedby={showOrgErr ? "err-org" : undefined} style={{ width: "100%", ...errBorder(showOrgErr) }} />
                  {showOrgErr && <FieldErr id="err-org" text={t("login.orgRequired")} />}
                </div>
              )}
              <div>
                <FieldLabel htmlFor="f-name" text={t("login.name")} />
                <Field id="f-name" placeholder={t("login.namePh")} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, name: true }))}
                  aria-label={t("login.name")} aria-invalid={showNameErr} aria-describedby={showNameErr ? "err-name" : undefined} style={{ width: "100%", ...errBorder(showNameErr) }} />
                {showNameErr && <FieldErr id="err-name" text={t("login.nameRequired")} />}
              </div>
            </>
          )}
          {mode === "mfa" && (
            <Field type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: ".3em", fontSize: "1.2rem", textAlign: "center" }} />
          )}
          {mode !== "mfa" && <>
          {/* Android: type="email" / inputMode="email" ทำให้คีย์บอร์ดเข้าโหมดอีเมล แล้วกดค้างปุ่มเปลี่ยนภาษาแล้วคีย์บอร์ดปิด
              → ใช้ช่องข้อความธรรมดา (คีย์บอร์ดปกติ เปลี่ยนภาษาได้) แล้วตรวจรูปแบบอีเมลเองตอนกดส่ง */}
          <div>
            <FieldLabel htmlFor="f-email" text={t("login.email")} />
            <Field
              id="f-email"
              type="text"
              name="email"
              placeholder="name@company.com"
              aria-label={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, email: true }))}
              aria-invalid={showEmailErr}
              aria-describedby={showEmailErr ? "err-email" : undefined}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{ width: "100%", ...errBorder(showEmailErr) }}
            />
            {showEmailErr && eIssue && <FieldErr id="err-email" text={t(eIssue)} />}
          </div>
          {mode !== "reset" && (
            <div>
              <FieldLabel htmlFor="f-pw" text={t("login.password")} />
              <Field
                id="f-pw"
                type="password"
                placeholder={mode === "signup" ? tt("login.passwordNew", { n: PASSWORD_MIN }) : "••••••"}
                aria-label={t("login.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((x) => ({ ...x, password: true }))}
                aria-invalid={showPwErr}
                aria-describedby={showPwErr ? "err-pw" : undefined}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                style={{ width: "100%", ...errBorder(showPwErr) }}
              />
              {showPwErr && pIssue && <FieldErr id="err-pw" text={pIssue === "login.passwordShort" ? tt("login.passwordShort", { n: PASSWORD_MIN }) : t(pIssue)} />}
            </div>
          )}
          </>}
          {mode === "signin" && (
            <button type="button" onClick={() => { setMode("reset"); setMsg(null); }}
              style={{ justifySelf: "end", margin: "-12px -8px -8px 0", minHeight: 44, background: "none", border: "none", padding: "0 8px", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".84rem" }}>
              {t("login.forgot")}
            </button>
          )}
          {mode === "signup" && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: ".84rem", color: "var(--ink-2)", cursor: "pointer", lineHeight: 1.5 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-invalid={mode === "signup" && tried && !agree}
                style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0, accentColor: "var(--accent)" }} />
              <span>
                {t("legal.agreePre")} <a href="/terms" target="_blank" rel="noopener" style={legalLink}>{t("legal.terms")}</a> {t("legal.agreeMid")} <a href="/privacy" target="_blank" rel="noopener" style={legalLink}>{t("legal.privacy")}</a>
              </span>
            </label>
          )}
          {mode === "signup" && tried && !agree && (
            <FieldErr id="err-agree" text={t("legal.mustAgree")} />
          )}
          <Button variant="primary" type="submit" disabled={busy} style={{ padding: 13 }}>
            {busy ? t("login.working") : mode === "mfa" ? t("mfa.verify") : mode === "signin" ? t("login.doSignin") : mode === "reset" ? t("login.doReset") : isInvite ? t("login.doJoin") : t("login.doSignup")}
          </Button>
        </form>

        {msg && (
          <Notice kind={msg.err ? "error" : "info"}>
            {/* บรรทัดแรก = ข้อความหลัก · บรรทัดถัดไป = หมายเหตุ (ตัวเล็ก สีจาง) */}
            {msg.t.split("\n").map((line, i) => (
              <span key={i} style={i === 0 ? { display: "block" } : { display: "block", marginTop: 6, fontSize: ".8rem", color: "var(--ink-3)" }}>{line}</span>
            ))}
          </Notice>
        )}

        <button
          onClick={async () => {
            if (mode === "mfa") {
              // ใช้บัญชีอื่น: ออกจาก session ที่ค้างขั้น 2FA
              await (await createClient()).auth.signOut({ scope: "local" }).catch(() => {});
              setFactorId(null);
              setCode("");
              setMode("signin");
              setMsg(null);
              return;
            }
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
          style={{
            marginTop: 6,
            minHeight: 44,
            padding: "0 2px",
            background: "none",
            border: "none",
            color: "var(--accent-text)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: ".88rem",
          }}
        >
          {mode === "mfa" ? t("mfa.otherAccount") : mode === "signin" ? t("login.toSignup") : mode === "reset" ? t("login.backToSignin") : t("login.toSignin")}
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

const legalLink: React.CSSProperties = { color: "var(--accent-text)", textDecoration: "underline" };

/** ข้อความผิดใต้ช่อง (อ่านโดยโปรแกรมอ่านหน้าจอผ่าน aria-describedby) */
function FieldErr({ id, text }: { id: string; text: string }) {
  return <div id={id} role="alert" style={{ color: "var(--fail)", fontSize: ".8rem", marginTop: 4, lineHeight: 1.4 }}>{text}</div>;
}

function FieldLabel({ htmlFor, text }: { htmlFor: string; text: string }) {
  return <label htmlFor={htmlFor} style={{ display: "block", fontSize: ".84rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>{text}</label>;
}
