"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { confirmDialog } from "@/components/dialogs";
import { createClient } from "@/lib/supabase/client";

type Enroll = { factorId: string; qr: string; secret: string };

// เปิด/ปิดการยืนยันตัวตน 2 ขั้น (TOTP ผ่าน Supabase Auth MFA)
export default function TwoFactorCard() {
  const { t } = useT();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined); // undefined = กำลังโหลด
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  async function refresh() {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null);
  }
  useEffect(() => {
    let alive = true;
    createClient().auth.mfa.listFactors().then(({ data }) => {
      if (alive) setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null);
    }, () => { if (alive) setFactorId(null); });
    return () => { alive = false; };
  }, []);

  async function start() {
    setBusy(true); setMsg(null);
    const sb = createClient();
    // ล้าง factor ที่เริ่มไว้แต่ยังไม่ยืนยัน (กด "เปิดใช้" ซ้ำ)
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `KROK ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) { setMsg({ t: error?.message || "error", err: true }); return; }
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!enroll || !/^\d{6}$/.test(code)) { setMsg({ t: t("mfa.codeInvalid"), err: true }); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code });
    setBusy(false);
    if (error) { setMsg({ t: t("mfa.codeWrong"), err: true }); return; }
    setEnroll(null); setCode("");
    setMsg({ t: t("mfa.enabledOk") });
    await refresh();
    router.refresh();
  }

  async function disable() {
    if (!factorId) return;
    if (!(await confirmDialog({ message: t("mfa.disableConfirm"), confirmLabel: t("mfa.disable"), danger: true }))) return;
    setBusy(true); setMsg(null);
    const sb = createClient();
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (!error) await sb.auth.refreshSession().catch(() => {});
    setBusy(false);
    if (error) { setMsg({ t: error.message, err: true }); return; }
    await refresh();
    router.refresh();
  }

  return (
    <Card>
      <h3 style={{ fontSize: "1rem", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon icon={ShieldCheck} className="h-4 w-4" /> {t("mfa.title")}
      </h3>
      <p style={{ color: "var(--ink-2)", fontSize: ".86rem", margin: "0 0 10px" }}>{factorId ? t("mfa.hintOn") : t("mfa.hintOff")}</p>
      {factorId === undefined ? null : factorId ? (
        <>
          <Button onClick={disable} loading={busy}>{t("mfa.disable")}</Button>
          <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "8px 0 0" }}>{t("mfa.lostPhone")}</p>
        </>
      ) : enroll ? (
        <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
          <div style={{ fontSize: ".86rem" }}>{t("mfa.scan")}</div>
          {/* qr_code จาก Supabase เป็น data:image/svg+xml */}
          <img src={enroll.qr} alt="QR" width={180} height={180} style={{ background: "#fff", borderRadius: 8, padding: 8, border: "1px solid var(--line)" }} />
          <code style={{ fontSize: ".8rem", overflowWrap: "anywhere", background: "var(--code-bg)", padding: "6px 8px", borderRadius: 6 }}>{t("mfa.secret")}: {enroll.secret}</code>
          <div style={{ fontSize: ".86rem" }}>{t("mfa.enterCode")}</div>
          <Field type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: ".3em", textAlign: "center", fontSize: "1.1rem" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => { setEnroll(null); setCode(""); }} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={confirmEnroll} loading={busy}>{t("mfa.confirmEnable")}</Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={start} loading={busy}>{t("mfa.enable")}</Button>
      )}
      {msg && <div style={{ marginTop: 10 }}><Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice></div>}
    </Card>
  );
}
