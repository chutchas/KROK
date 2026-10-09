"use client";
import { FileQuestion, ClipboardList, LayoutDashboard } from "lucide-react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";

// ============================================================
// หน้า "ไม่พบ" ของแอป (ภาษาตามที่ผู้ใช้เลือก) — แทนหน้า 404 ภาษาอังกฤษของ Next.js
// เจอบ่อยจาก: ลิงก์ใน LINE/แจ้งเตือนไปเอกสารที่ถูกลบ, QR ของฟอร์มที่ปิดแล้ว, พิมพ์ลิงก์ผิด
// ทางไปต่อ: หน้ากรอกฟอร์ม (คนหน้างาน) · แดชบอร์ด
// ============================================================
export default function NotFoundView({ bare = false }: { bare?: boolean }) {
  const { t } = useT();
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 16px", borderRadius: 10, fontWeight: 600, textDecoration: "none", fontSize: ".92rem" };
  const body = (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "48px 16px", textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}>
      <span aria-hidden style={{ width: 56, height: 56, borderRadius: 16, background: "var(--accent-soft)", color: "var(--accent-text)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon icon={FileQuestion} className="h-7 w-7" />
      </span>
      <h1 style={{ fontSize: "1.35rem", margin: 0 }}>{t("nf.title")}</h1>
      <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.6 }}>{t("nf.body")}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <a href="/forms" style={{ ...btn, background: "var(--accent)", color: "var(--accent-ink)" }}><Icon icon={ClipboardList} className="h-4 w-4" /> {t("nf.toForms")}</a>
        <a href="/dashboard" style={{ ...btn, border: "1px solid var(--line)", color: "var(--ink)", background: "var(--surface)" }}><Icon icon={LayoutDashboard} className="h-4 w-4" /> {t("nf.toDashboard")}</a>
      </div>
    </div>
  );
  if (!bare) return body;
  return (
    <main style={{ minHeight: "100dvh", background: "var(--ground)", display: "grid", alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px" }}>
        <LogoMark size={26} title="KROK" />
        <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>KROK</b>
      </div>
      {body}
    </main>
  );
}
