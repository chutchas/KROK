"use client";
// ตั้งธีมสี / โลโก้ / ข้อความท้าย — ใช้ทั้งค่าเริ่มต้นของ workspace และ "รูปลักษณ์" ของฟอร์ม
// ค่าที่ไม่ตั้ง = ใช้ค่าของระดับก่อนหน้า (แอป ← workspace ← ฟอร์ม)
import { useId, useState } from "react";
import BrandImageChooser from "@/components/BrandImageChooser";
import Icon from "@/components/Icon";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { cleanHex, inkOn, type ResolvedTheme } from "@/lib/theme";
import type { BrandUploadError } from "@/lib/brand-upload";

export interface BrandingValue {
  primary?: string;
  header?: string;
  footer_text?: string;
  /** form: workspace | custom | none · workspace: ไม่ใช้ */
  logo?: "workspace" | "custom" | "none";
  logo_url?: string | null;
}

const label: React.CSSProperties = { display: "block", fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)", margin: "12px 0 6px" };
const smallBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".76rem" };

export function useUploadErrorText() {
  const { t } = useT();
  return (e: BrandUploadError) => t(e === "type" ? "brand.errType" : e === "size" ? "brand.errSize" : "brand.errUpload");
}

/** ปุ่มเลือกรูป → อัปโหลดใหม่ หรือเลือกจากคลังของ workspace → คืน URL */
export function BrandImagePicker({ tenantId, prefix, onUploaded, children, style }: {
  tenantId: string; prefix: "logo" | "img"; onUploaded: (url: string) => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const errText = useUploadErrorText();
  return (
    <>
      <button type="button" style={{ ...smallBtn, ...style }} onClick={() => setOpen(true)}>
        <Icon icon={ImagePlus} className="h-3.5 w-3.5" /> {children}
      </button>
      {open && (
        <BrandImageChooser tenantId={tenantId} prefix={prefix} uploadError={errText}
          onClose={() => setOpen(false)} onPick={(url) => { setOpen(false); onUploaded(url); }} />
      )}
    </>
  );
}

function ColorRow({ title, value, inherited, onChange }: { title: string; value?: string; inherited: string; onChange: (v: string | undefined) => void }) {
  const { t } = useT();
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = value ?? inherited;
  return (
    <div>
      <label htmlFor={id} style={label}>{title}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input id={id} type="color" value={shown} onChange={(e) => { setText(null); onChange(e.target.value); }}
          style={{ width: 40, height: 32, padding: 0, border: "1px solid var(--line)", borderRadius: 7, background: "none", cursor: "pointer" }} />
        <input aria-label={title} value={text ?? shown} maxLength={7} spellCheck={false}
          onChange={(e) => { setText(e.target.value); const h = cleanHex(e.target.value); if (h) onChange(h); }}
          onBlur={() => setText(null)}
          style={{ width: 92, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", color: "var(--ink)", fontFamily: "monospace", fontSize: ".8rem" }} />
        {value ? (
          <button type="button" style={smallBtn} onClick={() => { setText(null); onChange(undefined); }} title={t("brand.reset")}>
            <Icon icon={RotateCcw} className="h-3.5 w-3.5" /> {t("brand.reset")}
          </button>
        ) : (
          <span style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>{t("brand.inherited")}</span>
        )}
      </div>
    </div>
  );
}

/** ตัวอย่างหน้าตาย่อ ๆ: แถบหัว + ปุ่ม + ข้อความท้าย */
export function BrandPreview({ theme, title }: { theme: ResolvedTheme; title: string }) {
  const { t } = useT();
  return (
    <div aria-hidden style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--surface)", marginTop: 14 }}>
      <div style={{ background: theme.header, color: theme.headerInk, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        {theme.logo && <span style={{ background: "#fff", borderRadius: 6, padding: 3, display: "inline-flex" }}><img src={theme.logo} alt="" style={{ height: 24, maxWidth: 90, objectFit: "contain" }} /></span>}
        <b style={{ fontSize: ".86rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ height: 6, borderRadius: 3, background: "var(--line)", position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", inset: 0, width: "40%", borderRadius: 3, background: theme.primary }} />
        </div>
        <span style={{ display: "block", textAlign: "center", padding: "8px 0", borderRadius: 8, background: theme.primary, color: inkOn(theme.primary), fontSize: ".84rem", fontWeight: 600 }}>{t("fill.next")}</span>
        {theme.footer && <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: ".72rem", color: "var(--ink-3)", textAlign: "center", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{theme.footer}</div>}
      </div>
    </div>
  );
}

export default function BrandingEditor({ mode, value, inherited, onChange, tenantId }: {
  mode: "workspace" | "form";
  value: BrandingValue;
  /** ค่าที่จะใช้ถ้าไม่ตั้ง (workspace: ค่าของแอป · form: ค่าของ workspace) */
  inherited: ResolvedTheme;
  onChange: (v: BrandingValue) => void;
  tenantId: string;
}) {
  const { t } = useT();
  const set = (patch: Partial<BrandingValue>) => {
    const next: BrandingValue = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof BrandingValue)[]) if (next[k] === undefined || next[k] === "") delete next[k];
    onChange(next);
  };
  const logoMode = value.logo ?? "workspace";

  return (
    <div>
      <ColorRow title={t("brand.primary")} value={value.primary} inherited={inherited.primary} onChange={(v) => set({ primary: v })} />
      <ColorRow title={t("brand.header")} value={value.header} inherited={inherited.header} onChange={(v) => set({ header: v })} />

      <span style={label}>{t("brand.logo")}</span>
      {mode === "form" && (
        <div role="radiogroup" aria-label={t("brand.logo")} style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".82rem", marginBottom: 8 }}>
          {(["workspace", "custom", "none"] as const).map((m) => (
            <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="radio" name="krok-logo-mode" checked={logoMode === m}
                onChange={() => set({ logo: m === "workspace" ? undefined : m, ...(m !== "custom" ? { logo_url: undefined } : {}) })} />
              {t(`brand.logo.${m}`)}
            </label>
          ))}
        </div>
      )}
      {mode === "form" && logoMode === "workspace" && (
        <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{inherited.logo ? t("brand.logoFromWs") : t("brand.logoWsNone")}</div>
      )}
      {(mode === "workspace" || logoMode === "custom") && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {value.logo_url && (
            <span style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 4, background: "#fff", display: "inline-flex" }}>
              <img src={value.logo_url} alt={t("brand.logo")} style={{ height: 36, maxWidth: 140, objectFit: "contain" }} />
            </span>
          )}
          <BrandImagePicker tenantId={tenantId} prefix="logo" onUploaded={(url) => set({ logo_url: url, ...(mode === "form" ? { logo: "custom" as const } : {}) })}>
            {value.logo_url ? t("brand.replace") : t("brand.upload")}
          </BrandImagePicker>
          {value.logo_url && (
            <button type="button" style={smallBtn} onClick={() => set({ logo_url: undefined, ...(mode === "form" ? { logo: undefined } : {}) })}>
              <Icon icon={Trash2} className="h-3.5 w-3.5" /> {t("brand.removeLogo")}
            </button>
          )}
        </div>
      )}
      {(mode === "workspace" || logoMode === "custom") && <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 4 }}>{t("brand.logoHint")}</div>}

      <label style={label} htmlFor="krok-brand-footer">{t("brand.footer")}</label>
      <textarea id="krok-brand-footer" value={value.footer_text ?? ""} maxLength={300} rows={2}
        placeholder={mode === "form" && inherited.footer ? inherited.footer : t("brand.footerPh")}
        onChange={(e) => set({ footer_text: e.target.value })}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".84rem", resize: "vertical", boxSizing: "border-box" }} />
      {mode === "form" && <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 4 }}>{t("brand.footerInherit")}</div>}
    </div>
  );
}
