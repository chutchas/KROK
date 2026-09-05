"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Icon from "@/components/Icon";
import { X, ScanLine } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// สแกน QR/บาร์โค้ดสดจากกล้อง — ใช้ BarcodeDetector (ถ้ามี) ไม่งั้น fallback jsQR (QR เท่านั้น)
type BD = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export default function LiveScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BD | null>(null);
  const stopped = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    stopped.current = false;

    async function start() {
      try {
        const BDClass = (window as unknown as { BarcodeDetector?: new (o?: unknown) => BD }).BarcodeDetector;
        if (BDClass) {
          try { detectorRef.current = new BDClass(); } catch { detectorRef.current = null; }
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
            try {
              const img = ctx.getImageData(0, 0, w, h);
              const qr = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (qr?.data) return finish(qr.data);
            } catch { /* ข้ามเฟรม */ }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function finish(code: string) {
      if (stopped.current) return;
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
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,10,14,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--surface)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={ScanLine} className="h-5 w-5" /> {t("scan.title")}
          </b>
          <button onClick={onClose} aria-label={t("common.close")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
            <Icon icon={X} className="h-5 w-5" />
          </button>
        </div>
        <div style={{ position: "relative", background: "#000", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {err ? (
            <div style={{ color: "#fff", textAlign: "center", padding: 24, fontSize: ".9rem" }}>{err}</div>
          ) : (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "62%", aspectRatio: "1", border: "3px solid rgba(255,255,255,.9)", borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,.25)" }} />
              </div>
            </>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
        <div style={{ padding: "10px 14px", fontSize: ".82rem", color: "var(--ink-2)", textAlign: "center" }}>{t("scan.hint")}</div>
      </div>
    </div>
  );
}
