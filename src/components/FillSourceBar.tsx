"use client";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Button } from "@/components/ui";
import { Camera, Check, FileText, ScanLine, Sparkles, WifiOff, X } from "lucide-react";
import LiveScanner from "@/components/LiveScanner";
import type { FillSource, FormStep } from "@/lib/form-schema";

export type FillSrcTag = "scan" | "ai" | "ai_edited";

export interface AppliedValue {
  field_id: string;
  value: string;
  src: FillSrcTag;
}

/** บันทึกการอ่านเอกสาร 1 ครั้ง — เก็บเป็นหลักฐานพร้อมใบงาน */
export interface DocExtractRecord {
  source_id: string;
  dataUrl?: string;
  raw: { key: string; value: string; confidence: number }[];
  accepted: { key: string; field_id: string; value: string; edited: boolean }[];
}

interface Row {
  key: string;
  field_id: string;
  label: string;
  value: string;
  original: string;
  confidence: number;
  take: boolean;
  occupied: boolean;
}

const LOW_CONFIDENCE = 0.75;

export default function FillSourceBar({
  step,
  getValue,
  onApply,
  onExtract,
  publicMode = false,
  shrinkImage,
  dataUrlToBlob,
}: {
  step: FormStep;
  getValue: (fieldId: string) => string;
  onApply: (values: AppliedValue[]) => void;
  onExtract: (rec: DocExtractRecord) => void;
  publicMode?: boolean;
  shrinkImage: (f: File) => Promise<string>;
  dataUrlToBlob: (d: string) => Blob;
}) {
  const sources = step.fill_sources ?? [];
  // โหมดสาธารณะไม่มี doc extract (endpoint ต้องล็อกอิน + ใช้เครดิตของ workspace)
  const visible = publicMode ? sources.filter((s) => s.kind === "scan") : sources;

  const [liveFor, setLiveFor] = useState<FillSource | null>(null);
  const [docFor, setDocFor] = useState<FillSource | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [review, setReview] = useState<{ src: FillSource; rows: Row[]; photo: string; raw: DocExtractRecord["raw"] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = new Map(step.fields.map((f) => [f.id, f]));
  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  if (visible.length === 0) return null;

  // ---------- scan ----------
  function applyScan(src: FillSource, code: string) {
    const parse = src.parse ?? "raw";
    let picked: AppliedValue[] = [];

    if (parse === "raw") {
      picked = [{ field_id: src.map[0].field_id, value: code, src: "scan" }];
    } else if (parse === "json") {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(code);
        if (!obj || typeof obj !== "object") throw new Error();
      } catch {
        setMsg({ t: "โค้ดนี้ไม่ใช่ JSON — กรอกด้วยมือได้ตามปกติ", err: true });
        return;
      }
      picked = src.map
        .filter((m) => obj[m.key] != null && String(obj[m.key]) !== "")
        .map((m) => ({ field_id: m.field_id, value: String(obj[m.key]), src: "scan" as const }));
    } else {
      let groups: Record<string, string> | undefined;
      try {
        groups = new RegExp(src.pattern || "").exec(code)?.groups;
      } catch {
        groups = undefined;
      }
      if (!groups) {
        setMsg({ t: "โค้ดที่สแกนได้ไม่ตรงรูปแบบที่ตั้งไว้ — กรอกด้วยมือได้ตามปกติ", err: true });
        return;
      }
      const g = groups;
      picked = src.map
        .filter((m) => g[m.key] != null && g[m.key] !== "")
        .map((m) => ({ field_id: m.field_id, value: g[m.key], src: "scan" as const }));
    }

    if (picked.length === 0) {
      setMsg({ t: "อ่านโค้ดได้ แต่ไม่พบค่าที่ต้องการในนั้น", err: true });
      return;
    }
    onApply(picked);
    setMsg({ t: `เติมแล้ว ${picked.length} ช่อง จาก “${src.label}”` });
  }

  async function scanFromImage(src: FillSource, file: File) {
    setBusy(src.id);
    setMsg({ t: "กำลังอ่านโค้ด..." });
    try {
      const BD = (window as unknown as {
        BarcodeDetector?: new () => { detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]> };
      }).BarcodeDetector;
      if (!BD) {
        setMsg({ t: "เบราว์เซอร์นี้อ่านโค้ดจากรูปไม่ได้ — ใช้ปุ่มสแกนสดแทน", err: true });
        return;
      }
      const codes = await new BD().detect(await createImageBitmap(file));
      const code = codes[0]?.rawValue;
      if (!code) {
        setMsg({ t: "ไม่พบบาร์โค้ด/QR ในรูปนี้", err: true });
        return;
      }
      applyScan(src, code);
    } catch {
      setMsg({ t: "อ่านโค้ดไม่สำเร็จ", err: true });
    } finally {
      setBusy(null);
    }
  }

  // ---------- doc ----------
  async function runExtract(src: FillSource, file: File) {
    setBusy(src.id);
    setMsg({ t: "AI กำลังอ่านเอกสาร..." });
    try {
      const photo = await shrinkImage(file);
      const keys = src.map.map((m) => {
        const f = byId.get(m.field_id);
        // dropdown จากข้อมูลอ้างอิงที่ตัวเลือกเยอะ: ส่งเป็นข้อความ (ไม่ยัดหลายร้อยตัวเลือกลง prompt)
        // ให้คนหน้างานยืนยัน/แก้ในหน้าต่างยืนยันตามปกติ
        const big = !!f?.options_source && (f.options?.length ?? 0) > 20;
        return { key: m.key, hint: m.hint, type: big ? "text" : f?.type ?? "text", options: big ? undefined : f?.options };
      });

      const fd = new FormData();
      fd.append("file", dataUrlToBlob(photo), "doc.jpg");
      fd.append("doc_hint", src.doc_hint || "");
      fd.append("keys", JSON.stringify(keys));

      const res = await fetch("/api/ai/extract-doc", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ t: j.error || "อ่านเอกสารไม่สำเร็จ — กรอกด้วยมือได้ตามปกติ", err: true });
        return;
      }

      const raw: DocExtractRecord["raw"] = j.values ?? [];
      const rows: Row[] = src.map
        .map((m) => {
          const hit = raw.find((v) => v.key === m.key);
          const field = byId.get(m.field_id);
          if (!hit || !field) return null;
          const occupied = getValue(m.field_id).trim() !== "";
          return {
            key: m.key,
            field_id: m.field_id,
            label: field.label,
            value: hit.value,
            original: hit.value,
            confidence: hit.confidence,
            // ความมั่นใจต่ำ หรือช่องมีค่าอยู่แล้ว → ไม่ติ๊กให้ ปล่อยว่างดีกว่าเติมผิด
            take: hit.confidence >= LOW_CONFIDENCE && !occupied,
            occupied,
          };
        })
        .filter((r): r is Row => r !== null);

      if (rows.length === 0) {
        setMsg({ t: "อ่านเอกสารแล้วแต่ไม่พบค่าที่ต้องการ — กรอกด้วยมือได้ตามปกติ", err: true });
        onExtract({ source_id: src.id, dataUrl: src.keep_photo !== false ? photo : undefined, raw, accepted: [] });
        return;
      }

      setMsg(null);
      setReview({ src, rows, photo, raw });
    } catch {
      setMsg({ t: "อ่านเอกสารไม่สำเร็จ — กรอกด้วยมือได้ตามปกติ", err: true });
    } finally {
      setBusy(null);
    }
  }

  function confirmReview() {
    if (!review) return;
    const taken = review.rows.filter((r) => r.take && r.value.trim() !== "");
    onApply(
      taken.map((r) => ({
        field_id: r.field_id,
        value: r.value,
        src: r.value !== r.original ? "ai_edited" : "ai",
      }))
    );
    onExtract({
      source_id: review.src.id,
      dataUrl: review.src.keep_photo !== false ? review.photo : undefined,
      raw: review.raw,
      accepted: taken.map((r) => ({ key: r.key, field_id: r.field_id, value: r.value, edited: r.value !== r.original })),
    });
    setMsg({ t: taken.length ? `เติมแล้ว ${taken.length} ช่อง จาก “${review.src.label}”` : "ไม่ได้เติมช่องใด" });
    setReview(null);
  }

  return (
    <div style={{ display: "grid", gap: 8, margin: "0 0 16px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {visible.map((src) => {
          const isScan = src.kind === "scan";
          const disabled = busy !== null || (!isScan && !online);
          return (
            <div key={src.id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button
                variant={isScan ? "primary" : "default"}
                disabled={disabled}
                onClick={() => {
                  setMsg(null);
                  if (isScan) setLiveFor(src);
                  else { setDocFor(src); fileRef.current?.click(); }
                }}
              >
                <Icon icon={isScan ? ScanLine : FileText} className="h-4 w-4" />
                {busy === src.id ? "กำลังอ่าน..." : src.label}
                {!isScan && <Icon icon={Sparkles} className="h-3.5 w-3.5" />}
              </Button>
              {isScan && (
                <Button
                  disabled={disabled}
                  title="เลือกรูปที่มีบาร์โค้ด/QR"
                  onClick={() => { setMsg(null); setDocFor(src); fileRef.current?.click(); }}
                >
                  <Icon icon={Camera} className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const src = docFor;
          e.target.value = "";
          setDocFor(null);
          if (!file || !src) return;
          if (src.kind === "scan") void scanFromImage(src, file);
          else void runExtract(src, file);
        }}
      />

      {!online && visible.some((s) => s.kind === "doc") && (
        <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon icon={WifiOff} className="h-3.5 w-3.5" />
          ออฟไลน์อยู่ — ปุ่มอ่านเอกสารใช้ไม่ได้ กรอกช่องเหล่านี้ด้วยมือได้ตามปกติ (การสแกนโค้ดยังใช้ได้)
        </div>
      )}

      {msg && (
        <div style={{ fontSize: ".82rem", color: msg.err ? "var(--fail)" : "var(--pass)", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon icon={msg.err ? X : Check} className="h-4 w-4" /> {msg.t}
        </div>
      )}

      {liveFor && (
        <LiveScanner
          onClose={() => setLiveFor(null)}
          onResult={(code) => { const s = liveFor; setLiveFor(null); if (s) applyScan(s, code); }}
        />
      )}

      {review && (
        <ReviewModal
          review={review}
          onChange={(rows) => setReview({ ...review, rows })}
          onCancel={() => { setReview(null); setMsg({ t: "ยกเลิกแล้ว — ไม่ได้เติมช่องใด" }); }}
          onConfirm={confirmReview}
        />
      )}
    </div>
  );
}

function ReviewModal({
  review,
  onChange,
  onCancel,
  onConfirm,
}: {
  review: { src: FillSource; rows: Row[]; photo: string };
  onChange: (rows: Row[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { rows, photo, src } = review;
  const takeCount = rows.filter((r) => r.take).length;

  function patch(i: number, p: Partial<Row>) {
    onChange(rows.map((r, ri) => (ri === i ? { ...r, ...p } : r)));
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto", boxShadow: "var(--shadow)" }}
      >
        <h3 style={{ fontSize: "1.05rem", margin: "0 0 3px", display: "flex", alignItems: "center", gap: 7 }}>
          <Icon icon={Sparkles} className="h-4 w-4 text-[var(--accent)]" /> ตรวจค่าที่อ่านได้
        </h3>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "0 0 12px" }}>
          จาก “{src.label}” — คุณถือเอกสารจริงอยู่ ตรวจให้ตรงก่อนกดเติม แก้ตรงนี้ได้เลย
        </p>

        <img
          src={photo}
          alt="เอกสารที่ถ่าย"
          style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 9, border: "1px solid var(--line)", background: "var(--code-bg)", marginBottom: 12 }}
        />

        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r, i) => {
            const low = r.confidence < LOW_CONFIDENCE;
            return (
              <div key={r.field_id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 10, background: r.take ? "var(--accent-soft)" : "var(--surface)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }}>
                  <input type="checkbox" checked={r.take} onChange={(e) => patch(i, { take: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                  <b style={{ fontSize: ".9rem", flex: 1 }}>{r.label}</b>
                  {low && (
                    <span style={{ fontSize: ".7rem", fontWeight: 700, color: "var(--amber, #f59e0b)", whiteSpace: "nowrap" }}>
                      ไม่มั่นใจ {Math.round(r.confidence * 100)}%
                    </span>
                  )}
                </label>
                <input
                  value={r.value}
                  onChange={(e) => patch(i, { value: e.target.value, take: true })}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".95rem" }}
                />
                {r.occupied && (
                  <div style={{ fontSize: ".74rem", color: "var(--amber, #f59e0b)", marginTop: 5 }}>
                    ช่องนี้กรอกไว้แล้ว — ติ๊กเพื่อเขียนทับ
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Button onClick={onCancel} style={{ flex: 1 }}>ยกเลิก</Button>
          <Button variant="primary" onClick={onConfirm} disabled={takeCount === 0} style={{ flex: 2 }}>
            <Icon icon={Check} className="h-4 w-4" /> เติม {takeCount} ช่อง
          </Button>
        </div>
      </div>
    </div>
  );
}
