"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { FIELD_TYPE_LABELS, type FormField, type FormSchema } from "@/lib/form-schema";

type Answer = { value?: string | string[]; note?: string; ai?: string };
type Props = {
  formId: string;
  title: string;
  icon: string;
  version: number;
  schema: FormSchema;
  tenantId: string;
  userId: string;
  userName: string;
};

// ---- client image shrink to jpeg data-url ----
function shrinkImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const r = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => rej(new Error("อ่านรูปไม่ได้"));
    img.src = URL.createObjectURL(file);
  });
}
async function detectBarcode(file: File): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new () => { detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const bmp = await createImageBitmap(file);
    const codes = await new BD().detect(bmp);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function FillWizard(props: Props) {
  const { schema } = props;
  const router = useRouter();
  const supabase = createClient();
  const [idx, setIdx] = useState(0);
  const answers = useRef<Record<string, Answer>>({});
  const photos = useRef<Record<string, string>>({}); // fieldId -> dataUrl
  const sigs = useRef<Record<string, string>>({});
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const startedAt = useRef(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ result: "pass" | "fail"; fails: string[]; dur: number } | null>(null);

  const step = schema.steps[idx];
  const ans = (id: string) => (answers.current[id] ||= {});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const f of step.fields) {
      if (!f.required) continue;
      const a = answers.current[f.id] || {};
      let miss = false;
      if (f.type === "photo") miss = !photos.current[f.id];
      else if (f.type === "signature") miss = !sigs.current[f.id];
      else if (f.type === "checkbox") miss = !(Array.isArray(a.value) && a.value.length);
      else miss = a.value == null || a.value === "";
      if (miss) {
        errs[f.id] = "จำเป็นต้องกรอกข้อนี้";
        continue;
      }
      if (f.type === "pass_fail" && a.value === "fail" && f.on_fail_require_note && !a.note?.trim())
        errs[f.id] = "ไม่ผ่าน — ต้องระบุปัญหาที่พบ";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function next() {
    if (!validate()) return;
    if (idx < schema.steps.length - 1) {
      setIdx(idx + 1);
      window.scrollTo(0, 0);
    } else {
      await submit();
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const subId = crypto.randomUUID();
      const list: Record<string, unknown>[] = [];
      const fails: string[] = [];
      const photoUploads: { fieldId: string; dataUrl: string; ai?: string }[] = [];

      for (const s of schema.steps)
        for (const f of s.fields) {
          const a = answers.current[f.id] || {};
          const item: Record<string, unknown> = { label: f.label, type: f.type };
          if (f.type === "photo") {
            if (photos.current[f.id]) {
              photoUploads.push({ fieldId: f.id, dataUrl: photos.current[f.id], ai: a.ai });
              item.photoField = f.id;
            }
            if (a.ai) item.display = a.ai;
          } else if (f.type === "signature") {
            if (sigs.current[f.id]) {
              photoUploads.push({ fieldId: f.id, dataUrl: sigs.current[f.id] });
              item.photoField = f.id;
              item.display = "เซ็นแล้ว";
            }
          } else if (f.type === "pass_fail") {
            item.display = a.value === "pass" ? "ผ่าน" : a.value === "fail" ? "ไม่ผ่าน" : "—";
            if (a.value === "fail") {
              item.fail = true;
              item.note = a.note || "";
              fails.push(f.label);
            }
          } else if (f.type === "checkbox") {
            const vals = Array.isArray(a.value) ? a.value : [];
            item.display = vals.join(", ") || "—";
            if (f.options && vals.length < f.options.length)
              item.note = "ไม่ได้เลือก: " + f.options.filter((o) => !vals.includes(o)).join(", ");
          } else if (f.type === "number") {
            item.display = (a.value ?? "—") + (f.unit ? " " + f.unit : "");
            const v = parseFloat(String(a.value));
            if (Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) {
              item.fail = true;
              fails.push(f.label + " (ค่านอกช่วง)");
            }
          } else item.display = String(a.value ?? "—");
          list.push(item);
        }

      const result = fails.length ? "fail" : "pass";
      const dur = Math.round((Date.now() - startedAt.current) / 1000);

      const { error: subErr } = await supabase.from("submissions").insert({
        id: subId,
        tenant_id: props.tenantId,
        form_id: props.formId,
        form_title: props.title,
        form_icon: props.icon,
        form_version: props.version,
        submitted_by: props.userId,
        user_name: props.userName,
        result,
        fails,
        answers: list,
        duration_s: dur,
      });
      if (subErr) throw subErr;

      // upload photos to storage + metadata rows
      for (const p of photoUploads) {
        const path = `${props.tenantId}/${subId}/${p.fieldId}.jpg`;
        const blob = dataUrlToBlob(p.dataUrl);
        const { error: upErr } = await supabase.storage
          .from("submissions")
          .upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (!upErr) {
          await supabase.from("submission_photos").insert({
            tenant_id: props.tenantId,
            submission_id: subId,
            field_id: p.fieldId,
            storage_path: path,
            ai_check: p.ai ?? null,
          });
        }
      }
      // audit (best-effort)
      supabase
        .from("audit_log")
        .insert({
          tenant_id: props.tenantId,
          actor_id: props.userId,
          action: "submission.create",
          target_type: "submission",
          target_id: subId,
          meta: { form_id: props.formId, result, fails: fails.length },
        })
        .then(() => {});

      setDone({ result, fails, dur });
      window.scrollTo(0, 0);
    } catch (e) {
      setErrors({ [step.fields[0].id]: "ส่งไม่สำเร็จ: " + (e instanceof Error ? e.message : "ผิดพลาด") });
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "40px 20px", textAlign: "center", boxShadow: "var(--shadow)" }}>
        <div style={{ fontSize: "3rem" }}>{done.result === "pass" ? "✅" : "⚠️"}</div>
        <h2 style={{ margin: "10px 0 4px" }}>
          {done.result === "pass" ? "ส่งข้อมูลเรียบร้อย" : `ส่งแล้ว — พบปัญหา ${done.fails.length} รายการ`}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem" }}>
          {props.title} · ใช้เวลา {done.dur} วินาที · ขึ้น dashboard แล้ว
        </p>
        {done.fails.length > 0 && (
          <div style={{ borderLeft: "3px solid var(--fail)", background: "var(--fail-soft)", borderRadius: "0 8px 8px 0", padding: "10px 14px", textAlign: "left", color: "var(--ink-2)", fontSize: ".9rem", margin: "14px 0" }}>
            {done.fails.map((f, i) => (
              <div key={i}>• {f}</div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => router.push("/forms")}>กลับหน้ารายการ</Button>
          <Button onClick={() => router.push("/dashboard")}>ดู Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 20, boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2 style={{ fontSize: "1.05rem" }}>{props.icon} {props.title}</h2>
        <Button variant="ghost" onClick={() => router.push("/forms")} style={{ fontSize: ".8rem" }}>ออก</Button>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "10px 0 16px" }}>
        {schema.steps.map((s, i) => (
          <span key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: i < idx ? "var(--pass)" : i === idx ? "var(--accent)" : "var(--line)" }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
        <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
          STEP {idx + 1}/{schema.steps.length}
        </span>
        <h3 style={{ fontSize: "1.05rem" }}>{step.title}</h3>
      </div>

      {step.fields.map((f) => (
        <FieldControl
          key={f.id}
          field={f}
          answer={ans(f.id)}
          photo={photos.current[f.id]}
          hasSig={!!sigs.current[f.id]}
          error={errors[f.id]}
          canAiPhoto
          onChange={rerender}
          setPhoto={(d) => { if (d) photos.current[f.id] = d; else delete photos.current[f.id]; delete ans(f.id).ai; rerender(); }}
          setSig={(d) => { if (d) sigs.current[f.id] = d; else delete sigs.current[f.id]; rerender(); }}
        />
      ))}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {idx > 0 && <Button onClick={() => { setIdx(idx - 1); window.scrollTo(0, 0); }}>← ก่อนหน้า</Button>}
        <Button variant="primary" onClick={next} disabled={submitting} style={{ flex: 1, padding: 14, fontSize: "1.02rem" }}>
          {submitting ? "กำลังส่ง..." : idx === schema.steps.length - 1 ? "✅ ส่งข้อมูล" : "ถัดไป →"}
        </Button>
      </div>
      <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
        🔒 ล็อคลำดับขั้นตอน — ต้องกรอก step นี้ครบก่อนไปต่อ
      </div>
    </div>
  );
}

// ============ single field control ============
function FieldControl({
  field: f,
  answer,
  photo,
  hasSig,
  error,
  canAiPhoto,
  onChange,
  setPhoto,
  setSig,
}: {
  field: FormField;
  answer: Answer;
  photo?: string;
  hasSig: boolean;
  error?: string;
  canAiPhoto: boolean;
  onChange: () => void;
  setPhoto: (d: string | null) => void;
  setSig: (d: string | null) => void;
}) {
  const [aiBusy, setAiBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await shrinkImage(file));
    } catch {
      /* ignore */
    }
    e.target.value = "";
  }
  async function aiCheck() {
    if (!photo) return;
    setAiBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", dataUrlToBlob(photo), "photo.jpg");
      fd.append("hint", f.photo_hint || "");
      fd.append("label", f.label);
      const res = await fetch("/api/ai/check-photo", { method: "POST", body: fd });
      const j = await res.json();
      answer.ai = res.ok ? (j.ok ? "✅ " : "⚠️ ") + (j.reason || "") : j.error || "ตรวจไม่ได้";
    } catch {
      answer.ai = "ตรวจรูปไม่ได้";
    } finally {
      setAiBusy(false);
      onChange();
    }
  }
  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanMsg("กำลังอ่านโค้ด...");
    const code = await detectBarcode(file);
    if (code) {
      answer.value = code;
      setScanMsg("✅ อ่านได้: " + code);
    } else setScanMsg("อ่านโค้ดจากรูปไม่ได้ — พิมพ์รหัสแทนได้เลย");
    onChange();
    e.target.value = "";
  }

  const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 14, margin: "10px 0", background: "var(--surface)" };
  const input: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem" };

  return (
    <div style={{ ...box, borderColor: error ? "var(--fail)" : "var(--line)" }}>
      <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
        {f.label}
        {f.required && <span style={{ color: "var(--fail)", fontWeight: 700 }}>*</span>}
        <span style={{ fontFamily: "monospace", fontSize: ".65rem", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>
          {FIELD_TYPE_LABELS[f.type]}
        </span>
      </div>
      {f.tooltip && (
        <div style={{ fontSize: ".83rem", color: "var(--ink-2)", background: "var(--code-bg)", borderRadius: 7, padding: "7px 11px", margin: "8px 0", display: "flex", gap: 7 }}>
          <span aria-hidden>💡</span>
          <span>{f.tooltip}</span>
        </div>
      )}
      {f.photo_hint && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "4px 0" }}>
          รูปต้องเห็น: <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.photo_hint}</code>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {f.type === "text" && (
          <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} rows={2} defaultValue={String(answer.value ?? "")} placeholder={f.example ? "เช่น " + f.example : "พิมพ์คำตอบ..."} onChange={(e) => { answer.value = e.target.value; }} />
        )}
        {f.type === "number" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" inputMode="decimal" style={{ ...input, flex: 1 }} defaultValue={String(answer.value ?? "")} placeholder={f.example || "0"} onChange={(e) => { answer.value = e.target.value; onChange(); }} />
              {f.unit && <span style={{ color: "var(--ink-2)" }}>{f.unit}</span>}
            </div>
            {(f.min != null || f.max != null) && <NumHint field={f} value={answer.value} />}
          </>
        )}
        {f.type === "datetime" && (
          <input type="datetime-local" style={input} defaultValue={String(answer.value ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))} onChange={(e) => { answer.value = e.target.value; }} />
        )}
        {f.type === "select" &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px" }}>
              <input type="radio" name={"r_" + f.id} value={o} defaultChecked={answer.value === o} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} onChange={() => { answer.value = o; }} />
              {o}
            </label>
          ))}
        {f.type === "checkbox" &&
          (f.options || []).map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px" }}>
              <input
                type="checkbox"
                value={o}
                defaultChecked={Array.isArray(answer.value) && answer.value.includes(o)}
                style={{ width: 20, height: 20, accentColor: "var(--accent)" }}
                onChange={(e) => {
                  const cur = Array.isArray(answer.value) ? [...answer.value] : [];
                  answer.value = e.target.checked ? [...cur, o] : cur.filter((x) => x !== o);
                }}
              />
              {o}
            </label>
          ))}
        {f.type === "pass_fail" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PfBtn active={answer.value === "pass"} kind="pass" onClick={() => { answer.value = "pass"; onChange(); }}>✓ ผ่าน</PfBtn>
              <PfBtn active={answer.value === "fail"} kind="fail" onClick={() => { answer.value = "fail"; onChange(); }}>✗ ไม่ผ่าน</PfBtn>
            </div>
            {answer.value === "fail" && (
              <textarea style={{ ...input, minHeight: 56, marginTop: 10, resize: "vertical" }} rows={2} defaultValue={answer.note || ""} placeholder="พบปัญหาอะไร? (จำเป็นเมื่อไม่ผ่าน)" onChange={(e) => { answer.note = e.target.value; }} />
            )}
          </>
        )}
        {f.type === "photo" && (
          <>
            <div onClick={() => photoRef.current?.click()} style={{ border: "2px dashed var(--line)", borderRadius: 10, padding: 18, textAlign: "center", color: "var(--ink-3)", fontSize: ".9rem", cursor: "pointer" }}>
              {photo && <img src={photo} alt="รูปที่ถ่าย" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", margin: "0 auto 8px" }} />}
              <div>{photo ? "แตะเพื่อถ่ายใหม่" : "📷 แตะเพื่อถ่ายรูป / เลือกรูป"}</div>
            </div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
            {photo && canAiPhoto && (
              <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button onClick={aiCheck} disabled={aiBusy}>{aiBusy ? "AI กำลังดูรูป..." : "🔍 ให้ AI ตรวจรูป"}</Button>
                {answer.ai && <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{answer.ai}</span>}
              </div>
            )}
          </>
        )}
        {f.type === "barcode" && (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <input type="text" style={{ ...input, flex: 1 }} defaultValue={String(answer.value ?? "")} placeholder="รหัส เช่น FL-03" onChange={(e) => { answer.value = e.target.value; }} key={String(answer.value ?? "")} />
              <Button onClick={() => scanRef.current?.click()}>📷 สแกน</Button>
            </div>
            <input ref={scanRef} type="file" accept="image/*" capture="environment" hidden onChange={onScan} />
            {scanMsg && <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>{scanMsg}</div>}
          </>
        )}
        {f.type === "signature" && <SignaturePad hasSig={hasSig} onSave={setSig} />}
      </div>

      {error && <div style={{ fontSize: ".82rem", color: "var(--fail)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function NumHint({ field: f, value }: { field: FormField; value?: string | string[] }) {
  const v = parseFloat(String(value));
  const out = Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max));
  return (
    <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
      ช่วงที่ยอมรับ: <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.min ?? "–"} ถึง {f.max ?? "–"} {f.unit || ""}</code>
      {out && <span style={{ color: "var(--fail)", fontWeight: 700 }}> ← ค่านอกช่วง! จะถูกแจ้งเป็นปัญหา</span>}
    </div>
  );
}

