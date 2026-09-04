"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
const ICON: Record<string, string> = { approval_request: "🕒", fail_alert: "⚠️", approved: "✅", rejected: "↩️" };

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
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
        onClick={() => setOpen((o) => !o)}
        aria-label="การแจ้งเตือน"
        style={{ position: "relative", background: "none", border: "1px solid var(--line)", borderRadius: 20, width: 38, height: 34, cursor: "pointer", fontSize: "1rem" }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, background: "var(--fail)", color: "#fff", fontSize: ".65rem", fontWeight: 700, borderRadius: 20, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: 42, width: 320, maxWidth: "85vw", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow)", zIndex: 40, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".95rem" }}>การแจ้งเตือน</b>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: ".8rem", fontFamily: "inherit" }}>
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--ink-3)", fontSize: ".85rem" }}>ยังไม่มีการแจ้งเตือน</div>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--line)", background: n.read_at ? "transparent" : "var(--accent-soft)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span aria-hidden style={{ fontSize: "1.1rem" }}>{ICON[n.type] || "🔔"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: ".86rem", color: "var(--ink)" }}>{n.title}</span>
                  <span style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)" }}>{n.body}</span>
                  <span style={{ display: "block", fontSize: ".72rem", color: "var(--ink-3)", marginTop: 2 }}>{fmt(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
