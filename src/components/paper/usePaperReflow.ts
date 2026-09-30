"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaperBox } from "@/lib/form-schema";
import { blockHeight, reflowTops, type Block } from "@/lib/paper-layout";

/**
 * วัดความสูงจริงของแต่ละบล็อกบนกระดาษ แล้วคำนวณตำแหน่ง top ใหม่ (ดันบล็อกด้านล่างลงเมื่อเนื้อหางอก)
 * ใช้ร่วมกันใน Editor และหน้ากรอก → ทั้งสองหน้าจัดวางด้วยกติกาเดียวกัน ผลตรงกัน
 */
export function usePaperReflow(blocks: Block[], layout: Record<string, PaperBox>) {
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const observers = useRef(new Map<string, ResizeObserver>());
  const refFns = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  // ref callback คงที่ต่อ key — ไม่ถอด/ติด ResizeObserver ใหม่ทุกครั้งที่ render
  const measureRef = useCallback((key: string) => {
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        observers.current.get(key)?.disconnect();
        observers.current.delete(key);
        if (!el) return;
        const ro = new ResizeObserver(() => {
          const h = el.offsetHeight; // ขนาดก่อน scale
          setMeasured((m) => (m[key] === h ? m : { ...m, [key]: h }));
        });
        ro.observe(el);
        observers.current.set(key, ro);
      };
      refFns.current.set(key, fn);
    }
    return fn;
  }, []);

  useEffect(() => {
    const obs = observers.current;
    return () => { obs.forEach((o) => o.disconnect()); obs.clear(); };
  }, []);

  const tops = useMemo(() => reflowTops(blocks, layout, measured), [blocks, layout, measured]);

  const height = useMemo(() => {
    let max = 900;
    for (const b of blocks) {
      const box = layout[b.key];
      if (box) max = Math.max(max, (tops[b.key] ?? box.y) + (measured[b.key] ?? blockHeight(b)) + 60);
    }
    return max;
  }, [blocks, layout, tops, measured]);

  /** บล็อกนี้มีเนื้อหาสูงเกินกล่องที่ออกแบบไหม */
  const overflows = useCallback((b: Block) => (measured[b.key] ?? 0) > blockHeight(b) + 1, [measured]);

  return { measureRef, tops, height, overflows };
}
