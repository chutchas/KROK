"use client";
// ============================================================
// KROK · ตัวพาทัวร์ — วางครั้งเดียวใน AppShell
// - เข้าหน้าที่มีทัวร์และยังไม่เคยดู → รอให้หน้าพร้อม แล้วเริ่มเอง
// - ปุ่ม ถัดไป / ย้อนกลับ / ข้ามทัวร์ · Esc = ข้าม · ← → = เลื่อนขั้น
// - ดูจบหรือข้าม = จำว่าดูแล้ว (บัญชีผู้ใช้ + เครื่องนี้) ไม่พาซ้ำ
// - ปุ่ม ? ในแถบบน (TourHelpButton · ขึ้นเฉพาะหน้าที่มีทัวร์) → ส่ง event TOUR_START_EVENT เพื่อดูซ้ำ
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X, CircleHelp } from "lucide-react";
import Icon from "@/components/Icon";
import BodyPortal from "@/components/BodyPortal";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/LanguageProvider";
import { TOURS, tourFor, type TourDef, type TourStep } from "@/lib/tours";

export const TOUR_START_EVENT = "krok:tour-start";

const q = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
/** element ที่ชี้ได้จริง (มีอยู่และมองเห็น ไม่ถูกซ่อนด้วย display:none) */
const visible = (target: string) => { const el = q(target); return !!el && el.getClientRects().length > 0; };
const lsKey = (uid: string) => `krok_tours_${uid}`;
const readLocal = (uid: string): string[] => { try { return JSON.parse(localStorage.getItem(lsKey(uid)) || "[]"); } catch { return []; } };
const writeLocal = (uid: string, v: string[]) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(v)); } catch { /* ไม่มี storage */ } };

type Rect = { top: number; left: number; width: number; height: number };

