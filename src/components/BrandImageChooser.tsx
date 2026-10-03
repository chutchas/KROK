"use client";
// เลือกรูปแบรนด์: อัปโหลดใหม่ หรือเลือกรูปที่มีอยู่ในคลังของ workspace (ไม่ต้องอัปโหลดซ้ำ)
import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/backdrop";
import Icon from "@/components/Icon";
import { ImagePlus, X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { Spinner } from "@/components/ui";
import { BRAND_IMAGE_ACCEPT, uploadBrandImage, type BrandUploadError } from "@/lib/brand-upload";
import { listBrandLibrary } from "@/app/(app)/settings/workspace/actions";
import type { BrandAsset } from "@/lib/branding-library";

export default function BrandImageChooser({ tenantId, prefix, onPick, onClose, uploadError }: {
  tenantId: string;
  prefix: "logo" | "img";
  onPick: (url: string) => void;
  onClose: () => void;
  uploadError: (e: BrandUploadError) => string;
}) {
  const { t, tt } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<BrandAsset[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listBrandLibrary().then((r) => {
      if (!alive) return;
      if ("error" in r) setLoadErr(r.error);
      else setAssets(r.assets);
    }, () => alive && setLoadErr(t("brand.lib.loadFail")));
    return () => { alive = false; };
  }, [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("brand.lib.choose")} {...backdropClose(onClose)}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(6,10,14,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 16, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("brand.lib.choose")}</b>
          <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        <div style={{ padding: 14, overflowY: "auto" }}>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: "1px dashed var(--accent)", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: ".88rem" }}>
            <Icon icon={ImagePlus} className="h-4 w-4" /> {busy ? t("brand.uploading") : t("brand.lib.uploadNew")}
          </button>
          <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 4, textAlign: "center" }}>{t("brand.logoHint")}</div>
          <input ref={fileRef} type="file" accept={BRAND_IMAGE_ACCEPT} hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true); setErr(null);
            const res = await uploadBrandImage(file, tenantId, prefix);
            setBusy(false);
            if ("error" in res) setErr(uploadError(res.error));
            else onPick(res.url);
          }} />
          {err && <div role="alert" style={{ fontSize: ".78rem", color: "var(--fail)", marginTop: 6 }}>{err}</div>}

          <div style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)", margin: "16px 0 8px" }}>{t("brand.lib.existing")}</div>
          {loadErr ? (
            <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{loadErr}</div>
          ) : !assets ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
          ) : assets.length === 0 ? (
            <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("brand.lib.empty")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
              {assets.map((a) => (
                <button key={a.path} type="button" onClick={() => onPick(a.url)} title={a.name}
                  style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", padding: 6, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 72, background: "#fff", borderRadius: 6 }}>
                    <img src={a.url} alt="" loading="lazy" style={{ maxWidth: "100%", maxHeight: 72, objectFit: "contain" }} />
                  </span>
                  <span style={{ display: "block", fontSize: ".7rem", color: a.uses.length ? "var(--ink-2)" : "var(--ink-3)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.uses.length ? tt("brand.lib.usedN", { n: a.uses.length }) : t("brand.lib.unused")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
