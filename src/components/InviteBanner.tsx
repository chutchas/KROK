"use client";
// แถบคำเชิญเข้าร่วม workspace สำหรับคนที่มีบัญชีอยู่แล้วตอนถูกเชิญ — กดเข้าร่วม (สลับไป workspace นั้น) หรือปฏิเสธ
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { MailOpen } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { acceptInvite, declineInvite, type PendingInvite } from "@/lib/workspace-actions";
import { confirmDialog } from "@/components/dialogs";

export default function InviteBanner({ invites }: { invites: PendingInvite[] }) {
  const { t, tt } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; msg: string } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  async function run(inv: PendingInvite, accept: boolean) {
    if (!accept && !(await confirmDialog({ message: tt("invite.declineConfirm", { name: inv.tenant_name }), danger: true, confirmLabel: t("invite.decline") }))) return;
    setBusy(inv.id + (accept ? ":a" : ":d"));
    setErr(null);
    const r = await (accept ? acceptInvite(inv.id) : declineInvite(inv.id)).catch(() => ({ error: t("wf.netError") }));
    setBusy(null);
    if ("error" in r) { setErr({ id: inv.id, msg: r.error }); return; }
    setHidden((h) => [...h, inv.id]);
    if (accept) router.push("/dashboard");
    router.refresh();
  }

  const list = invites.filter((i) => !hidden.includes(i.id));
  if (!list.length) return null;
  return (
    <div role="region" aria-label={t("invite.region")} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
      {list.map((inv) => (
        <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
          <span style={{ display: "inline-flex", color: "var(--accent)" }}><Icon icon={MailOpen} className="h-5 w-5" /></span>
          <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: ".9rem" }}>
            <b>{tt("invite.title", { name: inv.tenant_name })}</b>
            <div style={{ color: "var(--ink-2)", fontSize: ".8rem" }}>
              {inv.invited_by_name ? tt("invite.by", { name: inv.invited_by_name }) + " · " : ""}{tt("invite.role", { role: inv.role_name })}
            </div>
            {err?.id === inv.id && <div role="alert" style={{ color: "var(--fail)", fontSize: ".8rem", marginTop: 2 }}>⚠ {err.msg}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => run(inv, false)} loading={busy === inv.id + ":d"} disabled={!!busy}>{t("invite.decline")}</Button>
            <Button variant="primary" onClick={() => run(inv, true)} loading={busy === inv.id + ":a"} disabled={!!busy}>{t("invite.accept")}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