function PfBtn({ active, kind, onClick, children }: { active: boolean; kind: "pass" | "fail"; onClick: () => void; children: React.ReactNode }) {
  const on = kind === "pass"
    ? { background: "var(--pass-soft)", borderColor: "var(--pass)", color: "var(--pass)" }
    : { background: "var(--fail-soft)", borderColor: "var(--fail)", color: "var(--fail)" };
  return (
    <button onClick={onClick} style={{ padding: 14, fontWeight: 700, fontSize: "1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", ...(active ? on : {}) }}>
      {children}
    </button>
  );
}

function SignaturePad({ hasSig, onSave }: { hasSig: boolean; onSave: (d: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number]>([0, 0]);

  const setup = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = cv.offsetWidth * 2;
    cv.height = 280;
    const ctx = cv.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = getComputedStyle(document.body).color;
  }, []);
  useEffect(() => { setup(); }, [setup]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  return (
    <>
      <canvas
        ref={ref}
        style={{ width: "100%", height: 140, border: "1px dashed var(--line)", borderRadius: 10, background: "var(--surface)", touchAction: "none", display: "block" }}
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
          onSave(ref.current!.toDataURL("image/png"));
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div style={{ marginTop: 6 }}>
        <Button onClick={() => { const ctx = ref.current!.getContext("2d")!; ctx.clearRect(0, 0, ref.current!.width, ref.current!.height); onSave(null); }}>ล้างลายเซ็น</Button>
        {hasSig && <span style={{ marginLeft: 10, color: "var(--pass)", fontSize: ".82rem" }}>✓ เซ็นแล้ว</span>}
      </div>
    </>
  );
}
