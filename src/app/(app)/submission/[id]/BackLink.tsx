"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";

// ============================================================
// ปุ่มกลับของหน้าดูเอกสาร — กลับไปหน้าที่กดมา (รายงาน / อนุมัติ / รายการฟอร์ม / แดชบอร์ด)
// ที่มา: ?from=... (ลิงก์ในแอปใส่ให้) → ไม่มี = ดูจากหน้าก่อนหน้าในเว็บเดียวกัน → ไม่รู้ = แดชบอร์ด
// กลับด้วย history.back() เมื่อหน้าก่อนหน้าคือหน้านั้นจริง → ตัวกรอง/ตำแหน่งเลื่อนยังอยู่
// ============================================================

export const BACK_SOURCES = {
  reports: { href: "/reports", k: "sub.backReports" },
  approvals: { href: "/approvals", k: "sub.backApprovals" },
  forms: { href: "/forms", k: "sub.backForms" },
  dashboard: { href: "/dashboard", k: "sub.backDashboard" },
} as const satisfies Record<string, { href: string; k: MessageKey }>;
export type BackSource = keyof typeof BACK_SOURCES;

const isSource = (x: string | null | undefined): x is BackSource => !!x && x in BACK_SOURCES;

export default function BackLink({ from, mine }: { from?: string; mine?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [src, setSrc] = useState<BackSource>(isSource(from) ? from : "dashboard");
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    // หน้าก่อนหน้า (เว็บเดียวกัน) — ใช้ตัดสินว่ากด back ได้ไหม และเดาที่มาเมื่อไม่มี ?from
    let prev: URL | null = null;
    try { prev = document.referrer ? new URL(document.referrer) : null; } catch { prev = null; }
    const same = !!prev && prev.origin === window.location.origin;
    const guess = same ? (Object.keys(BACK_SOURCES) as BackSource[]).find((k) => prev!.pathname === BACK_SOURCES[k].href || prev!.pathname.startsWith(BACK_SOURCES[k].href + "/")) : undefined;
    const finalSrc: BackSource = isSource(from) ? from : guess ?? "dashboard";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านค่าจากเบราว์เซอร์ได้หลัง mount เท่านั้น
    setSrc(finalSrc);
    // ย้อนกลับได้เฉพาะเมื่อหน้าก่อนหน้าคือหน้าที่มาจริง (ไม่ใช่แท็บอื่นของเอกสารนี้)
    setCanBack(guess === finalSrc && window.history.length > 1);
  }, [from]);

  const s = BACK_SOURCES[src];
  // สมาชิก: หน้ารายงาน = "ประวัติการส่งของฉัน"
  const label = src === "reports" && mine ? t("sub.backMine") : t(s.k);
  return (
    <a href={s.href} onClick={(e) => { if (!canBack) return; e.preventDefault(); router.back(); }}
      style={{ fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44 }}>
      <Icon icon={ArrowLeft} className="h-4 w-4" /> {label}
    </a>
  );
}
