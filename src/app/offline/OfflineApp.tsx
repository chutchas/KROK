"use client";
import { useEffect, useState } from "react";
import FillWizard from "@/app/(app)/fill/[formId]/FillWizard";
import OfflineSync from "@/components/OfflineSync";
import { InlineFormIcon } from "@/components/FormIcon";
import Icon from "@/components/Icon";
import { CloudOff, Wifi, FileText, ChevronRight } from "lucide-react";
import { getLastBundle, getLocalDraft, listLocalDrafts, type LocalDraft, type StoredBundle } from "@/lib/offline-store";
import { useT } from "@/i18n/LanguageProvider";

// path ที่ผู้ใช้เปิดจริง (/fill/<id>, /forms) — อ่านตอนโหลดสคริปต์ ก่อน router ของ Next ปรับ URL เป็น /offline
const OPENED = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

type View =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "list"; bundle: StoredBundle; drafts: Set<string> }
  | { kind: "fill"; bundle: StoredBundle; formId: string; local: LocalDraft | null }
  | { kind: "missing"; bundle: StoredBundle };

function fmt(iso: string | number, lang: string) {
  return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OfflineApp() {
  const { t, tt, lang } = useT();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [online, setOnline] = useState(false);

  useEffect(() => {
    // คืน URL ที่ผู้ใช้เปิด (รีเฟรช/กดกลับยังอยู่หน้าเดิม)
    const tm = setTimeout(() => {
      if (OPENED && OPENED !== "/offline" && window.location.pathname === "/offline") window.history.replaceState(window.history.state, "", OPENED);
    }, 0);
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    (async () => {
      const bundle = await getLastBundle();
      if (!bundle) { setView({ kind: "empty" }); return; }
      const m = /^\/fill\/([0-9a-f-]{36})/i.exec(OPENED);
      if (m) {
        const formId = m[1].toLowerCase();
        if (!bundle.forms.some((f) => f.formId === formId)) { setView({ kind: "missing", bundle }); return; }
        const local = await getLocalDraft(bundle.userId, formId);
        setView({ kind: "fill", bundle, formId, local: local && local.tenantId === bundle.tenantId ? local : null });
        return;
      }
      const drafts = new Set((await listLocalDrafts(bundle.userId)).filter((d) => d.tenantId === bundle.tenantId).map((d) => d.formId));
      setView({ kind: "list", bundle, drafts });
    })();
    return () => {
      clearTimeout(tm);
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, []);

  const header = (
    <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px var(--krok-gutter)", borderBottom: "1px solid var(--line)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 20 }}>
      <a href="/forms" style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--ink)", textDecoration: "none" }}>KROK</a>
      {"bundle" in view && <span style={{ fontSize: ".85rem", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{view.bundle.tenantName}</span>}
      <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}><OfflineSync /></span>
    </header>
  );

  const banner = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: online ? "var(--pass-soft)" : "var(--accent-soft)", borderRadius: 10, padding: "10px 14px", fontSize: ".88rem", color: "var(--ink-2)", marginBottom: 14 }}>
      <Icon icon={online ? Wifi : CloudOff} className="h-4 w-4" />
      <span style={{ flex: 1, minWidth: 200 }}>
        {online ? t("offline.backOnline") : t("offline.mode")}
        {"bundle" in view && <span style={{ color: "var(--ink-3)" }}> · {tt("offline.savedAt", { t: fmt(view.bundle.savedAt, lang) })}</span>}
      </span>
      {online && <a href={OPENED && OPENED !== "/offline" ? OPENED : "/forms"} style={{ fontWeight: 600 }}>{t("offline.reload")}</a>}
    </div>
  );

  let body: React.ReactNode = null;
  if (view.kind === "loading") body = null;
  else if (view.kind === "empty") body = <>{banner}<p style={{ color: "var(--ink-2)" }}>{t("offline.empty")}</p></>;
  else if (view.kind === "missing") body = <>{banner}<p style={{ color: "var(--ink-2)" }}>{t("offline.missing")}</p><a href="/forms">{t("offline.toList")}</a></>;
  else if (view.kind === "fill") {
    const b = view.bundle;
    const f = b.forms.find((x) => x.formId === view.formId)!;
    body = (
      <FillWizard
        key={f.formId}
        formId={f.formId} title={f.title} icon={f.icon} version={f.version}
        requiresApproval={f.requiresApproval} approvalChain={f.approvalChain} schema={f.schema}
        tenantId={b.tenantId} userId={b.userId} userName={b.userName}
        attachments={f.attachments} requireDevice={f.requireDevice} branding={b.branding}
        draft={null} caseData={null} workflow={null}
        localDraft={view.local} offlineShell
      />
    );
  } else {
    const b = view.bundle;
    body = (
      <>
        {banner}
        <h1 style={{ fontSize: "1.3rem", margin: "0 0 10px" }}>{t("offline.title")}</h1>
        {b.forms.length === 0 && <p style={{ color: "var(--ink-3)" }}>{t("offline.noForms")}</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {b.forms.map((f) => (
            <a key={f.formId} href={`/fill/${f.formId}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>
              <span style={{ fontSize: "1.3rem", display: "inline-flex" }}><InlineFormIcon value={f.icon} size={22} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>{f.title}</span>
                {view.drafts.has(f.formId) && <span style={{ fontSize: ".78rem", color: "var(--amber)", display: "inline-flex", gap: 4, alignItems: "center" }}><Icon icon={FileText} className="h-3 w-3" /> {t("offline.hasDraft")}</span>}
              </span>
              <Icon icon={ChevronRight} className="h-4 w-4" />
            </a>
          ))}
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 14 }}>{t("offline.note")}</p>
      </>
    );
  }

  return (
    <>
      {header}
      <main style={{ maxWidth: "var(--krok-page-w)", margin: "0 auto", padding: "16px var(--krok-gutter) 90px" }}>{body}</main>
    </>
  );
}
