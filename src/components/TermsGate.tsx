"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import Icon from "@/components/Icon";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { createClient } from "@/lib/supabase/client";

/**
 * ผู้ใช้ที่ยังไม่เคยยอมรับ (สมัครก่อนมีเอกสาร) หรือยอมรับฉบับเก่า → ขอให้กดยอมรับครั้งเดียว
 * บันทึกใน user_metadata (terms_version / terms_accepted_at) แล้ว refresh token ให้ฝั่ง server เห็นทันที
 * ไม่ปิดเมื่อคลิกนอกกล่อง (ต้องยอมรับก่อนใช้งานต่อ) — ลิงก์อ่านเอกสารเปิดแท็บใหม่
 */
export default function TermsGate({ version, firstTime }: { version: string; firstTime: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) return null;

  async function accept() {
    setBusy(true);
    setErr(false);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: { terms_version: version, terms_accepted_at: new Date().toISOString() } });
    if (error) { setBusy(false); setErr(true); return; }
    await supabase.auth.refreshSession().catch(() => {});
    setDone(true);
    router.refresh();
  }

  const link: React.CSSProperties = { color: "var(--accent-text)", textDecoration: "underline" };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="krok-terms-title" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,10,14,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "var(--accent-text)" }}><Icon icon={ShieldCheck} className="h-6 w-6" /></span>
          <b id="krok-terms-title" style={{ fontSize: "1.05rem", fontFamily: "var(--font-anuphan)" }}>{firstTime ? t("legal.gateTitleNew") : t("legal.gateTitleUpd")}</b>
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", lineHeight: 1.6, margin: "0 0 10px" }}>{t("legal.gateBody")}</p>
        <div style={{ fontSize: ".88rem", display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <a href="/terms" target="_blank" rel="noopener" style={link}>{t("legal.terms")}</a>
          <a href="/privacy" target="_blank" rel="noopener" style={link}>{t("legal.privacy")}</a>
        </div>
        {err && <p style={{ color: "var(--fail)", fontSize: ".84rem", margin: "0 0 10px" }}>{t("legal.gateFail")}</p>}
        <Button variant="primary" onClick={accept} loading={busy} style={{ width: "100%", padding: 12 }}>{t("legal.gateAccept")}</Button>
      </div>
    </div>
  );
}
