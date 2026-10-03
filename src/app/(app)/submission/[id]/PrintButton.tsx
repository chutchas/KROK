"use client";
import { useState } from "react";
import { Printer, FileDown, Images } from "lucide-react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { printWhenReady } from "@/lib/print";

// submissionId ไม่ระบุ = โหมดพิมพ์อย่างเดียว (เช่น หน้าใบแจ้งหนี้) — ไม่มีปุ่มดาวน์โหลด PDF
export default function PrintButton({ submissionId, hasPhotos = false }: { submissionId?: string; hasPhotos?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipErr, setZipErr] = useState(false);
  const { t } = useT();

  // ดาวน์โหลด PDF จริงจาก server (ฟอนต์ไทยฝัง, พร้อมแนบ/ส่งต่อ)
  async function downloadPdf() {
    if (!submissionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/submission/${submissionId}/pdf`);
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `KROK-${submissionId.slice(0, 8).toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // fallback: พิมพ์ผ่านเบราว์เซอร์
      void printWhenReady();
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
      a.download = `KROK-${submissionId.slice(0, 8).toUpperCase()}-photos.zip`;
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
    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {zipErr && <span role="alert" style={{ fontSize: ".8rem", color: "var(--fail)" }}>{t("print.photos.downloadFail")}</span>}
      {hasPhotos && (
        <Button variant="ghost" onClick={downloadPhotos} disabled={zipBusy}>
          <Icon icon={Images} className="h-4 w-4" /> {zipBusy ? t("print.photos.downloading") : t("print.photos.download")}
        </Button>
      )}
      <Button variant="ghost" onClick={() => void printWhenReady()}>
        <Icon icon={Printer} className="h-4 w-4" /> {t("sub.print")}
      </Button>
      <Button variant="primary" onClick={downloadPdf} disabled={busy}>
        <Icon icon={FileDown} className="h-4 w-4" /> {busy ? t("sub.creatingPdf") : t("sub.downloadPdf")}
      </Button>
    </div>
  );
}
