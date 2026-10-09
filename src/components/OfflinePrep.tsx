"use client";
import { useEffect } from "react";
import { deleteLocalDraft, getBundle, listLocalDrafts, saveBundle } from "@/lib/offline-store";
import { saveDraft, type DraftSnapshot } from "@/lib/drafts";
import { createClient } from "@/lib/supabase/client";
import type { OfflineBundle } from "@/lib/offline-types";

const REFRESH_MS = 15 * 60_000;
/** โหลดหน้าใหม่ = ดึงใหม่ได้เมื่อรอบล่าสุดเก่ากว่านี้ (เดิมดึงทุกครั้งที่เปิดหน้า → ชนเพดาน 20 ครั้ง/10 นาทีของ server แล้วข้ามเงียบ ๆ) */
const LOAD_GAP_MS = 5 * 60_000;
/** กลับมาออนไลน์ = ดึงใหม่ได้เร็วกว่า (อาจพลาดฟอร์มใหม่ตอนเน็ตหลุด) */
const ONLINE_GAP_MS = 60_000;
/** server ตอบ 429 แต่ไม่บอกเวลา → รอเท่านี้ก่อนลองใหม่ */
const BACKOFF_MS = 2 * 60_000;

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
    let blockedUntil = 0;
    type Why = "load" | "interval" | "online";
    const gapOf: Record<Why, number> = { load: LOAD_GAP_MS, interval: REFRESH_MS, online: ONLINE_GAP_MS };
    const sync = async (why: Why) => {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        // ร่างในเครื่องส่งทุกครั้ง (ไม่ผ่าน route ที่จำกัดความถี่)
        await pushLocalDrafts(userId, tenantId).catch(() => {});
        const cur = await getBundle(userId, tenantId);
        // รอบล่าสุด = ในหน้านี้ หรือที่เก็บลงเครื่องไว้ (ข้ามการโหลดหน้าใหม่)
        const lastAt = Math.max(last, cur?.savedAt ? Date.parse(cur.savedAt) || 0 : 0);
        if (Date.now() < blockedUntil || Date.now() - lastAt < gapOf[why]) return;
        const res = await fetch(`/api/offline/forms${cur ? `?v=${cur.hash}` : ""}`, { cache: "no-store" });
        if (res.status === 429) {
          const ra = Number(res.headers.get("retry-after"));
          blockedUntil = Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : BACKOFF_MS);
          return;
        }
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
    const t0 = setTimeout(() => void sync("load"), 4000);
    const iv = setInterval(() => void sync("interval"), 60_000);
    const onOnline = () => void sync("online");
    const onVis = () => { if (document.visibilityState === "visible") void sync("interval"); };
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
