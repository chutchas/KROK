"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icon";
import { Field, Button } from "@/components/ui";
import { Paperclip, Upload, Trash2, Link2, Plus, ExternalLink, FileText, Image as ImageIcon, Film } from "lucide-react";
import {
  ATTACH_ACCEPT,
  MAX_ATTACH_BYTES,
  MAX_ATTACH_MB,
  MAX_ATTACH_PER_SLOT,
  attachmentHref,
  extOf,
  fmtSize,
  isAllowedMime,
  isImage,
  isVideo,
  type Attachment,
} from "@/lib/attachments";
import {
  addFileAttachment,
  addLinkAttachment,
  listAttachments,
  removeAttachment,
} from "@/app/(app)/studio/attachment-actions";

/**
 * แผงจัดการ "เอกสารที่เกี่ยวข้อง" ใน Studio
 * fieldId = null → เอกสารระดับฟอร์ม, fieldId = id → เอกสารของฟิลด์นั้น
 *
 * ต้องบันทึกฟอร์มก่อน (มี formId) จึงจะแนบได้ — ไฟล์ผูกกับ id ของฟอร์มใน storage
 */
export default function AttachmentsPanel({
  formId,
  tenantId,
  fieldId = null,
  compact = false,
}: {
  formId: string | null;
  tenantId: string;
  fieldId?: string | null;
  compact?: boolean;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const all = await listAttachments(formId);
      setItems(all.filter((a) => (fieldId ? a.fieldId === fieldId : !a.fieldId)));
    } finally {
      setLoading(false);
    }
  }, [formId, fieldId]);

  useEffect(() => { void reload(); }, [reload]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !formId) return;
    setErr("");

    if (file.size > MAX_ATTACH_BYTES) { setErr(`ไฟล์ใหญ่เกิน ${MAX_ATTACH_MB} MB`); return; }
    if (!isAllowedMime(file.type)) { setErr("รองรับเฉพาะ PDF, รูปภาพ, วิดีโอ MP4 และไฟล์ข้อความ"); return; }
    if (items.length >= MAX_ATTACH_PER_SLOT) { setErr(`แนบได้สูงสุด ${MAX_ATTACH_PER_SLOT} รายการต่อจุด`); return; }

    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const path = `${tenantId}/${formId}/${id}.${extOf(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) { setErr("อัปโหลดไม่สำเร็จ: " + upErr.message); return; }

      const res = await addFileAttachment(formId, fieldId, {
        name: file.name,
        storagePath: path,
        mime: file.type || "application/octet-stream",
        size: file.size,
      });
      if ("error" in res) {
        // บันทึก metadata ไม่ผ่าน → เก็บกวาดไฟล์ที่เพิ่งอัปทิ้ง ไม่ให้ค้างใน bucket
        try { await supabase.storage.from("attachments").remove([path]); } catch { /* ignore */ }
        setErr(res.error);
        return;
      }
      setItems((prev) => [...prev, res.attachment]);
    } finally {
      setBusy(false);
    }
  }

  async function onAddLink() {
    if (!formId) return;
    setErr("");
    setBusy(true);
    try {
      const res = await addLinkAttachment(formId, fieldId, { name: linkName, url: linkUrl });
      if ("error" in res) { setErr(res.error); return; }
      setItems((prev) => [...prev, res.attachment]);
      setLinkName(""); setLinkUrl(""); setLinkOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(a: Attachment) {
    if (!confirm(`ลบ “${a.name}” ออกจากฟอร์ม?`)) return;
    setBusy(true);
    try {
      const res = await removeAttachment(a.id);
      if ("error" in res) { setErr(res.error); return; }
      setItems((prev) => prev.filter((x) => x.id !== a.id));
    } finally {
      setBusy(false);
    }
  }

  const hint = fieldId
    ? "เอกสารของฟิลด์นี้ — คนหน้างานเห็นปุ่มเปิดดูใต้ชื่อฟิลด์ เช่น รูปตัวอย่างจุดที่ต้องถ่าย"
    : "เอกสารของทั้งฟอร์ม — คู่มือ / SOP / drawing เปิดดูได้ทุกขั้นตอนระหว่างกรอก";

  // ยังไม่ได้บันทึกฟอร์ม → แนบไม่ได้ (ไฟล์ต้องผูกกับ id ของฟอร์ม)
  if (!formId)
    return (
      <div style={wrap(compact)}>
        <Head compact={compact} fieldId={fieldId} />
        <p style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
          บันทึกฟอร์มก่อน แล้วเปิดกลับมาแนบเอกสารได้
        </p>
      </div>
    );

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7,
    border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)",
    cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem",
  };

  return (
    <div style={wrap(compact)}>
      <Head compact={compact} fieldId={fieldId} />
      <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "2px 0 8px" }}>{hint}</p>

      {loading && <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>กำลังโหลด…</div>}

      {items.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {items.map((a) => {
            const Ico = a.kind === "link" ? Link2 : isImage(a.mime) ? ImageIcon : isVideo(a.mime) ? Film : FileText;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", background: "var(--surface)" }}>
                <Icon icon={Ico} className="h-4 w-4" />
                <a
                  href={attachmentHref(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, minWidth: 0, fontSize: ".85rem", color: "var(--ink)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={a.name}
                >
                  {a.name}
                </a>
                {a.size > 0 && <span style={{ fontSize: ".72rem", color: "var(--ink-3)", flex: "0 0 auto" }}>{fmtSize(a.size)}</span>}
                <a href={attachmentHref(a)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-3)", display: "inline-flex", flex: "0 0 auto" }} title="เปิดดู">
                  <Icon icon={ExternalLink} className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => onRemove(a)} disabled={busy} style={{ ...iconBtn, padding: "4px 6px", color: "var(--fail)", flex: "0 0 auto" }} title="ลบ">
                  <Icon icon={Trash2} className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={onPick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...iconBtn, color: "var(--accent)", borderColor: "var(--accent)" }}>
          <Icon icon={Upload} className="h-3.5 w-3.5" /> {busy ? "กำลังอัปโหลด…" : "แนบไฟล์"}
        </button>
        <button onClick={() => setLinkOpen((v) => !v)} disabled={busy} style={iconBtn}>
          <Icon icon={Link2} className="h-3.5 w-3.5" /> แนบลิงก์
        </button>
      </div>

      {linkOpen && (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <Field value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="ชื่อที่จะให้แสดง เช่น คู่มือเครื่องอัดฟิล์ม" />
          <Field value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
          <div>
            <Button variant="primary" onClick={onAddLink} disabled={busy || !linkUrl.trim()} style={{ fontSize: ".82rem" }}>
              <Icon icon={Plus} className="h-3.5 w-3.5" /> เพิ่มลิงก์
            </Button>
          </div>
        </div>
      )}

      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "8px 0 0" }}>
        PDF / รูปภาพ / MP4 · ไม่เกิน {MAX_ATTACH_MB} MB ต่อไฟล์ · สูงสุด {MAX_ATTACH_PER_SLOT} รายการ
      </p>

      {err && <p style={{ fontSize: ".8rem", color: "var(--fail)", margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}

function Head({ compact, fieldId }: { compact: boolean; fieldId: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: compact ? ".85rem" : ".95rem", fontFamily: "var(--font-anuphan)" }}>
      <Icon icon={Paperclip} className="h-4 w-4" />
      {fieldId ? "เอกสารของฟิลด์นี้" : "เอกสารที่เกี่ยวข้อง"}
    </div>
  );
}

function wrap(compact: boolean): React.CSSProperties {
  return compact
    ? { marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" }
    : { border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 14 };
}
