"use client";
// คลังรูปภาพของ workspace (ตั้งค่า Workspace › คลังรูปภาพ) — กริดรูปย่อ แบ่งหน้า ค้นหา · กดรูป = ดูว่าใช้ที่ไหน · ลบรูปที่ไม่ได้ใช้
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Images, Trash2, ExternalLink, Search, X } from "lucide-react";
import { Button, Card, Field, Notice } from "@/components/ui";
import BodyPortal from "@/components/BodyPortal";

const PAGE = 48;
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
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<BrandAsset | null>(null);

  const unused = useMemo(() => assets.filter((a) => a.uses.length === 0), [assets]);
  const q = query.trim().toLowerCase();
  const matched = (filter === "unused" ? unused : assets).filter((a) => !q || a.name.toLowerCase().includes(q));
  const shown = matched.slice(0, limit);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
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
    <button key={k} type="button" onClick={() => { setFilter(k); setLimit(PAGE); }} aria-pressed={filter === k}
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
            <label style={{ position: "relative", display: "inline-flex", alignItems: "center", flex: "1 1 180px", maxWidth: 280 }}>
              <span style={{ position: "absolute", left: 10, color: "var(--ink-3)", display: "inline-flex" }}><Icon icon={Search} className="h-4 w-4" /></span>
              <Field value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("brand.lib.search")} aria-label={t("brand.lib.search")}
                style={{ width: "100%", padding: "6px 10px 6px 32px", fontSize: ".84rem" }} />
            </label>
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

          {matched.length === 0 && <div style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>{t("brand.lib.noMatch")}</div>}
          <div className="krok-lib-grid">
            {shown.map((a) => {
              const free = a.uses.length === 0;
              return (
                <div key={a.path} style={{ position: "relative", border: `1px solid ${sel.has(a.path) ? "var(--accent)" : "var(--line)"}`, borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
                  <button type="button" onClick={() => setOpen(a)} aria-label={a.name}
                    style={{ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "4 / 3", background: "#fff", borderBottom: "1px solid var(--line)" }}>
                      <img src={a.url} alt="" loading="lazy" style={{ maxWidth: "88%", maxHeight: "84%", objectFit: "contain" }} />
                    </span>
                    <span style={{ display: "block", padding: "6px 8px" }}>
                      <span style={{ display: "block", fontFamily: "monospace", fontSize: ".7rem", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: ".7rem", color: "var(--ink-3)", marginTop: 2 }}>
                        <span>{fmtSize(a.size)}</span>
                        <span style={{ marginLeft: "auto", padding: "0 6px", borderRadius: 999, border: "1px solid var(--line)", background: free ? "var(--surface-2)" : "var(--accent-soft)", color: free ? "var(--ink-3)" : "var(--accent-text)" }}>
                          {free ? t("brand.lib.unused") : tt("brand.lib.usedIn", { n: a.uses.length })}
                        </span>
                      </span>
                    </span>
                  </button>
                  {canDelete && free && (
                    <input type="checkbox" checked={sel.has(a.path)} onChange={() => toggle(a.path)} aria-label={tt("brand.lib.selectFile", { name: a.name })}
                      style={{ position: "absolute", top: 8, left: 8, width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }} />
                  )}
                </div>
              );
            })}
          </div>
          {matched.length > shown.length && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <Button onClick={() => setLimit((n) => n + PAGE)} style={{ fontSize: ".84rem" }}>{tt("brand.lib.loadMore", { n: matched.length - shown.length })}</Button>
            </div>
          )}
          <style>{`
            .krok-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
            @media(max-width:480px){.krok-lib-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
          `}</style>

          {open && (
            <BodyPortal>
              <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,14,18,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <div role="dialog" aria-modal="true" aria-label={open.name} onClick={(e) => e.stopPropagation()}
                  style={{ background: "var(--surface)", borderRadius: 14, width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: ".78rem", overflowWrap: "anywhere" }}>{open.name}</span>
                    <button type="button" onClick={() => setOpen(null)} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "inline-flex", padding: 4 }}>
                      <Icon icon={X} className="h-5 w-5" />
                    </button>
                  </div>
                  <div style={{ background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, borderBottom: "1px solid var(--line)" }}>
                    <img src={open.url} alt="" style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }} />
                  </div>
                  <div style={{ padding: "12px 14px", fontSize: ".84rem", display: "grid", gap: 8 }}>
                    <div style={{ color: "var(--ink-3)", fontSize: ".78rem" }}>
                      {fmtSize(open.size)} · {fmtDate(open.createdAt)} · <a href={open.url} target="_blank" rel="noopener" style={{ color: "var(--accent-text)" }}>{t("brand.lib.open")}</a>
                    </div>
                    {open.uses.length === 0 ? (
                      <div style={{ color: "var(--ink-3)" }}>{t("brand.lib.unused")}</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
                        {open.uses.map((u, i) => <li key={i}>{usageLabel(u)}</li>)}
                      </ul>
                    )}
                    {canDelete && open.uses.length === 0 && (
                      <div>
                        <Button variant="danger" loading={busy} onClick={async () => { const a = open; setOpen(null); await remove([a.path]); }} style={{ fontSize: ".82rem", padding: "6px 12px" }}>
                          <Icon icon={Trash2} className="h-4 w-4" /> {t("brand.removeImage")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </BodyPortal>
          )}
        </>
      )}
    </Card>
  );
}
