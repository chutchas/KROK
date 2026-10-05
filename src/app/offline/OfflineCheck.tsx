"use client";
import { useCallback, useEffect, useState } from "react";
import { getLastBundle } from "@/lib/offline-store";

type Row = [string, string, "ok" | "bad" | "info"];

/** หน้าตรวจความพร้อมออฟไลน์ (/offline?check) — เปิดตอนมีเน็ตบนเครื่องที่มีปัญหา แล้วแคปหน้าจอส่งให้ทีม */
export default function OfflineCheck() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    const r: Row[] = [];
    r.push(["เบราว์เซอร์", navigator.userAgent, "info"]);
    r.push(["ออนไลน์", String(navigator.onLine), "info"]);
    r.push(["โหมดแอปบนหน้าจอโฮม", String(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true), "info"]);
    if (!("serviceWorker" in navigator)) {
      r.push(["รองรับ Service Worker", "ไม่รองรับ (อาจเป็นโหมดส่วนตัว / Lockdown Mode / ปิดใน Settings)", "bad"]);
    } else {
      r.push(["รองรับ Service Worker", "รองรับ", "ok"]);
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        r.push(["ลงทะเบียน", `สำเร็จ · scope ${reg.scope}`, "ok"]);
        const w = reg.active || reg.waiting || reg.installing;
        r.push(["สถานะ worker", w ? `${w.state}${reg.active ? "" : " (ยังไม่ active)"}` : "ไม่มี", reg.active ? "ok" : "bad"]);
      } catch (e) {
        r.push(["ลงทะเบียน", `ล้มเหลว: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`, "bad"]);
      }
      r.push(["หน้านี้ถูกควบคุมโดย worker", navigator.serviceWorker.controller ? "ใช่" : "ไม่ (ปิดแล้วเปิดหน้านี้ใหม่อีกครั้ง)", navigator.serviceWorker.controller ? "ok" : "bad"]);
    }
    try {
      const keys = await caches.keys();
      r.push(["Cache", keys.join(", ") || "ว่าง", keys.length ? "ok" : "bad"]);
      const c = await caches.open("krok-v2");
      const reqs = await c.keys();
      const shell = await c.match("/offline", { ignoreVary: true });
      r.push(["หน้าออฟไลน์ในเครื่อง", shell ? "มี" : "ยังไม่มี", shell ? "ok" : "bad"]);
      r.push(["ไฟล์ที่เก็บไว้", `${reqs.length} ไฟล์ (JS/CSS ${reqs.filter((q) => q.url.includes("/_next/static/")).length})`, reqs.length > 5 ? "ok" : "bad"]);
    } catch (e) {
      r.push(["Cache", `อ่านไม่ได้: ${e instanceof Error ? e.message : String(e)}`, "bad"]);
    }
    try {
      const b = await getLastBundle();
      r.push(["ฟอร์มที่ดาวน์โหลดไว้", b ? `${b.forms.length} ฟอร์ม · ${b.tenantName} · ${new Date(b.savedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ยังไม่มี (เปิดแอปและล็อกอินตอนมีเน็ต)", b ? "ok" : "bad"]);
    } catch (e) {
      r.push(["ฟอร์มที่ดาวน์โหลดไว้", `อ่านไม่ได้: ${e instanceof Error ? e.message : String(e)}`, "bad"]);
    }
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      r.push(["พื้นที่", est ? `ใช้ ${((est.usage || 0) / 1e6).toFixed(1)} MB จาก ${((est.quota || 0) / 1e6).toFixed(0)} MB · ไม่ถูกลบอัตโนมัติ: ${persisted ? "ใช่" : "ไม่"}` : "ไม่ทราบ", "info"]);
    } catch { /* ignore */ }
    setRows(r);
  }, []);

  useEffect(() => { void run(); }, [run]);

  async function prepare() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: "krok-precache-shell" });
      await new Promise((res) => setTimeout(res, 6000));
    } catch { /* ignore */ }
    await run();
    setBusy(false);
  }

  const color = { ok: "var(--pass)", bad: "var(--fail)", info: "var(--ink-2)" };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h1 style={{ fontSize: "1.2rem", margin: 0 }}>ตรวจความพร้อมใช้งานออฟไลน์</h1>
      <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: 0 }}>เปิดหน้านี้ตอนมีเน็ต แล้วแคปหน้าจอส่งให้ทีมดูแลระบบ</p>
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
        {rows.map(([k, v, s], i) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 38%) 1fr", gap: 10, padding: "8px 12px", borderTop: i ? "1px solid var(--line)" : "none", fontSize: ".82rem" }}>
            <span style={{ color: "var(--ink-3)" }}>{k}</span>
            <span style={{ color: color[s], overflowWrap: "anywhere", fontWeight: s === "info" ? 400 : 600 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={prepare} disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 600 }}>{busy ? "กำลังเตรียม..." : "เตรียมไฟล์ออฟไลน์ตอนนี้"}</button>
        <button onClick={() => void run()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit" }}>ตรวจใหม่</button>
      </div>
    </div>
  );
}
