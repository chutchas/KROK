"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";
import { PASSWORD_MIN } from "@/lib/auth-validate";

const lbl: React.CSSProperties = { display: "block", fontSize: ".84rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 };
const bad: React.CSSProperties = { borderColor: "var(--fail)", boxShadow: "0 0 0 1px var(--fail)" };
const errSt: React.CSSProperties = { color: "var(--fail)", fontSize: ".8rem", marginTop: 4, lineHeight: 1.4 };

export default function ResetPasswordForm() {
  const { t, tt } = useT();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  // ตรวจระหว่างกรอก: แสดงหลังออกจากช่อง หรือหลังกดบันทึก
  const [touched, setTouched] = useState<{ pw?: boolean; pw2?: boolean }>({});
  const [tried, setTried] = useState(false);
  const pwShort = pw.length < PASSWORD_MIN;
  const showPwErr = pwShort && (tried || !!touched.pw);
  // ช่องยืนยัน: บอกไม่ตรงทันทีเมื่อพิมพ์ยาวเท่าช่องแรกแล้ว หรือออกจากช่อง
  const mismatch = pw2 !== pw;
  const showPw2Err = (!pw2 && (tried || !!touched.pw2)) || (!!pw2 && mismatch && (tried || !!touched.pw2 || pw2.length >= pw.length));
  // บัญชีที่กำลังตั้งรหัส (ให้เห็นชัดว่าเป็นของใคร)
  const [who, setWho] = useState("");
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setWho(data.user?.email || "")).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (pwShort || !pw2 || mismatch) {
      document.querySelector<HTMLInputElement>("[data-reset-form] [aria-invalid='true']")?.focus();
      return;
    }
    setBusy(true);
    setMsg(null);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setBusy(false); setMsg({ t: error.message, err: true }); return; }
    setMsg({ t: t("reset.done") });
    // ตั้งรหัสใหม่แล้ว → ออกจากระบบทุกเครื่องของบัญชีนี้ แล้วให้เข้าสู่ระบบด้วยรหัสใหม่
    await sb.auth.signOut({ scope: "global" }).catch(() => sb.auth.signOut({ scope: "local" }));
    // อีเมลส่งต่อทาง sessionStorage (ไม่ใส่ใน URL → ไม่ติดประวัติเบราว์เซอร์/log)
    try { if (who) sessionStorage.setItem("krok_pwreset_email", who); } catch { /* ไม่มี storage */ }
    router.replace("/login?pwreset=1");
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
        <form onSubmit={submit} noValidate data-reset-form style={{ display: "grid", gap: 12, marginTop: 10 }}>
          <div>
            <label htmlFor="r-pw" style={lbl}>{t("reset.new")}</label>
            <Field id="r-pw" type="password" placeholder={tt("login.passwordNew", { n: PASSWORD_MIN })} value={pw} onChange={(e) => setPw(e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, pw: true }))} aria-invalid={showPwErr} aria-describedby={showPwErr ? "r-err-pw" : undefined}
              autoComplete="new-password" autoFocus style={{ width: "100%", ...(showPwErr ? bad : {}) }} />
            {showPwErr && <div id="r-err-pw" role="alert" style={errSt}>{tt("reset.short", { n: PASSWORD_MIN })}</div>}
          </div>
          <div>
            <label htmlFor="r-pw2" style={lbl}>{t("reset.confirm")}</label>
            <Field id="r-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, pw2: true }))} aria-invalid={showPw2Err} aria-describedby={showPw2Err ? "r-err-pw2" : undefined}
              autoComplete="new-password" style={{ width: "100%", ...(showPw2Err ? bad : {}) }} />
            {showPw2Err && <div id="r-err-pw2" role="alert" style={errSt}>{pw2 ? t("reset.mismatch") : t("login.passwordRequired")}</div>}
          </div>
          <Button variant="primary" type="submit" disabled={busy} style={{ padding: 13 }}>{busy ? t("login.working") : t("reset.save")}</Button>
        </form>
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>
    </div>
  );
}
