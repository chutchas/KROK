"use client";
import Icon from "@/components/Icon";
import { X, Camera } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

/** มุมมองมือถือ: ช่องรูปทีละช่อง (ชื่อใต้รูปตามที่ตั้ง) · แตะช่องว่าง = ถ่าย · แตะรูป = ถ่ายใหม่ · × = ลบ */
export function PhotoSlots({ urls, captions, paper, min, hideMin = false, onPick, onPickMany, onRemove }: {
  urls: (string | undefined)[]; captions: string[]; paper: boolean; min: number; hideMin?: boolean;
  onPick: (slot: number) => void; onPickMany: () => void; onRemove: (slot: number) => void;
}) {
  const { t, tt } = useT();
  const filled = urls.filter(Boolean).length;
  const line = paper ? "#b9bec4" : "var(--line)";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${urls.length >= 3 ? 3 : urls.length}, minmax(0, 1fr))`, gap: 8 }}>
        {urls.map((u, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{ position: "relative", aspectRatio: "4 / 3" }}>
              <button type="button" data-print-keep={u ? "" : undefined} onClick={() => onPick(i)} aria-label={u ? `${t("fw.paper.retake")} ${captions[i]}` : `${t("fw.takePhoto")} ${captions[i]}`}
                style={{ position: "absolute", inset: 0, padding: 0, border: u ? `1px solid ${line}` : `2px dashed ${line}`, borderRadius: 10, overflow: "hidden", background: u ? "#000" : "transparent", color: paper ? "#777" : "var(--ink-3)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit", fontSize: ".78rem" }}>
                {u ? <img src={u} alt={captions[i]} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <><Icon icon={Camera} className="h-5 w-5" /> {t("fw.photo.take")}</>}
              </button>
              {u && (
                <button type="button" onClick={() => onRemove(i)} aria-label={t("ctype.photoRemove")} title={t("ctype.photoRemove")}
                  style={{ position: "absolute", top: -7, right: -7, width: 24, height: 24, borderRadius: 999, border: "2px solid #fff", background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                  <Icon icon={X} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div title={captions[i]} style={{ fontSize: ".76rem", color: paper ? "#444" : "var(--ink-2)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: u ? 400 : 600 }}>{captions[i]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
        {filled < urls.length && (
          <button type="button" onClick={onPickMany} style={{ background: "none", border: "none", padding: 0, color: "var(--accent-text)", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer" }}>
            {t("fw.photo.pickMany")}
          </button>
        )}
        <span style={{ fontSize: ".78rem", color: paper ? "#777" : "var(--ink-3)", marginLeft: "auto" }}>
          {tt("fw.photo.count", { n: filled, max: urls.length })}{min > 1 && filled < min && !hideMin ? ` · ${tt("fw.photo.min", { n: min })}` : ""}
        </span>
      </div>
    </div>
  );
}

/** ฟิลด์หลายรูป: รูปย่อทุกช่องที่มีรูป (แตะ = เปลี่ยน, × = ลบ) + ปุ่มเพิ่มรูปจนครบจำนวนสูงสุด */
export function MultiPhotoStrip({ urls, paper, compact, min, hideMin = false, onAdd, onRetake, onRemove }: {
  urls: (string | undefined)[]; paper: boolean; compact: boolean; min: number; hideMin?: boolean;
  onAdd: () => void; onRetake: (slot: number) => void; onRemove: (slot: number) => void;
}) {
  const { t, tt } = useT();
  const filled = urls.map((u, i) => ({ u, i })).filter((x): x is { u: string; i: number } => !!x.u);
  const size = compact ? 26 : paper ? 64 : 88;
  const line = paper || compact ? "#b9bec4" : "var(--line)";
  return (
    <div>
      <div style={{ display: "flex", gap: compact ? 4 : 8, flexWrap: "wrap", alignItems: "center" }}>
        {filled.map(({ u, i }) => (
          <span key={i} style={{ position: "relative", display: "inline-flex" }}>
            <button type="button" data-print-keep="" onClick={() => onRetake(i)} title={t("fw.paper.retake")} aria-label={t("fw.paper.retake")}
              style={{ padding: 0, border: `1px solid ${line}`, borderRadius: compact ? 3 : 8, background: "none", cursor: "pointer", display: "flex", overflow: "hidden" }}>
              <img src={u} alt={`${i + 1}`} style={{ height: size, width: Math.round(size * 1.33), objectFit: "cover", display: "block" }} />
            </button>
            <button type="button" onClick={() => onRemove(i)} aria-label={t("ctype.photoRemove")} title={t("ctype.photoRemove")}
              style={{ position: "absolute", top: -6, right: -6, width: compact ? 16 : 22, height: compact ? 16 : 22, borderRadius: 999, border: "1px solid #fff", background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <Icon icon={X} className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
            </button>
          </span>
        ))}
        {filled.length < urls.length && (
          <button type="button" onClick={onAdd}
            style={{ height: compact ? 26 : size, minWidth: compact ? 0 : Math.round(size * 1.33), padding: compact ? "0 8px" : "0 12px", border: `${compact ? 1 : 2}px dashed ${line}`, borderRadius: compact ? 4 : 10, background: paper || compact ? "#fff" : "transparent", color: paper || compact ? "#777" : "var(--ink-3)", fontFamily: "inherit", fontSize: compact ? ".7rem" : ".82rem", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <Icon icon={Camera} className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> {tt("fw.photo.add", { n: filled.length, max: urls.length })}
          </button>
        )}
      </div>
      {min > 1 && filled.length < min && !hideMin && (
        <div style={{ fontSize: compact ? ".64rem" : ".76rem", color: paper || compact ? "#777" : "var(--ink-3)", marginTop: 3 }}>{tt("fw.photo.min", { n: min })}</div>
      )}
    </div>
  );
}

