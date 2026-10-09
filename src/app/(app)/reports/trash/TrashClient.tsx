"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { InlineFormIcon } from "@/components/FormIcon";
import Icon from "@/components/Icon";
import { Button, Card, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { restoreSubmission } from "@/lib/submission-trash-actions";

export interface TrashRow { id: string; docNo: string; form: string; icon: string; user: string; submittedAt: string; deletedAt: string; deletedBy: string; reason: string }

const DAY = 86_400_000;

export default function TrashClient({ rows }: { rows: TrashRow[] }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  };
  // วันที่เหลือก่อนลบถาวร — คำนวณตอนกด/แสดงผล (ไม่ต้องแม่นระดับนาที)
  const [now] = useState(() => Date.now());

  async function restore(r: TrashRow) {
    setBusy(r.id); setMsg(null);
    try {
      const res = await restoreSubmission(r.id);
      if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
      setMsg({ t: tt("trash.restored", { no: r.docNo }) });
      router.refresh();
    } catch {
      setMsg({ t: t("welcome.netError"), err: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {msg && <div role={msg.err ? "alert" : "status"}><Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice></div>}
      {rows.length === 0 ? (
        <Card><p style={{ margin: 0, color: "var(--ink-3)" }}>{t("trash.empty")}</p></Card>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => {
            const left = Math.max(0, Math.ceil((new Date(r.deletedAt).getTime() + 30 * DAY - now) / DAY));
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px", display: "grid", gap: 3 }}>
                    <b style={{ overflowWrap: "anywhere" }}><InlineFormIcon value={r.icon} size={16} />{r.form} <span style={{ fontFamily: "monospace", fontWeight: 400, color: "var(--ink-3)", fontSize: ".82rem" }}>{r.docNo}</span></b>
                    <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{tt("trash.meta", { user: r.user, at: fmt(r.submittedAt) })}</span>
                    <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{tt("trash.deletedMeta", { by: r.deletedBy, at: fmt(r.deletedAt) })}</span>
                    {r.reason && <span style={{ fontSize: ".84rem", overflowWrap: "anywhere" }}>“{r.reason}”</span>}
                    <span style={{ fontSize: ".78rem", color: left <= 3 ? "var(--fail)" : "var(--ink-3)" }}>{tt("trash.daysLeft", { n: left })}</span>
                  </div>
                  <Button onClick={() => restore(r)} loading={busy === r.id} disabled={!!busy} style={{ minHeight: 44 }}>
                    <Icon icon={RotateCcw} className="h-4 w-4" /> {t("trash.restore")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
