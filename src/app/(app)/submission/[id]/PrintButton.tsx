"use client";
import { useState } from "react";
import { Printer, FileDown, Images } from "lucide-react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { printWhenReady } from "@/lib/print";
import { docNoFileSafe } from "@/lib/form-schema";

// submissionId ไม่ระบุ = โหมดพิมพ์อย่างเดียว (เช่น หน้าใบแจ้งหนี้) — ไม่มีปุ่มดาวน์โหลด PDF
// printHref = หน้าพิมพ์เอกสาร A4 (กระดาษแผ่นเดียวกับตอนกรอก) — มี = ปุ่มพิมพ์เปิดหน้านั้นแล้วสั่งพิมพ์
export default function PrintButton({ submissionId, docNo, hasPhotos = false, printHref }: { submissionId?: string; docNo?: string; hasPhotos?: boolean; printHref?: string }) {
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipErr, setZipErr] = useState(false);
  const { t } = useT();

  // พิมพ์เอกสาร A4: เปิดหน้าพิมพ์ (หน้าเดียวกับที่ server ใช้ทำ PDF) → หน้าตาตรงกับ PDF ทุกอย่าง
  // เปิดไม่ได้ (บล็อกป๊อปอัป) → พิมพ์หน้าปัจจุบันแทน
  function print() {
    if (printHref) {
      const w = window.open(`${printHref}?auto=1`, "_blank");
      if (w) return;
    }
    void printWhenReady();
  }

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
      a.download = `${docNoFileSafe(docNo || (submissionId ?? "").slice(0, 8).toUpperCase())}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // fallback: พิมพ์ผ่านเบราว์เซอร์
      print();
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
    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {zipErr && <span role="alert" style={{ fontSize: ".8rem", color: "var(--fail)" }}>{t("print.photos.downloadFail")}</span>}
      {hasPhotos && (
        <Button variant="ghost" onClick={downloadPhotos} disabled={zipBusy}>
          <Icon icon={Images} className="h-4 w-4" /> {zipBusy ? t("print.photos.downloading") : t("print.photos.download")}
        </Button>
      )}
      <Button variant="ghost" onClick={print}>
        <Icon icon={Printer} className="h-4 w-4" /> {t("sub.print")}
      </Button>
      <Button variant="primary" onClick={downloadPdf} disabled={busy}>
        <Icon icon={FileDown} className="h-4 w-4" /> {busy ? t("sub.creatingPdf") : t("sub.downloadPdf")}
      </Button>
    </div>
  );
}
