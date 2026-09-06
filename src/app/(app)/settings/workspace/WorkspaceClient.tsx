"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Building2, Save, Trash2, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { renameWorkspace, deleteWorkspace } from "./actions";

export default function WorkspaceClient({
  tenantName,
  isOwner,
  memberCount,
  formCount,
}: {
  tenantName: string;
  isOwner: boolean;
  memberCount: number;
  formCount: number;
}) {
  const { t, tt } = useT();
  const router = useRouter();
  const [name, setName] = useState(tenantName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  async function save() {
    if (name.trim() === tenantName || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await renameWorkspace(name);
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setMsg({ t: t("ws.saved") });
      router.refresh();
    }
  }

  async function doDelete() {
    setDelBusy(true);
    setDelMsg(null);
    const res = await deleteWorkspace(confirm);
    if ("error" in res) {
      setDelMsg(res.error);
      setDelBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Building2} className="h-6 w-6" /> {t("ws.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("ws.sub")}</p>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 8 }}>{t("ws.general")}</h2>
        <label style={{ display: "block", fontSize: ".85rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("ws.name")}</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} maxLength={80} />
          <Button variant="primary" onClick={save} loading={busy} disabled={!name.trim() || name.trim() === tenantName}>
            <Icon icon={Save} className="h-4 w-4" /> {t("common.save")}
          </Button>
        </div>
        {msg && <div style={{ marginTop: 10 }}><Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice></div>}
        <div style={{ display: "flex", gap: 20, marginTop: 14, color: "var(--ink-3)", fontSize: ".82rem" }}>
          <span>{tt("ws.members", { n: memberCount })}</span>
          <span>{tt("ws.forms", { n: formCount })}</span>
        </div>
      </Card>

      {isOwner && (
        <Card style={{ borderColor: "var(--fail)" }}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: 4, color: "var(--fail)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={AlertTriangle} className="h-5 w-5" /> {t("ws.dangerZone")}
          </h2>
          <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>{t("ws.deleteWarn")}</p>
          <label style={{ display: "block", fontSize: ".82rem", color: "var(--ink-2)", margin: "8px 0 6px" }}>
            {tt("ws.deleteConfirmLabel", { name: tenantName })}
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={tenantName} style={{ flex: 1, minWidth: 200 }} />
            <Button variant="danger" onClick={doDelete} loading={delBusy} disabled={confirm.trim() !== tenantName}>
              <Icon icon={Trash2} className="h-4 w-4" /> {t("ws.deleteBtn")}
            </Button>
          </div>
          {delMsg && <div style={{ marginTop: 10 }}><Notice kind="error">{delMsg}</Notice></div>}
        </Card>
      )}
    </div>
  );
}