export default function TourGuide({ userId }: { userId: string }) {
  const path = usePathname();
  const { t } = useT();
  const [seen, setSeen] = useState<Set<string> | null>(null); // null = ยังโหลดไม่เสร็จ (ยังไม่เริ่มทัวร์)
  const [tour, setTour] = useState<TourDef | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(1024);
  const cardRef = useRef<HTMLDivElement>(null);

  // โหลดประวัติ: เครื่องนี้ (เร็ว) + บัญชี (ข้ามเครื่อง) — คอลัมน์ยังไม่มี (ยังไม่รัน migration) = ใช้ของเครื่องอย่างเดียว
  useEffect(() => {
    let alive = true;
    const local = readLocal(userId);
    (async () => {
      let remote: string[] = [];
      // รอข้อมูลบัญชีไม่เกิน 2.5 วิ (เน็ตช้า/ออฟไลน์ = ใช้ของเครื่องนี้ไปก่อน)
      const fetchRemote = (async () => {
        try {
          const { data, error } = await createClient().from("profiles").select("tours_seen").eq("user_id", userId).maybeSingle();
          if (!error && Array.isArray(data?.tours_seen)) remote = data.tours_seen as string[];
        } catch { /* ออฟไลน์ */ }
      })();
      await Promise.race([fetchRemote, new Promise((r) => setTimeout(r, 2500))]);
      if (!alive) return;
      const all = Array.from(new Set([...local, ...remote]));
      writeLocal(userId, all);
      setSeen(new Set(all));
    })();
    return () => { alive = false; };
  }, [userId]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      const next = new Set(prev ?? []);
      next.add(id);
      writeLocal(userId, Array.from(next));
      return next;
    });
    void createClient().rpc("mark_tour_seen", { p_key: id }).then(() => {}, () => {});
  }, [userId]);

  const start = useCallback((def: TourDef) => {
    const ok = def.steps.filter((s) => !s.target || visible(s.target));
    if (!ok.length) return;
    setTour(def);
    setSteps(ok);
    setIdx(0);
  }, []);

  // เริ่มเองเมื่อเข้าหน้าที่ยังไม่เคยดู — ตรวจซ้ำเป็นระยะ (เช่น เปิด editor ทีหลังในหน้าเดียวกัน)
  useEffect(() => {
    if (!seen || tour) return;
    const tryStart = () => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false; // มีหน้าต่างอื่นเปิดอยู่
      const def = tourFor(path, visible, (id) => seen.has(id));
      if (def) { start(def); return true; }
      return false;
    };
    const first = setTimeout(tryStart, 900);
    const iv = setInterval(() => { if (tryStart()) clearInterval(iv); }, 2000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [path, seen, tour, start]);

  // ดูซ้ำจากเมนู
  useEffect(() => {
    const on = () => {
      const def = tourFor(path, visible) ?? TOURS.find((x) => x.match(path)) ?? null;
      if (def) start(def);
    };
    window.addEventListener(TOUR_START_EVENT, on);
    return () => window.removeEventListener(TOUR_START_EVENT, on);
  }, [path, start]);

  // เปลี่ยนหน้า = ปิดทัวร์ที่ค้าง (ไม่นับว่าดูแล้ว)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTour(null); }, [path]);

  const step = tour ? steps[idx] : undefined;

  // ตำแหน่ง element ที่ชี้ (ตามการเลื่อน/ย่อขยายจอ)
  useEffect(() => {
    if (!step) return;
    const el = step.target ? q(step.target) : null;
    if (el) el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const measure = () => {
      setVw(window.innerWidth);
      const e = step.target ? q(step.target) : null;
      if (!e) { setRect(null); return; }
      const r = e.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const t1 = setTimeout(measure, 350); // หลัง smooth scroll
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t1); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step]);

  const finish = useCallback(() => { if (tour) markSeen(tour.id); setTour(null); }, [tour, markSeen]);
  const next = useCallback(() => { if (idx >= steps.length - 1) finish(); else setIdx(idx + 1); }, [idx, steps.length, finish]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, finish, next, prev]);

  useEffect(() => { if (tour) cardRef.current?.focus(); }, [tour, idx]);

  if (!tour || !step) return null;

  const base = `tour.${tour.id}.${step.id}`;
  const title = t(`${base}.t` as never);
  const body = t(`${base}.b` as never);
  const PAD = 6;
  const narrow = vw < 560;
  const cardW = Math.min(360, vw - 24);
  // วางกล่องใต้ element ถ้าที่พอ ไม่งั้นด้านบน · จอแคบ/ไม่มี element = ชิดล่าง/กลางจอ
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (narrow) {
    const below = rect.top + rect.height / 2 < window.innerHeight / 2;
    cardStyle = below ? { bottom: 12, left: 12, right: 12 } : { top: 12, left: 12, right: 12 };
  } else {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
    cardStyle = spaceBelow > 230
      ? { top: rect.top + rect.height + PAD + 10, left }
      : { top: Math.max(12, rect.top - PAD - 10), left, transform: "translateY(-100%)" };
  }

  return (
    <BodyPortal>
      <div aria-hidden={false} style={{ position: "fixed", inset: 0, zIndex: 300 }}>
        {/* กันคลิกหน้าเดิมระหว่างทัวร์ + มืดรอบ ๆ (เจาะช่องตรง element ด้วยเงา) */}
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, background: rect ? "transparent" : "rgba(8,12,18,.55)" }} />
        {rect && (
          <div style={{
            position: "fixed", top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            borderRadius: 10, boxShadow: "0 0 0 9999px rgba(8,12,18,.55)", outline: "2px solid var(--accent)", pointerEvents: "none",
            transition: "top .2s, left .2s, width .2s, height .2s",
          }} />
        )}
        <div ref={cardRef} data-krok-tour="" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
          style={{ position: "fixed", width: narrow && rect ? "auto" : cardW, ...cardStyle, background: "var(--surface)", color: "var(--ink)",
            border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,.3)", padding: 16, outline: "none" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.02rem", flex: 1 }}>{title}</b>
            <button type="button" onClick={finish} aria-label={t("tour.skip")} title={t("tour.skip")}
              style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", display: "flex", padding: 2, margin: "-4px -4px 0 0" }}>
              <Icon icon={X} className="h-4 w-4" />
            </button>
          </div>
          <p style={{ margin: "6px 0 14px", fontSize: ".88rem", color: "var(--ink-2)", lineHeight: 1.6 }}>{body}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", gap: 4, marginRight: "auto" }} aria-label={`${idx + 1}/${steps.length}`}>
              {steps.map((_, i) => (
                <span key={i} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, background: i === idx ? "var(--accent)" : "var(--line)", transition: "width .2s" }} />
              ))}
            </span>
            {idx === 0 ? (
              <button type="button" onClick={finish} style={ghost}>{t("tour.skip")}</button>
            ) : (
              <button type="button" onClick={prev} style={ghost}>{t("tour.prev")}</button>
            )}
            <button type="button" onClick={next} style={{ ...ghost, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", fontWeight: 600 }}>
              {idx >= steps.length - 1 ? t("tour.done") : `${t("tour.next")} (${idx + 1}/${steps.length})`}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

const ghost: React.CSSProperties = {
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", borderRadius: 8, padding: "7px 12px",
  cursor: "pointer", fontFamily: "inherit", fontSize: ".84rem", whiteSpace: "nowrap",
};


/** ปุ่ม ? ในแถบบน — แสดงเฉพาะหน้าที่มีทัวร์ให้ดู (ตรวจซ้ำเป็นระยะ: บางหน้า element ขึ้นทีหลัง เช่น เปิด editor) */
export function TourHelpButton() {
  const path = usePathname();
  const { t } = useT();
  const [has, setHas] = useState(false);
  useEffect(() => {
    const check = () => setHas(!!tourFor(path, visible));
    const first = setTimeout(check, 400);
    const iv = setInterval(check, 2000);
    return () => { clearTimeout(first); clearInterval(iv); setHas(false); };
  }, [path]);
  if (!has) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))} aria-label={t("tour.replay")} title={t("tour.replay")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--accent-text)", cursor: "pointer" }}>
      <Icon icon={CircleHelp} className="h-4 w-4" />
    </button>
  );
}
