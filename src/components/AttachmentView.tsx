"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Paperclip, X, ExternalLink, Download, FileText, Image as ImageIcon, Film, Link2 } from "lucide-react";
import {
  attachmentHref,
  fmtSize,
  isImage,
  isPdf,
  isVideo,
  type Attachment,
} from "@/lib/attachments";

function iconFor(a: Attachment) {
  if (a.kind === "link") return Link2;
  if (isImage(a.mime)) return ImageIcon;
  if (isVideo(a.mime)) return Film;
  return FileText;
}

/**
 * แถบ "เอกสารที่เกี่ยวข้อง" ที่คนหน้างานกดเปิดดูระหว่างกรอกฟอร์ม
 * - ระดับฟอร์ม (variant="form") — แสดงบนหัวฟอร์ม เห็นได้ทุกขั้นตอน
 * - ระดับฟิลด์ (variant="field") — แสดงใต้ชื่อฟิลด์นั้น
 */
export default function AttachmentChips({
  items,
  variant = "field",
  paper = false,
}: {
  items: Attachment[];
  variant?: "form" | "field";
  paper?: boolean;
}) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!items.length) return null;

  const chip = (a: Attachment) => {
    const Ico = iconFor(a);
    const inner = (
      <>
        <Icon icon={Ico} className="h-3.5 w-3.5" />
        <span style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
        {a.size > 0 && <span style={{ color: "var(--ink-3)", fontSize: ".72rem" }}>{fmtSize(a.size)}</span>}
      </>
    );
    const style: React.CSSProperties = {
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
      border: `1px solid ${paper ? "#c9ced4" : "var(--line)"}`,
      background: paper ? "#f4f5f6" : "var(--surface)",
      color: paper ? "#333" : "var(--ink-2)",
      fontSize: ".8rem", fontFamily: "inherit", cursor: "pointer", textDecoration: "none", maxWidth: "100%",
    };
    // ลิงก์ภายนอก → เปิดแท็บใหม่ (ฝัง iframe ไม่ได้เสมอไป)
    if (a.kind === "link")
      return (
        <a key={a.id} href={a.url || "#"} target="_blank" rel="noopener noreferrer" style={style}>
          {inner}
          <Icon icon={ExternalLink} className="h-3 w-3" />
        </a>
      );
    return (
      <button key={a.id} type="button" onClick={() => setOpen(a)} style={style}>
        {inner}
      </button>
    );
  };

  return (
    <div
      style={
        variant === "form"
          ? { display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", padding: "9px 11px", borderRadius: 9, border: `1px dashed ${paper ? "#c9ced4" : "var(--line)"}`, background: paper ? "#fafafa" : "var(--code-bg)", margin: "10px 0" }
          : { display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 2px" }
      }
    >
      {variant === "form" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".8rem", color: paper ? "#555" : "var(--ink-2)", fontWeight: 600, marginRight: 2 }}>
          <Icon icon={Paperclip} className="h-3.5 w-3.5" /> เอกสารที่เกี่ยวข้อง
        </span>
      )}
      {items.map(chip)}
      {open && <AttachmentModal item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AttachmentModal({ item, onClose }: { item: Attachment; onClose: () => void }) {
  const href = attachmentHref(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7,
    border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)",
    cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", textDecoration: "none",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(8,15,30,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(1000px, 100%)", height: "min(88vh, 100%)", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <Icon icon={iconFor(item)} className="h-4 w-4" />
          <b style={{ flex: 1, fontSize: ".92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-anuphan)" }}>{item.name}</b>
          <a href={href} target="_blank" rel="noopener noreferrer" style={btn}><Icon icon={ExternalLink} className="h-3.5 w-3.5" /> แท็บใหม่</a>
          <a href={`${href}?download=1`} style={btn}><Icon icon={Download} className="h-3.5 w-3.5" /> ดาวน์โหลด</a>
          <button onClick={onClose} style={{ ...btn, padding: "6px 8px" }} aria-label="ปิด"><Icon icon={X} className="h-4 w-4" /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: "var(--code-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isImage(item.mime) ? (
            <img src={href} alt={item.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : isPdf(item.mime) ? (
            <iframe src={href} title={item.name} style={{ width: "100%", height: "100%", border: "none", background: "#fff" }} />
          ) : isVideo(item.mime) ? (
            <video src={href} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : (
            <div style={{ textAlign: "center", color: "var(--ink-2)", padding: 24 }}>
              <p style={{ marginBottom: 12 }}>ไฟล์ชนิดนี้เปิดดูในหน้านี้ไม่ได้</p>
              <a href={`${href}?download=1`} style={{ ...btn, borderColor: "var(--accent)", color: "var(--accent)" }}>
                <Icon icon={Download} className="h-4 w-4" /> ดาวน์โหลดเพื่อเปิด
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
