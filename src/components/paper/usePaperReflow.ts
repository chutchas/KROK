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
  // ResizeObserver ตัวเดียวทั้งหน้า: บล็อกที่เปลี่ยนขนาดพร้อมกัน (ตอน mount / ฟอนต์โหลด) → setState ครั้งเดียว
  const keyOf = useRef(new WeakMap<Element, string>());
  const elOf = useRef(new Map<string, HTMLDivElement>());
  const roRef = useRef<ResizeObserver | null>(null);
  const refFns = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  const observer = useCallback((): ResizeObserver => {
    if (!roRef.current) {
      roRef.current = new ResizeObserver((entries) => {
        const changes: Record<string, number> = {};
        for (const e of entries) {
          const k = keyOf.current.get(e.target);
          if (k) changes[k] = (e.target as HTMLElement).offsetHeight; // ขนาดก่อน scale
        }
        setMeasured((m) => {
          let next: Record<string, number> | null = null;
          for (const [k, h] of Object.entries(changes)) if (m[k] !== h) (next ??= { ...m })[k] = h;
          return next ?? m;
        });
      });
    }
    return roRef.current;
  }, []);

  // ref callback คงที่ต่อ key — ไม่ถอด/ติด observer ใหม่ทุกครั้งที่ render
  const measureRef = useCallback((key: string) => {
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        const prev = elOf.current.get(key);
        if (prev && prev !== el) { observer().unobserve(prev); elOf.current.delete(key); }
        if (!el) { refFns.current.delete(key); return; } // บล็อกถูกลบ → ไม่เก็บ ref ค้าง
        keyOf.current.set(el, key);
        elOf.current.set(key, el);
        observer().observe(el);
      };
      refFns.current.set(key, fn);
    }
    return fn;
  }, [observer]);

  useEffect(() => {
    const els = elOf.current;
    return () => { roRef.current?.disconnect(); roRef.current = null; els.clear(); };
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
