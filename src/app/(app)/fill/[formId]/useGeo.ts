"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoFix } from "@/lib/geo";

export type GeoStatus = "off" | "pending" | "ok" | "denied" | "unavailable";

const toFix = (p: GeolocationPosition): GeoFix => ({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: p.timestamp || Date.now() });

/**
 * ติดตามพิกัดระหว่างเปิดฟอร์ม (เฉพาะฟอร์มที่เปิด GPS) — เก็บพิกัดล่าสุดไว้ใช้ตอนถ่ายรูป/ส่ง
 * ขอสิทธิ์ครั้งแรกตอนเปิดฟอร์ม · ปฏิเสธ = denied (ฟอร์มบังคับจะส่งไม่ได้จนกว่าจะอนุญาต)
 */
export function useGeo(enabled: boolean) {
  const [status, setStatus] = useState<GeoStatus>(enabled ? "pending" : "off");
  const last = useRef<GeoFix | null>(null);
  const [fix, setFix] = useState<GeoFix | null>(null);

  const onPos = useCallback((p: GeolocationPosition) => {
    const f = toFix(p);
    // เก็บตัวที่แม่นกว่า ถ้าตัวใหม่ไม่ได้ใหม่กว่ามาก
    const prev = last.current;
    if (!prev || f.acc <= prev.acc || f.at - prev.at > 30_000) { last.current = f; setFix(f); }
    setStatus("ok");
  }, []);
  const onErr = useCallback((e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) setStatus("denied");
    else if (!last.current) setStatus("unavailable");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setStatus("unavailable"); return; }
    const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, onPos, onErr]);

  /** พิกัดสำหรับส่ง: ใช้ตัวล่าสุดถ้ายังสด (≤2 นาที) ไม่งั้นขอใหม่ (รอสูงสุด timeoutMs) */
  const getFix = useCallback((timeoutMs = 12_000): Promise<GeoFix | null> => {
    const cur = last.current;
    if (cur && Date.now() - cur.at < 120_000) return Promise.resolve(cur);
    if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(cur);
    return new Promise((res) => {
      navigator.geolocation.getCurrentPosition(
        (p) => { onPos(p); res(last.current); },
        (e) => { onErr(e); res(cur); },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs },
      );
    });
  }, [onPos, onErr]);

  /** ลองขอสิทธิ์อีกครั้ง (หลังผู้ใช้ไปเปิดในตั้งค่า) */
  const retry = useCallback(() => { setStatus("pending"); void getFix(); }, [getFix]);

  return { status, fix, lastRef: last, getFix, retry };
}
