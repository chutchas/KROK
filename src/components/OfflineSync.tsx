"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAllPending, removePending, pushSubmission } from "@/lib/offline-queue";
import { notifySubmission } from "@/app/(app)/fill/[formId]/actions";
import Icon from "@/components/Icon";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// ตัวบ่งชี้สถานะออฟไลน์ + sync คิวฟอร์มที่ค้างเมื่อกลับมาออนไลน์
export default function OfflineSync() {
  const { t, tt } = useT();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);
  const busy = useRef(false);

  const refreshCount = useCallback(async () => {
    setPending((await getAllPending()).length);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || typeof navigator === "undefined" || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    let done = 0;
    try {
      const supabase = createClient();
      const queue = await getAllPending();
      for (const p of queue) {
        try {
          await pushSubmission(supabase, p);
          await removePending(p.subId);
          void notifySubmission(p.subId).catch(() => {});
          done++;
        } catch {
          break; // เครือข่ายหลุดอีก — หยุดไว้ ลองใหม่รอบหน้า
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      if (done > 0) { setJustSynced(done); setTimeout(() => setJustSynced(0), 4000); }
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshCount();
    if (navigator.onLine) flush();

    const onOnline = () => { setOnline(true); flush(); };
    const onOffline = () => setOnline(false);
    const onChanged = () => { refreshCount(); flush(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("krok-queue-changed", onChanged);
    const iv = setInterval(() => { if (navigator.onLine) flush(); }, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("krok-queue-changed", onChanged);
      clearInterval(iv);
    };
  }, [flush, refreshCount]);

  if (online && pending === 0 && justSynced === 0) return null;

  let text = "";
  let color = "var(--amber)";
  let icon = CloudOff;
  if (!online) { text = pending > 0 ? tt("sync.offlinePending", { n: pending }) : t("sync.offline"); }
  else if (syncing) { text = tt("sync.syncing", { n: pending }); icon = RefreshCw; }
  else if (pending > 0) { text = tt("sync.pending", { n: pending }); icon = RefreshCw; }
  else if (justSynced > 0) { text = tt("sync.done", { n: justSynced }); color = "var(--pass)"; icon = CheckCircle2; }

  return (
    <button
      onClick={() => flush()}
      title={t("sync.tapToSync")}
      className="inline-flex items-center gap-1.5"
      style={{ border: "1px solid var(--line)", borderRadius: 20, padding: "4px 10px", background: "var(--surface)", color, cursor: online ? "pointer" : "default", fontFamily: "inherit", fontSize: ".76rem", fontWeight: 600, whiteSpace: "nowrap" }}
    >
      <span style={syncing ? { display: "inline-flex", animation: "krok-spin 1s linear infinite" } : { display: "inline-flex" }}>
        <Icon icon={icon} className="h-3.5 w-3.5" />
      </span>
      {text}
      <style>{`@keyframes krok-spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
