"use client";
import { useState } from "react";
import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";

// submissionId ไม่ระบุ = โหมดพิมพ์อย่างเดียว (เช่น หน้าใบแจ้งหนี้) — ไม่มีปุ่มดาวน์โหลด PDF
export default function PrintButton({ submissionId }: { submissionId?: string }) {
  const [busy, setBusy] = useState(false);

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
      window.print();
    } finally {
      setBusy(false);
    }
  }

  // หน้าที่ไม่ใช่ submission → พิมพ์ผ่านเบราว์เซอร์อย่างเดียว
  if (!submissionId) {
    return (
      <Button variant="primary" onClick={() => window.print()}>
        <Icon icon={Printer} className="h-4 w-4" /> พิมพ์ / บันทึกเป็น PDF
      </Button>
    );
  }

  return (
    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant="ghost" onClick={() => window.print()}>
        <Icon icon={Printer} className="h-4 w-4" /> พิมพ์
      </Button>
      <Button variant="primary" onClick={downloadPdf} disabled={busy}>
        <Icon icon={FileDown} className="h-4 w-4" /> {busy ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}
      </Button>
    </div>
  );
}
