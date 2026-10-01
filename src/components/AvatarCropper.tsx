"use client";
// ============================================================
// KROK · หน้าต่างครอปรูปโปรไฟล์ (สี่เหลี่ยมจัตุรัส แสดงกรอบวงกลม)
// ลาก = เลื่อนรูป · ล้อเมาส์ / สองนิ้ว / แถบเลื่อน = ซูม
// ผลลัพธ์: JPEG 512×512 (เล็กกว่า 2MB เสมอ แม้ต้นฉบับใหญ่ หรือเป็น PNG/WebP)
// ไม่มีปิดด้วยการคลิกพื้นหลัง — กันลากรูปเลยกรอบแล้วหน้าต่างปิดเอง
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, X } from "lucide-react";
import Icon from "@/components/Icon";
import BodyPortal from "@/components/BodyPortal";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";

const OUT = 512;
const MAX_ZOOM = 5;

type Pt = { x: number; y: number };

export default function AvatarCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const { t } = useT();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState(false);
  const [size, setSize] = useState(300); // ขนาดกรอบครอป (px บนจอ)
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState<Pt>({ x: 0, y: 0 }); // จุดกึ่งกลางรูปเทียบกึ่งกลางกรอบ
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);

  // โหลดรูป
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setErr(true);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ขนาดกรอบตามจอ
  useEffect(() => {
    const fit = () => setSize(Math.max(200, Math.min(340, window.innerWidth - 72, window.innerHeight - 260)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const base = img ? size / Math.min(img.naturalWidth, img.naturalHeight) : 1; // ซูม 1 = รูปเต็มกรอบพอดี (cover)
  const scale = base * zoom;

  // ไม่ให้เลื่อนจนเห็นช่องว่างในกรอบ
  const clamp = useCallback((p: Pt, z: number): Pt => {
    if (!img) return p;
    const s = base * z;
    const mx = Math.max(0, (img.naturalWidth * s - size) / 2);
    const my = Math.max(0, (img.naturalHeight * s - size) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }, [img, base, size]);

  // ซูมรอบจุดกึ่งกลางกรอบ: ระยะเลื่อนขยายตามอัตราซูม
  const zoomRef = useRef(1);
  const setZoomClamped = useCallback((z: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const k = nz / zoomRef.current;
    zoomRef.current = nz;
    setZoom(nz);
    setOff((o) => clamp({ x: o.x * k, y: o.y * k }, nz));
  }, [clamp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // ล้อเมาส์ = ซูม (ต้องผูกเองแบบ passive:false ถึงจะกันหน้าเลื่อนได้)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoomClamped(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, setZoomClamped]);

  const dist = () => {
    const [a, b] = Array.from(pointers.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function onDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) gesture.current = { dist: dist(), zoom };
  }
  function onMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2 && gesture.current) {
      setZoomClamped(gesture.current.zoom * (dist() / gesture.current.dist));
    } else if (pointers.current.size === 1) {
      setOff((o) => clamp({ x: o.x + cur.x - prev.x, y: o.y + cur.y - prev.y }, zoom));
    }
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  function save() {
    if (!img) return;
    setBusy(true);
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; // PNG โปร่งใส → พื้นขาว (JPEG ไม่มีโปร่งใส)
    ctx.fillRect(0, 0, OUT, OUT);
    // มุมซ้ายบนของรูปบนจอ เทียบกรอบ → แปลงเป็นพื้นที่ต้นฉบับที่อยู่ในกรอบ
    const left = size / 2 + off.x - (img.naturalWidth * scale) / 2;
    const top = size / 2 + off.y - (img.naturalHeight * scale) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -left / scale, -top / scale, size / scale, size / scale, 0, 0, OUT, OUT);
    c.toBlob((b) => { setBusy(false); if (b) onDone(b); }, "image/jpeg", 0.88);
  }

  return (
    <BodyPortal>
      <div role="dialog" aria-modal="true" aria-label={t("profile.cropTitle")}
        style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(8,12,18,.7)", display: "flex", padding: 16, overflowY: "auto" }}>
        <div style={{ margin: "auto", width: size + 32, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, boxShadow: "0 14px 40px rgba(0,0,0,.35)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <b style={{ fontSize: "1rem" }}>{t("profile.cropTitle")}</b>
            <button type="button" onClick={onCancel} aria-label={t("common.close")} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex" }}><Icon icon={X} className="h-5 w-5" /></button>
          </div>

          <div ref={boxRef}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ position: "relative", width: size, height: size, margin: "0 auto", overflow: "hidden", borderRadius: 10, background: "#111", touchAction: "none", cursor: img ? "grab" : "default", userSelect: "none" }}>
            {img && (
              <img src={img.src} alt="" draggable={false}
                style={{ position: "absolute", left: "50%", top: "50%", width: img.naturalWidth * scale, height: img.naturalHeight * scale, maxWidth: "none",
                  transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`, pointerEvents: "none" }} />
            )}
            {/* กรอบวงกลม: มืดนอกวง */}
            <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "0 0 0 9999px rgba(0,0,0,.5)", border: "2px solid rgba(255,255,255,.85)", pointerEvents: "none" }} />
            {!img && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: ".85rem" }}>{err ? t("profile.avatarErrRead") : t("common.loading")}</div>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setZoomClamped(zoom / 1.2)} aria-label={t("profile.zoomOut")} style={zBtn}><Icon icon={ZoomOut} className="h-4 w-4" /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoomClamped(+e.target.value)} aria-label={t("profile.zoom")} style={{ flex: 1, accentColor: "var(--accent)" }} />
            <button type="button" onClick={() => setZoomClamped(zoom * 1.2)} aria-label={t("profile.zoomIn")} style={zBtn}><Icon icon={ZoomIn} className="h-4 w-4" /></button>
          </div>
          <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "6px 0 0", textAlign: "center" }}>{t("profile.cropHint")}</p>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button type="button" onClick={onCancel}>{t("common.cancel")}</Button>
            <Button type="button" variant="primary" onClick={save} disabled={!img || busy}>{t("profile.cropSave")}</Button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

const zBtn: React.CSSProperties = {
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex", flexShrink: 0,
};
