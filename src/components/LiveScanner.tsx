"use client";
import { backdropClose } from "@/lib/backdrop";
import BodyPortal from "@/components/BodyPortal";
import { useEffect, useId, useRef, useState } from "react";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import Icon from "@/components/Icon";
import { X, ScanLine } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// สแกน QR/บาร์โค้ดสดจากกล้อง — ใช้ BarcodeDetector (ถ้ามี) ไม่งั้น fallback jsQR (QR เท่านั้น)
// jsQR โหลดแบบ dynamic เฉพาะตอนเปิดสแกนเนอร์ เพื่อไม่ให้ติดมากับ bundle หน้ากรอก
type BD = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type JsQrFn = (data: Uint8ClampedArray, w: number, h: number, opts?: { inversionAttempts?: string }) => { data: string } | null;

// continuous = สแกนต่อเนื่อง (เช่น สแกนทีละชิ้นเพิ่มแถวตาราง) — ไม่ปิดเองหลังอ่านได้ · โค้ดเดิมซ้ำภายใน 2 วิ ไม่นับ
export default function LiveScanner({ onResult, onClose, continuous = false }: { onResult: (code: string) => void; onClose: () => void; continuous?: boolean }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BD | null>(null);
  const jsqrRef = useRef<JsQrFn | null>(null);
  const stopped = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [lastCode, setLastCode] = useState("");
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(boxRef, onClose);

  useEffect(() => {
    stopped.current = false;

    async function start() {
      try {
        const BDClass = (window as unknown as { BarcodeDetector?: new (o?: unknown) => BD }).BarcodeDetector;
        if (BDClass) {
          try { detectorRef.current = new BDClass(); } catch { detectorRef.current = null; }
        }
        // โหลด jsQR เฉพาะเมื่อไม่มี BarcodeDetector (fallback)
        if (!detectorRef.current) {
          try { jsqrRef.current = (await import("jsqr")).default as unknown as JsQrFn; } catch { /* ไม่มี fallback */ }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setErr(name === "NotAllowedError" ? t("scan.errPermission") : t("scan.errCamera"));
      }
    }

    async function tick() {
      if (stopped.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h);
            // 1) BarcodeDetector รองรับหลายรูปแบบ (1D + QR)
            if (detectorRef.current) {
              try {
                const codes = await detectorRef.current.detect(c);
                if (codes[0]?.rawValue) return finish(codes[0].rawValue);
              } catch { /* ตกไป jsQR */ }
            }
            // 2) fallback jsQR (QR เท่านั้น)
            if (jsqrRef.current) {
              try {
                const img = ctx.getImageData(0, 0, w, h);
                const qr = jsqrRef.current(img.data, w, h, { inversionAttempts: "dontInvert" });
                if (qr?.data) return finish(qr.data);
              } catch { /* ข้ามเฟรม */ }
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function finish(code: string) {
      if (stopped.current) return;
      if (continuous) {
        const now = Date.now();
        if (!(code === last.current.code && now - last.current.at < 2000)) {
          onResult(code);
          setCount((n) => n + 1);
          setLastCode(code);
          try { navigator.vibrate?.(60); } catch { /* ไม่รองรับ */ }
        }
        last.current = { code, at: now };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      cleanup();
      onResult(code);
    }

    function cleanup() {
      stopped.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }

    start();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BodyPortal>
    <div
      {...backdropClose(onClose)}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,10,14,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--surface)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b id={titleId} style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={ScanLine} className="h-5 w-5" /> {t("scan.title")}
          </b>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        <div style={{ position: "relative", background: "#000", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {err ? (
            <div role="alert" style={{ color: "#fff", textAlign: "center", padding: 24, fontSize: ".9rem" }}>{err}</div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "62%", aspectRatio: "1", border: "3px solid rgba(255,255,255,.9)", borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,.25)" }} />
              </div>
            </>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
        <div style={{ padding: "10px 14px", fontSize: ".82rem", color: "var(--ink-2)", textAlign: "center" }}>
          {continuous && count > 0 ? (
            <><b style={{ color: "var(--pass)" }}>{t("scan.countAdded").replace("{n}", String(count))}</b> · <span style={{ fontFamily: "monospace" }}>{lastCode}</span></>
          ) : continuous ? t("scan.hintContinuous") : t("scan.hint")}
        </div>
        {continuous && (
          <div style={{ padding: "0 14px 12px", display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{t("scan.done")}</button>
          </div>
        )}
      </div>
    </div>
    </BodyPortal>
  );
}
