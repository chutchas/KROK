"use client";
import { useState } from "react";
import { Printer, FileDown, Images } from "lucide-react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { printWhenReady } from "@/lib/print";
import { docNoFileSafe } from "@/lib/form-schema";

// submissionId ไม่ระบุ = โหมดพิมพ์อย่างเดียว (เช่น หน้าใบแจ้งหนี้) — ไม่มีปุ่มดาวน์โหลด PDF
// printHref = หน้าพิมพ์เอกสาร A4 (กระดาษแผ่นเดียวกับตอนกรอก)
// view = แท็บที่เปิดอยู่: doc → พิมพ์/PDF เป็นกระดาษ A4 · summary → พิมพ์หน้าสรุปที่เห็น / PDF แบบรายการ
// showDetail = แสดงสาเหตุทางเทคนิคเมื่อทำ PDF ไม่สำเร็จ (owner/admin เท่านั้น — ใช้แจ้งปัญหา)
export default function PrintButton({ submissionId, docNo, hasPhotos = false, printHref, view = "summary", showDetail = false }: { submissionId?: string; docNo?: string; hasPhotos?: boolean; printHref?: string; view?: "doc" | "summary"; showDetail?: boolean }) {
  const a4 = view === "doc" && !!printHref;
  const [busy, setBusy] = useState(false);
  const [a4Err, setA4Err] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipErr, setZipErr] = useState(false);
  const { t } = useT();

  // พิมพ์เอกสาร A4: เปิดหน้าพิมพ์ (หน้าเดียวกับที่ server ใช้ทำ PDF) → หน้าตาตรงกับ PDF ทุกอย่าง
  // เปิดไม่ได้ (บล็อกป๊อปอัป) → พิมพ์หน้าปัจจุบันแทน
  function print() {
    if (a4 && printHref) {
      const w = window.open(`${printHref}?auto=1`, "_blank");
      if (w) return;
    }
    void printWhenReady();
  }

  // ดาวน์โหลด PDF จริงจาก server (ฟอนต์ไทยฝัง, พร้อมแนบ/ส่งต่อ)
  async function downloadPdf() {
    if (!submissionId) return;
    setBusy(true);
    setA4Err(null);
    try {
      const res = await fetch(`/api/submission/${submissionId}/pdf${a4 ? "" : "?format=summary"}`);
      // session หมดอายุ = ถูกพาไปหน้า login (HTML) — ไม่ใช่ไฟล์ PDF
      const isPdf = (res.headers.get("content-type") || "").includes("application/pdf");
      if (!res.ok || !isPdf) {
        // A4 สร้างฝั่ง server ไม่สำเร็จ → ให้เปิดหน้าพิมพ์ A4 แล้วบันทึกเป็น PDF เอง (ต้องกดเอง — เปิดหน้าต่างหลัง await โดนบล็อกป๊อปอัป)
        if (a4) {
          const j = (await res.json().catch(() => null)) as { reason?: string } | null;
          setA4Err(j?.reason || `HTTP ${res.status}`);
          return;
        }
        throw new Error("failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docNoFileSafe(docNo || (submissionId ?? "").slice(0, 8).toUpperCase())}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      // A4: ให้ผู้ใช้กดเปิดหน้าพิมพ์เอง (เปิดหน้าต่างหลัง await โดนบล็อกป๊อปอัป) · แบบสรุป: พิมพ์หน้าที่เห็น
      if (a4) setA4Err(e instanceof Error ? e.message : "network error");
      else print();
    } finally {
      setBusy(false);
    }
  }

  // ดาวน์โหลดรูปทั้งหมด (zip) — ไฟล์ตามที่เก็บในระบบ คมกว่ารูปใน PDF/กระดาษ
  async function downloadPhotos() {
    if (!submissionId) return;
    setZipBusy(true);
    setZipErr(false);
    try {
      const res = await fetch(`/api/submission/${submissionId}/photos`);
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docNoFileSafe(docNo || (submissionId ?? "").slice(0, 8).toUpperCase())}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setZipErr(true);
    } finally {
      setZipBusy(false);
    }
  }

  // หน้าที่ไม่ใช่ submission → พิมพ์ผ่านเบราว์เซอร์อย่างเดียว
  if (!submissionId) {
    return (
      <Button variant="primary" onClick={() => void printWhenReady()}>
        <Icon icon={Printer} className="h-4 w-4" /> {t("sub.printSavePdf")}
      </Button>
    );
  }

  return (
    <div className="krok-subbtns" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
      {/* ทำ PDF ไม่สำเร็จ: กล่องแจ้งเต็มแถวใต้ปุ่ม (เดิมข้อความแดงชิดขวา + ข้อความ error ดิบโผล่บนจอ) */}
      {a4Err && (
        <div role="alert" style={{ flexBasis: "100%", order: 10, display: "grid", gap: 10, padding: "12px 14px", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--fail) 35%, transparent)", background: "var(--fail-soft)", textAlign: "left", fontSize: ".88rem" }}>
          <span style={{ color: "var(--fail-text)", fontWeight: 600 }}>{t("sub.a4PdfFail")}</span>
          <Button onClick={print} style={{ justifySelf: "start", minHeight: 44 }}><Icon icon={Printer} className="h-4 w-4" /> {t("sub.a4PdfOpenPrint")}</Button>
          {/* สาเหตุทางเทคนิค (owner/admin): พับไว้ — เปิดดูเมื่อจะแจ้งปัญหา */}
          {showDetail && (
            <details style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>
              <summary style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>{t("sub.errDetail")}</summary>
              <code style={{ display: "block", marginTop: 4, fontFamily: "monospace", overflowWrap: "anywhere" }}>{a4Err}</code>
            </details>
          )}
        </div>
      )}
      {zipErr && <span role="alert" style={{ flexBasis: "100%", order: 11, fontSize: ".85rem", color: "var(--fail-text)" }}>{t("print.photos.downloadFail")}</span>}
      {hasPhotos && (
        <Button variant="ghost" onClick={downloadPhotos} disabled={zipBusy}>
          <Icon icon={Images} className="h-4 w-4" /> {zipBusy ? t("print.photos.downloading") : <><span className="krok-sb-long">{t("print.photos.download")}</span><span className="krok-sb-short">{t("print.photos.short")}</span></>}
        </Button>
      )}
      <Button variant="ghost" onClick={print}>
        <Icon icon={Printer} className="h-4 w-4" /> {t("sub.print")}
      </Button>
      <Button variant="primary" className="krok-sb-pdf" onClick={downloadPdf} disabled={busy}>
        <Icon icon={FileDown} className="h-4 w-4" /> {busy ? t("sub.creatingPdf") : t("sub.downloadPdf")}
      </Button>
    </div>
  );
}
