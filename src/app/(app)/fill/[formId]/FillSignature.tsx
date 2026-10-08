"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";
import { Check, X, PenLine } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import BodyPortal from "@/components/BodyPortal";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

export function SignaturePad({ hasSig, initialUrl, onSave, paper = false, compact = false }: { hasSig: boolean; initialUrl?: string; onSave: (d: string | null) => void; paper?: boolean; compact?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // มีเส้นใหม่ในจังหวะลากนี้ไหม — บันทึก (toDataURL + onSave) ครั้งเดียวตอนยกนิ้ว ไม่ใช่ทุก pointermove
  // (เดิม onSave ทุก move → re-render ทั้งตัวกรอกฟอร์มหลายสิบครั้งต่อวินาที เส้นสะดุดบนมือถือ)
  const dirty = useRef(false);
  const last = useRef<[number, number]>([0, 0]);
  const h = compact ? 60 : 140;

  const setup = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = cv.offsetWidth * 2;
    cv.height = h * 2;
    const ctx = cv.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    // หมึกสีเข้มเสมอ (โหมดมืดเดิมได้เส้นสีขาว → พิมพ์บนกระดาษขาวแล้วมองไม่เห็น)
    ctx.strokeStyle = "#111";
  }, [h]);
  useEffect(() => {
    setup();
    // กลับมาหน้านี้อีกครั้ง: วาดลายเซ็นเดิมกลับลงไป
    if (initialUrl && ref.current) {
      const img = new Image();
      img.onload = () => { const cv = ref.current; if (cv) cv.getContext("2d")!.drawImage(img, 0, 0, cv.offsetWidth, h); };
      img.src = initialUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const endStroke = () => {
    drawing.current = false;
    if (!dirty.current || !ref.current) return;
    dirty.current = false;
    onSave(ref.current.toDataURL("image/png"));
  };

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  return (
    <>
      <div style={{ position: "relative" }}>
      <canvas
        ref={ref}
        aria-label={t("fw.sig.here")}
        style={{ width: "100%", height: h, border: paper ? "1px dashed #b9bec4" : "1px dashed var(--line)", borderRadius: 10, background: "#fff", touchAction: "none", display: "block", position: "relative" }}
        onPointerDown={(e) => { drawing.current = true; last.current = pos(e); ref.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(last.current[0], last.current[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
          last.current = p;
          dirty.current = true;
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
      />
      {/* เส้นเซ็น + คำแนะนำ (หายเมื่อเซ็นแล้ว) */}
      <div aria-hidden style={{ position: "absolute", left: 16, right: 16, bottom: compact ? 12 : 26, borderBottom: "1px solid #c3c8ce", pointerEvents: "none", zIndex: 1 }} />
      {!hasSig && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#9aa0a6", fontSize: compact ? ".72rem" : ".88rem", pointerEvents: "none", zIndex: 1 }}>
          <Icon icon={PenLine} className="h-4 w-4" /> {t("fw.sig.here")}
        </div>
      )}
      </div>
      <div style={{ marginTop: 6 }}>
        <Button onClick={() => { const ctx = ref.current!.getContext("2d")!; ctx.clearRect(0, 0, ref.current!.width, ref.current!.height); drawing.current = false; dirty.current = false; onSave(null); }}>{t("fw.sig.clear")}</Button>
        {hasSig && <span style={{ marginLeft: 10, color: "var(--pass)", fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={Check} className="h-3.5 w-3.5" /> {t("fw.sig.signed")}</span>}
      </div>
    </>
  );
}

/** แผ่นเซ็นเต็มจอ (โหมดกระดาษ) — กดบันทึกจึงเขียนลงฟอร์ม */
export function SignatureModal({ label, initialUrl, onSave, onClose }: { label: string; initialUrl?: string; onSave: (d: string | null) => void; onClose: () => void }) {
  const { t, tt } = useT();
  const [temp, setTemp] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDialogA11y(boxRef, onClose);
  return (
    <BodyPortal>
    <div role="dialog" aria-modal="true" aria-label={tt("fw.sig.aria", { label })} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,10,14,.55)", display: "flex", padding: 16, overflowY: "auto", overscrollBehavior: "contain" }}>
      <div ref={boxRef} style={{ width: "min(640px, 100%)", margin: "auto", background: "#fff", color: "#111", borderRadius: 12, padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b style={{ fontSize: "1rem" }}>{tt("fw.sig.title", { label })}</b>
          <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "none", cursor: "pointer", color: "#666", display: "flex" }}><Icon icon={X} className="h-5 w-5" /></button>
        </div>
        {initialUrl && !temp && !cleared && (
          <div style={{ fontSize: ".78rem", color: "#666", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            {t("fw.sig.prev")} <img src={initialUrl} alt={t("fw.sig.prevAlt")} style={{ height: 32, border: "1px solid #eee", borderRadius: 4 }} /> {t("fw.sig.replaceHint")}
          </div>
        )}
        <SignaturePad hasSig={!!temp} paper onSave={(d) => { setTemp(d); if (!d) setCleared(true); }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!temp && !cleared} onClick={() => onSave(temp)}>{t("fw.sig.save")}</Button>
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}

