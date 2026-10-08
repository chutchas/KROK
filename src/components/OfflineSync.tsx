"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAllPending, removePending, pushSubmission, PermanentSubmitError } from "@/lib/offline-queue";
import { notifySubmission } from "@/app/(app)/fill/[formId]/actions";
import Icon from "@/components/Icon";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { isQuotaError, cleanQuotaMessage } from "@/lib/quota-msg";
import { peekDeviceKey } from "@/lib/device-client";

/** ผู้ใช้ที่ล็อกอินอยู่ในเบราว์เซอร์นี้ (อ่านจาก session ในเครื่อง ไม่ยิงเครือข่าย) */
async function currentUserId(): Promise<string | null> {
  try { return (await createClient().auth.getSession()).data.session?.user.id ?? null; } catch { return null; }
}

/** รายการที่ติดโควตาแพ็กเกจ: พักไว้ 10 นาทีก่อนลองใหม่ (ไม่ยิงซ้ำทุก 30 วิ และไม่บังรายการอื่น) */
const QUOTA_RETRY_MS = 10 * 60_000;

// ตัวบ่งชี้สถานะออฟไลน์ + sync คิวฟอร์มที่ค้างเมื่อกลับมาออนไลน์
export default function OfflineSync() {
  const { t, tt, lang } = useT();
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);
  /** เหตุผลที่ส่งไม่ได้เพราะโควตาเต็ม (แสดงให้ผู้ใช้รู้ว่าทำไมค้าง) */
  const [quotaMsg, setQuotaMsg] = useState<string | null>(null);
  /** quota = โควตาเต็ม · blocked = server ไม่รับ (ฟอร์มปิด/ไม่มีสิทธิ์/เครื่องไม่ได้อนุมัติ) */
  const [msgKind, setMsgKind] = useState<"quota" | "blocked">("quota");
  const [showMsg, setShowMsg] = useState(false);
  const busy = useRef(false);
  const blockedUntil = useRef<Map<string, number>>(new Map());

  const refreshCount = useCallback(async () => {
    const me = await currentUserId();
    setPending(me ? (await getAllPending()).filter((p) => p.userId === me).length : 0);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || typeof navigator === "undefined" || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    let done = 0;
    let quota: string | null = null;
    let kind: "quota" | "blocked" = "quota";
    try {
      const supabase = createClient();
      // คิวของผู้ใช้ที่ล็อกอินอยู่เท่านั้น (เครื่องที่ใช้ร่วมกัน: คิวของคนอื่นไม่ส่งในชื่อเรา และไม่ขวางคิวเรา)
      const me = await currentUserId();
      if (!me) return;
      const queue = (await getAllPending()).filter((p) => p.userId === me);
      for (const p of queue) {
        const until = blockedUntil.current.get(p.subId) ?? 0;
        if (until > Date.now()) { quota = quota ?? "quota"; continue; }
        try {
          await pushSubmission(supabase, p, { deviceKey: p.deviceKey ?? peekDeviceKey() });
          await removePending(p.subId);
          blockedUntil.current.delete(p.subId);
          void notifySubmission(p.subId).catch(() => {});
          done++;
        } catch (e) {
          // เกินโควตาแพ็กเกจ: ข้ามรายการนี้ไว้ก่อน (ยังเก็บในเครื่อง) แล้วส่งรายการอื่นต่อ
          if (isQuotaError(e)) {
            quota = cleanQuotaMessage(String((e as { message?: string }).message ?? ""));
            blockedUntil.current.set(p.subId, Date.now() + QUOTA_RETRY_MS);
            continue;
          }
          // ลองใหม่ก็ไม่ผ่าน (ฟอร์มปิด/ไม่มีสิทธิ์): พักรายการนี้ไว้นาน ๆ แล้วส่งรายการอื่นต่อ (ยังเก็บในเครื่อง)
          if (e instanceof PermanentSubmitError) {
            blockedUntil.current.set(p.subId, Date.now() + 6 * 60 * 60_000);
            quota = quota ?? e.message;
            kind = "blocked";
            continue;
          }
          break; // เครือข่ายหลุดอีก — หยุดไว้ ลองใหม่รอบหน้า
        }
      }
    } finally {
      if (quota !== "quota") { setQuotaMsg(quota ? localizeServerMsg(quota, langRef.current) : quota); setMsgKind(kind); } // "quota" = ยังอยู่ในช่วงพัก ใช้ข้อความเดิม
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
  const blocked = online && !syncing && pending > 0 && !!quotaMsg;

  let text = "";
  let color = "var(--warn)";
  let icon = CloudOff;
  if (!online) { text = pending > 0 ? tt("sync.offlinePending", { n: pending }) : t("sync.offline"); }
  else if (syncing) { text = tt("sync.syncing", { n: pending }); icon = RefreshCw; }
  else if (blocked) { text = tt(msgKind === "quota" ? "sync.quotaBlocked" : "sync.blockedBadge", { n: pending }); color = "var(--fail)"; icon = CloudOff; }
  else if (pending > 0) { text = tt("sync.pending", { n: pending }); icon = RefreshCw; }
  else if (justSynced > 0) { text = tt("sync.done", { n: justSynced }); color = "var(--pass)"; icon = CheckCircle2; }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
    <button
      onClick={() => { if (blocked) setShowMsg((v) => !v); else void flush(); }}
      title={blocked ? quotaMsg ?? "" : t("sync.tapToSync")}
      aria-expanded={blocked ? showMsg : undefined}
      className="inline-flex items-center gap-1.5"
      style={{ border: "1px solid var(--line)", borderRadius: 20, padding: "4px 10px", background: "var(--surface)", color, cursor: online ? "pointer" : "default", fontFamily: "inherit", fontSize: ".76rem", fontWeight: 600, whiteSpace: "nowrap" }}
    >
      <span style={syncing ? { display: "inline-flex", animation: "krok-spin 1s linear infinite" } : { display: "inline-flex" }}>
        <Icon icon={icon} className="h-3.5 w-3.5" />
      </span>
      {text}
      <style>{`@keyframes krok-spin{to{transform:rotate(360deg)}}`}</style>
    </button>
    {blocked && showMsg && (
      <span role="status" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 280, zIndex: 60, background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.18)", padding: 12, fontSize: ".8rem", lineHeight: 1.55, whiteSpace: "normal" }}>
        <b style={{ display: "block", marginBottom: 4, color: "var(--fail)" }}>{t(msgKind === "quota" ? "sync.quotaTitle" : "sync.blockedTitle")}</b>
        {quotaMsg}
        <span style={{ display: "block", marginTop: 6, color: "var(--ink-3)" }}>{t(msgKind === "quota" ? "sync.quotaHint" : "sync.blockedHint")}</span>
      </span>
    )}
    </span>
  );
}
