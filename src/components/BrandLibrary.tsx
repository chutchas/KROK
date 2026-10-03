"use client";
// คลังรูปภาพของ workspace (หน้าตั้งค่า Workspace) — ดูทุกรูป ใช้ที่ไหน และลบรูปที่ไม่ได้ใช้
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Images, Trash2, ExternalLink } from "lucide-react";
import { Button, Card, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { confirmDialog } from "@/components/dialogs";
import { deleteBrandAssets } from "@/app/(app)/settings/workspace/actions";
import type { AssetUse, BrandAsset } from "@/lib/branding-library";

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function BrandLibrary({ assets, error, canDelete }: { assets: BrandAsset[]; error?: string | null; canDelete: boolean }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | "unused">("all");

  const unused = useMemo(() => assets.filter((a) => a.uses.length === 0), [assets]);
  const shown = filter === "unused" ? unused : assets;
  const totalSize = assets.reduce((s, a) => s + a.size, 0);
  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric" }); } catch { return ""; }
  };

  function usageLabel(u: AssetUse): React.ReactNode {
    if (u.kind === "workspace") return t("brand.lib.useWs");
    if (u.kind === "case") {
      return (
        <Link href={u.formId ? `/fill/${u.formId}?case=${u.caseId}` : "/forms"} target="_blank" style={{ color: "var(--accent-text)" }}>
          {tt("brand.lib.useCase", { title: u.title || "—", id: u.caseId.slice(0, 8).toUpperCase() })}
        </Link>
      );
    }
    const label = `${u.title || "—"} · ${t(u.as === "logo" ? "brand.lib.asLogo" : "brand.lib.asImage")}`;
    return u.deleted ? (
      <span>{label} <span style={{ color: "var(--ink-3)" }}>({t("brand.lib.inTrash")})</span></span>
    ) : (
      <Link href={`/studio?edit=${u.formId}`} target="_blank" style={{ color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label} <Icon icon={ExternalLink} className="h-3 w-3" />
      </Link>
    );
  }

  async function remove(paths: string[]) {
    if (!paths.length) return;
    if (!(await confirmDialog({ message: tt("brand.lib.deleteConfirm", { n: paths.length }), danger: true }))) return;
    setBusy(true);
    setMsg(null);
    const res = await deleteBrandAssets(paths);
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setSel(new Set());
    setMsg({ t: res.skipped.length ? tt("brand.lib.deletedSkipped", { n: res.deleted, s: res.skipped.length }) : tt("brand.lib.deleted", { n: res.deleted }), err: res.skipped.length > 0 });
    router.refresh();
  }

  const toggle = (p: string) => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const chip = (k: "all" | "unused", label: string) => (
    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
      style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${filter === k ? "var(--accent)" : "var(--line)"}`, background: filter === k ? "var(--accent-soft)" : "var(--surface)", color: filter === k ? "var(--accent-text)" : "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".78rem" }}>
      {label}
    </button>
  );

  return (
    <Card>
      <h2 style={{ fontSize: "1.05rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon icon={Images} className="h-5 w-5" /> {t("brand.lib.title")}
      </h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 10px" }}>{t("brand.lib.sub")}</p>

      {error ? (
        <Notice kind="error">{error}</Notice>
      ) : assets.length === 0 ? (
        <div style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>{t("brand.lib.empty")}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            {chip("all", tt("brand.lib.filterAll", { n: assets.length }))}
            {chip("unused", tt("brand.lib.filterUnused", { n: unused.length }))}
            <span style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{tt("brand.lib.total", { size: fmtSize(totalSize) })}</span>
            <div style={{ flex: 1 }} />
            {canDelete && sel.size > 0 && (
              <Button variant="danger" onClick={() => remove([...sel])} loading={busy} style={{ fontSize: ".8rem", padding: "6px 12px" }}>
                <Icon icon={Trash2} className="h-4 w-4" /> {tt("brand.lib.deleteSel", { n: sel.size })}
              </Button>
            )}
            {canDelete && unused.length > 0 && sel.size === 0 && (
              <Button onClick={() => remove(unused.map((a) => a.path))} loading={busy} style={{ fontSize: ".8rem", padding: "6px 12px" }}>
                <Icon icon={Trash2} className="h-4 w-4" /> {tt("brand.lib.deleteUnused", { n: unused.length })}
              </Button>
            )}
          </div>
          {msg && <div style={{ marginBottom: 10 }}><Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice></div>}

          <div style={{ display: "grid", gap: 8 }}>
            {shown.map((a) => {
              const free = a.uses.length === 0;
              return (
                <div key={a.path} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                  {canDelete && (
                    <input type="checkbox" checked={sel.has(a.path)} disabled={!free} onChange={() => toggle(a.path)}
                      aria-label={tt("brand.lib.selectFile", { name: a.name })} title={free ? undefined : t("brand.lib.inUseNoDelete")}
                      style={{ width: 17, height: 17, marginTop: 24, accentColor: "var(--accent)" }} />
                  )}
                  <a href={a.url} target="_blank" rel="noopener" style={{ flex: "0 0 auto", width: 96, height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid var(--line)", borderRadius: 8 }}>
                    <img src={a.url} alt="" loading="lazy" style={{ maxWidth: 90, maxHeight: 58, objectFit: "contain" }} />
                  </a>
                  <div style={{ minWidth: 0, flex: 1, fontSize: ".8rem" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: ".74rem", color: "var(--ink-2)", overflowWrap: "anywhere" }}>{a.name}</span>
                      {free && <span style={{ fontSize: ".7rem", padding: "1px 7px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-3)" }}>{t("brand.lib.unused")}</span>}
                    </div>
                    <div style={{ color: "var(--ink-3)", fontSize: ".72rem", marginTop: 1 }}>{fmtSize(a.size)} · {fmtDate(a.createdAt)}</div>
                    {!free && (
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16, display: "grid", gap: 2 }}>
                        {a.uses.slice(0, 8).map((u, i) => <li key={i}>{usageLabel(u)}</li>)}
                        {a.uses.length > 8 && <li style={{ color: "var(--ink-3)" }}>{tt("brand.lib.more", { n: a.uses.length - 8 })}</li>}
                      </ul>
                    )}
                  </div>
                  {canDelete && free && (
                    <button type="button" onClick={() => remove([a.path])} disabled={busy} aria-label={tt("brand.lib.deleteOne", { name: a.name })} title={t("brand.removeImage")}
                      style={{ border: "1px solid var(--line)", background: "var(--surface)", color: "var(--fail)", borderRadius: 7, width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 auto" }}>
                      <Icon icon={Trash2} className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
