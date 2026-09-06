"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { X, Copy, Download, Check, Globe, Lock } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// โมดัลแสดง QR Code ของฟอร์ม + คัดลอกลิงก์ + ดาวน์โหลด PNG
export default function QrModal({
  url,
  title,
  isPublic,
  onClose,
}: {
  url: string;
  title: string;
  isPublic: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // โหลด qrcode แบบ dynamic เฉพาะตอนเปิดโมดัล เพื่อไม่ให้ติดมากับ bundle หน้าสร้างฟอร์ม
    let alive = true;
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" }))
      .then((d) => { if (alive) setDataUrl(d); })
      .catch(() => { if (alive) setDataUrl(""); });
    return () => { alive = false; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${title.replace(/[^\w฀-๿-]+/g, "_").slice(0, 40) || "form"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,10,14,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "var(--surface)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("qr.title")}</b>
          <button onClick={onClose} aria-label={t("common.close")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        <div style={{ padding: 18, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".76rem", color: isPublic ? "var(--pass)" : "var(--ink-3)", marginBottom: 12 }}>
            <Icon icon={isPublic ? Globe : Lock} className="h-3.5 w-3.5" /> {isPublic ? t("qr.public") : t("qr.private")}
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 14, display: "inline-block", border: "1px solid var(--line)" }}>
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt="QR" style={{ width: 220, height: 220, display: "block" }} />
            ) : (
              <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>…</div>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: ".76rem", color: "var(--ink-3)", wordBreak: "break-all", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>{url}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Button onClick={copy}><Icon icon={copied ? Check : Copy} className="h-4 w-4" /> {copied ? t("qr.copied") : t("qr.copy")}</Button>
            <Button variant="primary" onClick={download}><Icon icon={Download} className="h-4 w-4" /> {t("qr.download")}</Button>
          </div>
          <p style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 10 }}>{isPublic ? t("qr.hintPublic") : t("qr.hintPrivate")}</p>
        </div>
      </div>
    </div>
  );
}
