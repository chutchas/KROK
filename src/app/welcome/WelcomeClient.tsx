"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RotateCw, Building2, MailOpen } from "lucide-react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { createClient } from "@/lib/supabase/client";
import { acceptInvite, createWorkspace, declineInvite, type PendingInvite } from "@/lib/workspace-actions";

export default function WelcomeClient({ email, invites, loadFailed, hadWorkspace }: {
  email: string; invites: PendingInvite[]; loadFailed: boolean; hadWorkspace: boolean;
}) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(invites);

  const enterApp = () => { window.location.assign("/dashboard"); };
  const fail = (m: string) => setErr(localizeServerMsg(m, lang));

  async function create() {
    if (!name.trim()) { setErr(t("welcome.nameRequired")); return; }
    setBusy("create"); setErr(null);
    try {
      const r = await createWorkspace(name);
      if ("error" in r) fail(r.error); else enterApp();
    } catch { setErr(t("welcome.netError")); } finally { setBusy(null); }
  }
  async function accept(id: string) {
    setBusy(id); setErr(null);
    try {
      const r = await acceptInvite(id);
      if ("error" in r) fail(r.error); else enterApp();
    } catch { setErr(t("welcome.netError")); } finally { setBusy(null); }
  }
  async function decline(id: string) {
    setBusy(id); setErr(null);
    try {
      const r = await declineInvite(id);
      if ("error" in r) fail(r.error); else setLeft((l) => l.filter((x) => x.id !== id));
    } catch { setErr(t("welcome.netError")); } finally { setBusy(null); }
  }
  async function signOut() {
    setBusy("out");
    try { await createClient().auth.signOut(); } finally { router.push("/login"); router.refresh(); }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px 60px", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark size={32} title="KROK" />
        <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.2rem", letterSpacing: ".02em" }}>KROK</b>
      </div>
      <div>
        <h1 style={{ fontSize: "1.3rem", margin: "0 0 4px" }}>{loadFailed ? t("welcome.loadFailedTitle") : t("welcome.title")}</h1>
        <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".92rem" }}>
          {loadFailed ? t("welcome.loadFailedSub") : hadWorkspace ? t("welcome.subNoActive") : t("welcome.sub")}
        </p>
        <p style={{ color: "var(--ink-3)", margin: "6px 0 0", fontSize: ".82rem" }}>{tt("welcome.signedInAs", { email })}</p>
      </div>

      {err && <div role="alert"><Notice kind="error">{err}</Notice></div>}

      {loadFailed ? (
        <Card>
          <Button variant="primary" onClick={() => window.location.reload()} style={{ minHeight: 44 }}>
            <Icon icon={RotateCw} className="h-4 w-4" /> {t("common.retry")}
          </Button>
        </Card>
      ) : (
        <>
          {left.length > 0 && (
            <Card>
              <h2 style={{ fontSize: "1rem", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={MailOpen} className="h-4 w-4" /> {t("welcome.invites")}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {left.map((iv) => (
                  <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                      <b style={{ display: "block" }}>{iv.tenant_name}</b>
                      <small style={{ color: "var(--ink-3)" }}>{tt("invite.role", { role: iv.role_name })}{iv.invited_by_name ? ` · ${tt("invite.by", { name: iv.invited_by_name })}` : ""}</small>
                    </div>
                    <Button variant="primary" onClick={() => void accept(iv.id)} loading={busy === iv.id} disabled={!!busy} style={{ minHeight: 44 }}>{t("invite.accept")}</Button>
                    <Button onClick={() => void decline(iv.id)} disabled={!!busy} style={{ minHeight: 44 }}>{t("invite.decline")}</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <h2 style={{ fontSize: "1rem", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={Building2} className="h-4 w-4" /> {t("ws.create")}</h2>
            <p style={{ color: "var(--ink-2)", fontSize: ".86rem", margin: "0 0 10px" }}>{t("welcome.createSub")}</p>
            <form onSubmit={(e) => { e.preventDefault(); void create(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label htmlFor="ws-name" className="sr-only">{t("ws.namePlaceholder")}</label>
              <Field id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ws.namePlaceholder")} maxLength={60} style={{ flex: "1 1 200px", minWidth: 0 }} />
              <Button type="submit" variant={left.length ? "default" : "primary"} loading={busy === "create"} disabled={!!busy} style={{ minHeight: 44 }}>{t("ws.createBtn")}</Button>
            </form>
          </Card>
        </>
      )}

      <button type="button" onClick={() => void signOut()} disabled={busy === "out"}
        style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 4px", border: "none", background: "none", color: "var(--ink-2)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}>
        <Icon icon={LogOut} className="h-4 w-4" /> {t("welcome.signOut")}
      </button>
    </main>
  );
}
