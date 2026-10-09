"use client";
import { useState } from "react";
import { LogOut, RefreshCw, Building2, MailOpen } from "lucide-react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { createClient } from "@/lib/supabase/client";
import type { PendingInvite } from "@/lib/workspace-actions";
import { welcomeAcceptInvite, welcomeCreateWorkspace } from "./actions";

/** ไม่มี workspace ที่ใช้ได้: รับคำเชิญ · สร้าง workspace ใหม่ · ลองโหลดใหม่ · ออกจากระบบ */
export default function WelcomeClient({ email, invites }: { email: string; invites: PendingInvite[] }) {
  const { t, tt, lang } = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // เข้าแอปด้วยการโหลดเต็มหน้า (session/คุกกี้ workspace ใหม่ต้องอ่านใหม่ทั้งหมด)
  const enterApp = () => window.location.assign("/dashboard");

  async function run(key: string, fn: () => Promise<{ ok: true } | { error: string }>) {
    setErr(null);
    setBusy(key);
    try {
      const r = await fn();
      if ("error" in r) { setErr(localizeServerMsg(r.error, lang)); return; }
      enterApp();
    } catch {
      setErr(t("welcome.netError"));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("out");
    try { await createClient().auth.signOut(); } catch { /* token หมดอายุ = ออกอยู่แล้ว */ }
    window.location.assign("/login");
  }

  const box: React.CSSProperties = { display: "grid", gap: 10 };
  return (
    <main style={{ minHeight: "100dvh", display: "flex", justifyContent: "center", padding: "40px 16px", background: "var(--ground)" }}>
      <div style={{ width: "100%", maxWidth: 480, display: "grid", gap: 16, alignContent: "start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark size={32} title="KROK" />
          <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.2rem" }}>KROK</b>
        </div>
        <Card>
          <h1 style={{ fontSize: "1.2rem", margin: "0 0 6px" }}>{t("welcome.title")}</h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{tt("welcome.sub", { email })}</p>
          <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: "8px 0 0" }}>{t("welcome.why")}</p>
        </Card>

        {err && <div role="alert"><Notice kind="error">{err}</Notice></div>}

        {invites.length > 0 && (
          <Card>
            <h2 style={{ fontSize: "1rem", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={MailOpen} className="h-4 w-4" /> {t("welcome.invites")}</h2>
            <div style={box}>
              {invites.map((iv) => (
                <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ display: "block" }}>{iv.tenant_name}</b>
                    <small style={{ color: "var(--ink-3)" }}>{iv.role_name}{iv.invited_by_name ? ` · ${iv.invited_by_name}` : ""}</small>
                  </div>
                  <Button variant="primary" loading={busy === iv.id} disabled={!!busy} onClick={() => run(iv.id, () => welcomeAcceptInvite(iv.id))} style={{ minHeight: 44 }}>{t("welcome.accept")}</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h2 style={{ fontSize: "1rem", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={Building2} className="h-4 w-4" /> {t("welcome.create")}</h2>
          <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: "0 0 10px" }}>{t("welcome.createHint")}</p>
          <form onSubmit={(e) => { e.preventDefault(); void run("create", () => welcomeCreateWorkspace(name)); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 220px", minWidth: 0 }}>
              <span className="sr-only">{t("welcome.namePh")}</span>
              <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("welcome.namePh")} maxLength={60} style={{ width: "100%" }} />
            </label>
            <Button type="submit" variant={invites.length ? "default" : "primary"} loading={busy === "create"} disabled={!!busy || !name.trim()} style={{ minHeight: 44 }}>{t("welcome.createBtn")}</Button>
          </form>
        </Card>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={enterApp} disabled={!!busy} style={{ minHeight: 44 }}><Icon icon={RefreshCw} className="h-4 w-4" /> {t("welcome.retry")}</Button>
          <Button variant="ghost" onClick={signOut} loading={busy === "out"} disabled={!!busy} style={{ minHeight: 44 }}><Icon icon={LogOut} className="h-4 w-4" /> {t("welcome.signOut")}</Button>
        </div>
      </div>
    </main>
  );
}
