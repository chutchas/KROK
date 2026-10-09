"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Bell, Clock, AlertTriangle, CheckCircle2, Undo2, FilePlus2, Inbox, CornerUpLeft, CheckCheck, CalendarClock, AlarmClock, BellRing } from "lucide-react";
import { localizeStored } from "@/i18n/stored-text";
import Icon, { type IconType } from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function fmt(ts: string, lang: string) {
  try {
    return new Date(ts).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
const ICON: Record<string, IconType> = { approval_request: Clock, fail_alert: AlertTriangle, approved: CheckCircle2, rejected: Undo2, new_form: FilePlus2, case_assigned: Inbox, case_returned: CornerUpLeft, case_done: CheckCheck, schedule_start: CalendarClock, schedule_overdue: AlarmClock };

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const { t, lang } = useT();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  /** ตำแหน่งกล่อง (fixed) คำนวณจากปุ่มตอนเปิด — กระดิ่งอยู่ซ้ายหรือขวาของจอก็ไม่หลุดขอบ */
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (open) { setOpen(false); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(320, vw - 16);
    // ชิดขวาของปุ่มเป็นหลัก แล้วบีบให้อยู่ในจอ (ขอบซ้าย-ขวา 8px)
    const left = Math.max(8, Math.min(r.right - width, vw - 8 - width));
    setPos({ top: r.bottom + 8, left, width });
    setOpen(true);
  }

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (active && data) setItems(data as Notif[]);
    })();
    const ch = supabase
      .channel("krok-notif")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notif, ...prev].slice(0, 30))
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // กล่องเป็น fixed ตามตำแหน่งปุ่มตอนเปิด → จอหมุน/เปลี่ยนขนาดแล้วปิดไป (ไม่ค้างผิดที่)
    // (เช็กเฉพาะความกว้าง — มือถือยิง resize ตอนแถบที่อยู่ของเบราว์เซอร์ยุบ/ขยาย)
    let w = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w) { w = window.innerWidth; setOpen(false); } };
    document.addEventListener("click", onDoc);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("click", onDoc); window.removeEventListener("resize", onResize); };
  }, []);

  const unread = items.filter((i) => !i.read_at).length;

  async function markAllRead() {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }

  async function clickItem(n: Notif) {
    if (!n.read_at) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
      const supabase = createClient();
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        aria-label={t("bell.title")}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer" }}
      >
        <Icon icon={Bell} className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full font-bold text-white" style={{ fontSize: ".62rem", minWidth: 16, height: 16, padding: "0 4px", background: "var(--fail-solid)" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100dvh - ${pos.top + 8}px)`, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow)", zIndex: 40, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".95rem" }}>{t("bell.title")}</b>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent-text)", cursor: "pointer", fontSize: ".8rem", fontFamily: "inherit" }}>
                {t("bell.markAllRead")}
              </button>
            )}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", minHeight: 0 }}>
            {items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--ink-3)", fontSize: ".85rem" }}>{t("bell.empty")}</div>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--line)", background: n.read_at ? "transparent" : "var(--accent-soft)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span aria-hidden style={{ color: "var(--ink-2)", marginTop: 1 }}><Icon icon={ICON[n.type] || Bell} className="h-[18px] w-[18px]" /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: ".86rem", color: "var(--ink)" }}>{localizeStored(n.title, lang)}</span>
                  <span style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)" }}>{localizeStored(n.body, lang)}</span>
                  <span style={{ display: "block", fontSize: ".72rem", color: "var(--ink-3)", marginTop: 2 }}>{fmt(n.created_at, lang)}</span>
                </span>
              </button>
            ))}
          </div>
          <a href="/settings/profile#push" onClick={() => setOpen(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", fontSize: ".8rem", color: "var(--accent-text)", borderTop: "1px solid var(--line)", textDecoration: "none" }}>
            <Icon icon={BellRing} className="h-4 w-4" /> {t("bell.pushLink")}
          </a>
        </div>
      )}
    </div>
  );
}
