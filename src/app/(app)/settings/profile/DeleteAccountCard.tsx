"use client";
import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Field, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { previewAccountDeletion, deleteMyAccount } from "./delete-account";
import { createClient } from "@/lib/supabase/client";

type Plan = Exclude<Awaited<ReturnType<typeof previewAccountDeletion>>, { error: string }>;

// ลบบัญชีด้วยตัวเอง — ดูผลกระทบก่อน (workspace ที่จะถูกลบ/ออก/ต้องโอนก่อน) แล้วพิมพ์อีเมลยืนยัน
export default function DeleteAccountCard({ email }: { email: string }) {
  const { t, tt } = useT();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  async function open() {
    setBusy(true); setErr(null);
    const res = await previewAccountDeletion();
    setBusy(false);
    if ("error" in res) { setErr(res.error); return; }
    setPlan(res);
  }

  async function del() {
    setBusy(true); setErr(null);
    const res = await deleteMyAccount(confirm);
    if ("error" in res) {
      setBusy(false);
      setErr(res.error);
      if (res.blockers && plan) setPlan({ ...plan, blockers: res.blockers });
      return;
    }
    // ล้าง session ในเครื่องด้วย (กันคุกกี้ค้างของบัญชีที่ถูกลบ)
    await createClient().auth.signOut({ scope: "local" }).catch(() => {});
    window.location.href = "/login?deleted=1";
  }

  if (!plan) {
    return (
      <div>
        <Button variant="danger" onClick={open} loading={busy}><Icon icon={Trash2} className="h-4 w-4" /> {t("acct.delete")}</Button>
        {err && <div style={{ marginTop: 8 }}><Notice kind="error">{err}</Notice></div>}
      </div>
    );
  }

  const blocked = plan.blockers.length > 0;
  return (
    <div style={{ border: "1px solid var(--fail)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <b style={{ color: "var(--fail)" }}>{t("acct.deleteTitle")}</b>
      {blocked ? (
        <div style={{ fontSize: ".86rem", color: "var(--ink-2)" }}>
          <p style={{ margin: "0 0 6px" }}>{t("acct.blocked")}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {plan.blockers.map((b) => <li key={b.tenantId}>{tt("acct.blockedItem", { name: b.name, n: b.members })}</li>)}
          </ul>
          <Link href="/settings/team" style={{ display: "inline-block", marginTop: 8 }}>{t("acct.goTeam")}</Link>
        </div>
      ) : (
        <div style={{ fontSize: ".86rem", color: "var(--ink-2)", display: "grid", gap: 4 }}>
          {plan.deleteTenants.length > 0 && <div>{tt("acct.willDelete", { list: plan.deleteTenants.map((x) => x.name).join(", ") })}</div>}
          {plan.leaveTenants.length > 0 && <div>{tt("acct.willLeave", { list: plan.leaveTenants.map((x) => x.name).join(", ") })}</div>}
          <div>{t("acct.irreversible")}</div>
          <label style={{ marginTop: 6, fontWeight: 600, color: "var(--ink)" }}>{tt("acct.typeEmail", { email })}</label>
          <Field type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={email} />
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => { setPlan(null); setConfirm(""); setErr(null); }} disabled={busy}>{t("common.cancel")}</Button>
        {!blocked && (
          <Button variant="danger" onClick={del} loading={busy} disabled={confirm.trim().toLowerCase() !== email.toLowerCase()}>
            <Icon icon={Trash2} className="h-4 w-4" /> {t("acct.deleteForever")}
          </Button>
        )}
      </div>
    </div>
  );
}
