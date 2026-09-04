"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, TextArea, Field, Notice, Spinner } from "@/components/ui";
import FormPreview from "@/components/FormPreview";
import { countFields, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { SAMPLE_FORM, CHIP_PROMPTS } from "@/lib/sample-form";
import { saveForm, deleteForm } from "./actions";
import type { FormRow } from "./page";

export default function StudioClient({ initialForms }: { initialForms: FormRow[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ t: string; err?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function callGenerate(payload: Record<string, unknown>, busyMsg: string) {
    setBusy(busyMsg);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI ผิดพลาด");
      setDraft(sanitizeSchema(json.schema));
    } catch (e) {
      setStatus({ t: e instanceof Error ? e.message : "AI ผิดพลาด", err: true });
    } finally {
      setBusy(null);
    }
  }

  function generate() {
    if (!prompt.trim()) {
      setStatus({ t: "พิมพ์อธิบายฟอร์มที่ต้องการก่อน", err: true });
      return;
    }
    callGenerate({ prompt }, "กำลังออกแบบฟอร์ม");
  }

  function refineDraft() {
    if (!refine.trim() || !draft) return;
    callGenerate({ schema: draft, instruction: refine }, "กำลังแก้ไขฟอร์ม");
    setRefine("");
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("กำลังอ่านฟอร์มเดิมและแปลงเป็นดิจิทัล");
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/from-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "อ่านฟอร์มไม่สำเร็จ");
      setDraft(sanitizeSchema(json.schema));
    } catch (err) {
      setStatus({ t: err instanceof Error ? err.message : "อ่านฟอร์มไม่สำเร็จ", err: true });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publish() {
    if (!draft) return;
    setBusy("กำลังเผยแพร่");
    const res = await saveForm(draft);
    setBusy(null);
    if ("error" in res) {
      setStatus({ t: res.error, err: true });
      return;
    }
    setDraft(null);
    setPrompt("");
    router.push("/forms");
    router.refresh();
  }

  async function onDelete(id: string, title: string) {
    if (!confirm(`ลบฟอร์ม "${title}"? (ข้อมูลที่เคยกรอกยังอยู่ใน dashboard)`)) return;
    const res = await deleteForm(id);
    if ("error" in res) alert(res.error);
    else router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>สร้างฟอร์มใหม่ด้วย AI</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>
          พิมพ์บอกว่าอยากได้ฟอร์มตรวจอะไร — AI จะร่างขั้นตอน ฟิลด์ tooltip และตัวอย่างให้ครบ แล้วคุณปรับแก้ก่อนเผยแพร่
        </p>
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="เช่น ใบตรวจสภาพ forklift ก่อนใช้งานประจำวัน ต้องสแกน QR ประจำรถ ตรวจงา ยาง เบรก ไฟเตือน และถ่ายรูปยางหน้า"
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
          {CHIP_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => setPrompt(p)}
              style={{ fontSize: ".8rem", padding: "5px 12px", borderRadius: 20, background: "var(--code-bg)", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={generate} disabled={!!busy}>
            ✨ สร้างด้วย AI
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
            📄 อัพโหลดฟอร์มเดิม (รูป/สแกน)
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
          <Button onClick={() => { setDraft(JSON.parse(JSON.stringify(SAMPLE_FORM))); setStatus(null); }} disabled={!!busy}>
            ใช้ฟอร์มตัวอย่าง
          </Button>
        </div>
        {busy && (
          <Notice>
            <Spinner /> {busy} — AI ใช้เวลาราว 15–60 วินาที
          </Notice>
        )}
        {status && <Notice kind={status.err ? "error" : "info"}>{status.t}</Notice>}
      </Card>

      {draft && (
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>
            {draft.icon} {draft.title}
          </h2>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 2 }}>
            {draft.description} · {draft.steps.length} ขั้นตอน · {countFields(draft)} ฟิลด์
          </p>
          <FormPreview schema={draft} />

          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 14 }}>
            <b style={{ fontFamily: "var(--font-anuphan)" }}>ปรับแก้ด้วย AI</b>
            <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: "2px 0 8px" }}>
              บอกสิ่งที่อยากเปลี่ยน เช่น “เพิ่มช่องวัดแรงดันลมยาง หน่วย psi ช่วง 90–110” หรือ “แยกขั้นตรวจเบรกเป็น step ใหม่”
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="อยากแก้อะไร..." style={{ flex: 1, minWidth: 200 }} />
              <Button onClick={refineDraft} disabled={!!busy}>แก้ไข</Button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={publish} disabled={!!busy}>✅ เผยแพร่ฟอร์มนี้</Button>
            <Button onClick={() => setDraft(null)} disabled={!!busy}>ทิ้งร่างนี้</Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>ฟอร์มที่เผยแพร่แล้ว</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>
          คนหน้างานเห็นฟอร์มเหล่านี้ในแท็บ “กรอกฟอร์ม”
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {initialForms.length === 0 && <span style={{ color: "var(--ink-3)" }}>ยังไม่มีฟอร์ม — สร้างด้านบนได้เลย</span>}
          {initialForms.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--surface)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>{f.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                  {f.schema.steps.length} ขั้นตอน · {countFields(f.schema)} ฟิลด์
                </small>
              </div>
              <Button onClick={() => router.push(`/fill/${f.id}`)}>เปิดกรอก</Button>
              <Button variant="danger" onClick={() => onDelete(f.id, f.title)}>ลบ</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
