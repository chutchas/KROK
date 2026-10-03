"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * ประวัติย้อนกลับ/ทำซ้ำของค่าที่แก้ (ใช้กับฟอร์มที่กำลังสร้าง)
 * - จับทุกการเปลี่ยนแปลงของ value เอง (คีย์บอร์ด / ลาก / แผงตั้งค่า) — ไม่ต้องเรียก push ทุกจุด
 * - การเปลี่ยนต่อเนื่องที่ห่างกันไม่ถึง gapMs (ลากฟิลด์ / พิมพ์ชื่อ) รวมเป็นขั้นเดียว
 * - เก็บล่าสุด limit ขั้น · reset() ตอนเปิดฟอร์มอื่น
 */
export function useUndo<T>(value: T, setValue: (v: T) => void, { gapMs = 600, limit = 80 } = {}) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const prev = useRef<T>(value);
  const lastAt = useRef(0);
  const discrete = useRef(false);

  useEffect(() => {
    if (value === prev.current) return;
    const now = Date.now();
    if (prev.current != null && value != null && (discrete.current || now - lastAt.current > gapMs)) {
      past.current.push(prev.current);
      if (past.current.length > limit) past.current.shift();
    }
    if (value == null) past.current = [];
    future.current = [];
    // คำสั่งเดี่ยว (ลบ/วาง/ทำสำเนา) = 1 ขั้นเสมอ และการแก้ถัดไปเริ่มขั้นใหม่
    lastAt.current = discrete.current ? 0 : now;
    discrete.current = false;
    prev.current = value;
  }, [value, gapMs, limit]);

  const undo = useCallback((): boolean => {
    const target = past.current.pop();
    if (target === undefined) return false;
    future.current.push(prev.current);
    prev.current = target; // effect จะเห็นค่าเท่ากัน → ไม่บันทึกซ้ำ
    lastAt.current = 0;
    setValue(target);
    return true;
  }, [setValue]);

  const redo = useCallback((): boolean => {
    const target = future.current.pop();
    if (target === undefined) return false;
    past.current.push(prev.current);
    prev.current = target;
    lastAt.current = 0;
    setValue(target);
    return true;
  }, [setValue]);

  /** ล้างประวัติ — ส่งค่าใหม่มาด้วยเมื่อกำลังเปลี่ยนไปแก้อีกชิ้น (ไม่ให้ย้อนกลับไปเป็นฟอร์มเดิม) */
  const reset = useCallback((next?: T) => {
    past.current = []; future.current = []; lastAt.current = 0;
    if (next !== undefined) prev.current = next;
  }, []);
  /** เรียกก่อนคำสั่งเดี่ยว (ลบ/วาง/ทำสำเนา/ย้ายลำดับ) — ไม่ให้รวมกับการแก้ที่เพิ่งทำ */
  const checkpoint = useCallback(() => { discrete.current = true; }, []);
  /** เรียกใน event handler เท่านั้น (อ่าน ref) */
  const canUndo = useCallback(() => past.current.length > 0, []);
  const canRedo = useCallback(() => future.current.length > 0, []);

  return { undo, redo, reset, checkpoint, canUndo, canRedo };
}
