"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { UploadCloud, KeyRound, Copy, Ban } from "lucide-react";
import { MAX_DATASET_ROWS, type DatasetMeta } from "@/lib/datasets";
import { revokePushKey, rotatePushKey } from "../actions";
import { label } from "../ui";
import { confirmDialog } from "@/components/dialogs";

const codeBox: React.CSSProperties = {
  background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 10, padding: 12,
  fontSize: ".78rem", fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre", color: "var(--ink-2)", margin: 0,
};

const noopSubscribe = () => () => {};

export default function PushPanel({ ds }: { ds: DatasetMeta }) {
  const router = useRouter();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "https://<โดเมน KROK>");
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const endpoint = `${origin}/api/v1/datasets/${ds.id}/rows`;
  const keyShown = newKey || (ds.pushKeyPrefix ? `${ds.pushKeyPrefix}…` : "<API key>");

  async function rotate() {
    if (ds.pushKeyPrefix && !(await confirmDialog({ message: "สร้าง key ใหม่? key เดิมจะใช้ไม่ได้ทันที ระบบที่ส่งข้อมูลอยู่ต้องเปลี่ยน key ด้วย", confirmLabel: "สร้าง key ใหม่" }))) return;
    setBusy("rotate");
    setErr("");
    const res = await rotatePushKey(ds.id);
    setBusy("");
    if ("error" in res) setErr(res.error);
    else { setNewKey(res.key); router.refresh(); }
  }

  async function revoke() {
    if (!(await confirmDialog({ message: "ยกเลิก key? ระบบภายนอกจะส่งข้อมูลเข้ามาไม่ได้จนกว่าจะสร้าง key ใหม่", confirmLabel: "ยกเลิก key", danger: true }))) return;
    setBusy("revoke");
    const res = await revokePushKey(ds.id);
    setBusy("");
    if ("error" in res) setErr(res.error);
    else { setNewKey(""); router.refresh(); }
  }

  const sampleCols = ds.columns.slice(0, 3);
  const sampleRow = sampleCols.length
    ? "{ " + sampleCols.map((c) => `"${c.key}": ${c.type === "number" ? "1" : `"..."`}`).join(", ") + " }"
    : `{ "code": "C001", "name": "บริษัท ตัวอย่าง จำกัด" }`;

  const curl = `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${keyShown}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "${ds.keyColumn ? "upsert" : "replace"}",${ds.columns.length === 0 ? `\n    "key_column": "code",` : ""}
    "rows": [ ${sampleRow} ]
  }'`;

  return (
    <Card>
      <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon icon={UploadCloud} className="h-4 w-4" /> รับข้อมูลจากระบบอื่น (API push)
      </b>
      <p style={{ fontSize: ".82rem", color: "var(--ink-2)", margin: "4px 0 0" }}>
        ให้ระบบต้นทาง (ERP, WMS, script ตั้งเวลา) ส่งข้อมูลเข้ามา — ใช้ได้แม้ระบบต้นทางอยู่ในเครือข่ายภายในบริษัท
      </p>

      <label style={label}>API key</label>
      {newKey ? (
        <Notice kind="info">
          <div style={{ fontSize: ".82rem", marginBottom: 6 }}>คัดลอกเก็บไว้ตอนนี้ — จะไม่แสดงอีก</div>
          <code style={{ wordBreak: "break-all", fontSize: ".85rem" }}>{newKey}</code>
          <div>
            <button
              onClick={() => { void navigator.clipboard?.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem" }}
            >
              <Icon icon={Copy} className="h-3.5 w-3.5" /> {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        </Notice>
      ) : (
        <p style={{ fontSize: ".85rem", margin: 0, color: ds.pushKeyPrefix ? "var(--ink)" : "var(--ink-3)" }}>
          {ds.pushKeyPrefix ? <>ใช้งานอยู่: <code>{ds.pushKeyPrefix}…</code></> : "ยังไม่มี key"}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Button onClick={rotate} loading={busy === "rotate"}><Icon icon={KeyRound} className="h-4 w-4" /> {ds.pushKeyPrefix ? "สร้าง key ใหม่" : "สร้าง key"}</Button>
        {ds.pushKeyPrefix && <Button variant="danger" onClick={revoke} loading={busy === "revoke"}><Icon icon={Ban} className="h-4 w-4" /> ยกเลิก key</Button>}
      </div>
      {err && <Notice kind="error">{err}</Notice>}

      <label style={label}>ตัวอย่างการเรียก</label>
      <pre style={codeBox}>{curl}</pre>
      <ul style={{ fontSize: ".8rem", color: "var(--ink-2)", paddingLeft: 18, margin: "10px 0 0", lineHeight: 1.7 }}>
        <li><code>mode: &quot;upsert&quot;</code> เพิ่ม/แก้ตาม key (ต้องมีคอลัมน์ key) · <code>&quot;replace&quot;</code> แทนที่ทั้งชุด — ต้องส่งครบในคำขอเดียว ≤ {MAX_DATASET_ROWS.toLocaleString()} แถว</li>
        <li>ลบรายแถว: ส่ง <code>&quot;delete_keys&quot;: [&quot;C001&quot;]</code> คู่กับ mode upsert</li>
        <li>ชื่อ property ใช้ได้ทั้งชื่อภายในหรือชื่อที่แสดงของคอลัมน์ · ครั้งแรกที่ยังไม่มีคอลัมน์ ระบบจะสร้างคอลัมน์จากข้อมูลที่ส่งมา</li>
        <li>จำกัด 60 ครั้ง/นาที · body ไม่เกิน 10MB · <code>GET</code> URL เดียวกันเพื่อตรวจ key และดูคอลัมน์</li>
      </ul>
    </Card>
  );
}
