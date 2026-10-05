"use client";
import { useEffect } from "react";
import { deleteLocalDraft, getBundle, listLocalDrafts, saveBundle } from "@/lib/offline-store";
import { saveDraft, type DraftSnapshot } from "@/lib/drafts";
import { createClient } from "@/lib/supabase/client";
import type { OfflineBundle } from "@/lib/offline-types";

const REFRESH_MS = 15 * 60_000;

/** สั่ง service worker เก็บหน้าออฟไลน์ (+ ไฟล์ JS/CSS ของหน้า) ไว้ในเครื่อง */
function precacheShell() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: "krok-precache-shell" }))
    .catch(() => {});
}

/**
 * ร่างที่บันทึกในเครื่องตอนออฟไลน์ → ส่งขึ้น server เมื่อกลับมาออนไลน์ (แล้วลบออกจากเครื่อง)
 * ข้ามฟอร์มที่เปิดกรอกอยู่ (หน้ากรอกจะบันทึกเอง — กันร่างซ้ำ) · ร่างบน server ใหม่กว่า = ทิ้งของในเครื่อง
 */
async function pushLocalDrafts(userId: string, tenantId: string) {
  const drafts = (await listLocalDrafts(userId)).filter((d) => d.tenantId === tenantId);
  if (!drafts.length) return;
  const supabase = createClient();
  for (const d of drafts) {
    if (location.pathname.startsWith(`/fill/${d.formId}`)) continue;
    try {
      if (d.serverDraftId) {
        const { data } = await supabase.from("submission_drafts").select("updated_at").eq("id", d.serverDraftId).maybeSingle();
        if (data && Date.parse(data.updated_at as string) > d.updatedAt) { await deleteLocalDraft(userId, d.formId); continue; }
      }
      const snap: DraftSnapshot = {
        tenantId: d.tenantId, userId: d.userId, formId: d.formId, formVersion: d.formVersion, title: d.title,
        stepIdx: d.stepIdx, mode: d.mode, answers: d.answers, photos: d.photos, sigs: d.sigs,
        docExtracts: d.docExtracts as DraftSnapshot["docExtracts"], filled: d.filled ?? 0, total: d.total ?? 0,
      };
      await saveDraft(supabase, d.serverDraftId, snap, new Map(), {});
      await deleteLocalDraft(userId, d.formId);
    } catch {
      /* ยังส่งไม่ได้ — เก็บไว้ในเครื่อง ลองรอบหน้า */
    }
  }
}

/**
 * เตรียมเครื่องให้กรอกฟอร์มได้ตอนออฟไลน์ (ทำงานเงียบ ๆ ไม่มี UI)
 * 1) ตอนออนไลน์: ดาวน์โหลดทุกฟอร์มที่ผู้ใช้เห็นได้เก็บลงเครื่อง (ทุก 15 นาที / กลับมาออนไลน์ / กลับมาที่แอป)
 * 2) ตอนออฟไลน์: คลิกลิงก์ในแอป → โหลดทั้งหน้าแทน (ให้ service worker ส่งหน้าออฟไลน์ให้ได้)
 */
export default function OfflinePrep({ userId, tenantId }: { userId: string; tenantId: string }) {
  useEffect(() => {
    let last = 0;
    let busy = false;
    const sync = async (force = false) => {
      if (busy || !navigator.onLine) return;
      if (!force && Date.now() - last < REFRESH_MS) return;
      busy = true;
      try {
        await pushLocalDrafts(userId, tenantId).catch(() => {});
        const cur = await getBundle(userId, tenantId);
        const res = await fetch(`/api/offline/forms${cur ? `?v=${cur.hash}` : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { same?: boolean; bundle?: OfflineBundle | null };
        if (!j.same && j.bundle) await saveBundle(j.bundle);
        else if (j.same && cur) await saveBundle({ ...cur, savedAt: new Date().toISOString() });
        last = Date.now();
        precacheShell();
        // ขอให้เบราว์เซอร์ไม่ลบข้อมูลออฟไลน์เอง (Safari ลบเมื่อไม่ได้เปิด ~7 วัน ถ้าไม่ได้รับอนุญาต)
        void navigator.storage?.persist?.().catch(() => false);
        // ส่วนที่โหลดเมื่อใช้งาน (โหมดกระดาษ / ตัวอ่าน QR สำรองบน Safari) — โหลดไว้ก่อนให้ service worker เก็บ
        void import("@/components/FormPaperFill").catch(() => {});
        void import("jsqr").catch(() => {});
      } catch {
        /* เครือข่ายหลุด — รอรอบหน้า */
      } finally {
        busy = false;
      }
    };
    // รอหน้าโหลดเสร็จก่อน ไม่แย่งเน็ตกับหน้าที่กำลังเปิด
    const t0 = setTimeout(() => void sync(true), 4000);
    const iv = setInterval(() => void sync(), 60_000);
    const onOnline = () => void sync(true);
    const onVis = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);

    // ออฟไลน์: ลิงก์ภายในแอปโหลดเต็มหน้า (การเปลี่ยนหน้าแบบ client ต้องดึงข้อมูลจาก server → ล้มตอนไม่มีเน็ต)
    const onClick = (e: MouseEvent) => {
      if (navigator.onLine || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("click", onClick, true);
    };
  }, [userId, tenantId]);
  return null;
}
