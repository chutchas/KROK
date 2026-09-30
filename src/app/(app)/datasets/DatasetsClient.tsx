"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Field, EmptyState, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Database, Plus, ChevronRight } from "lucide-react";
import { SOURCE_LABEL, type DatasetMeta, type DatasetSourceKind } from "@/lib/datasets";
import { createDataset } from "./actions";
import { SOURCE_ICON, SyncBadge, label } from "./ui";

const KIND_HELP: Record<DatasetSourceKind, string> = {
  file: "อัปโหลด CSV หรือ Excel (.xlsx) — แถวแรกเป็นหัวคอลัมน์ อัปโหลดใหม่เมื่อข้อมูลเปลี่ยน",
  api_pull: "KROK ไปดึงจาก URL ของระบบอื่น (JSON) — กด sync เองหรือตั้งเวลาอัตโนมัติ",
  api_push: "ระบบอื่นส่งข้อมูลเข้ามาที่ KROK ด้วย API key — เหมาะกับระบบในเครือข่ายภายในบริษัท",
};

export default function DatasetsClient({ items, canEdit, missingTable }: { items: DatasetMeta[]; canEdit: boolean; missingTable: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DatasetSourceKind>("file");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true);
    setErr("");
    const res = await createDataset({ name, sourceKind: kind });
    setBusy(false);
    if ("error" in res) setErr(res.error);
    else router.push(`/datasets/${res.id}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>ข้อมูลอ้างอิง</h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
            ตารางข้อมูลขององค์กร เช่น ลูกค้า สาขา รหัสสินค้า ทะเบียนรถ — ใช้เป็นตัวเลือกของ dropdown ในฟอร์ม
          </p>
        </div>
        {canEdit && !creating && (
          <Button variant="primary" onClick={() => setCreating(true)} disabled={missingTable}>
            <Icon icon={Plus} className="h-4 w-4" /> สร้างชุดข้อมูล
          </Button>
        )}
      </div>

      {missingTable && (
        <Notice kind="error">ฐานข้อมูลยังไม่มีตารางข้อมูลอ้างอิง — ต้องรัน migration <code>0030_datasets.sql</code> ก่อน</Notice>
      )}

      {creating && (
        <Card>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>สร้างชุดข้อมูลใหม่</b>
          <label style={label}>ชื่อ</label>
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น รายชื่อลูกค้า" maxLength={120} autoFocus />
          <label style={label}>ข้อมูลมาจาก</label>
          <div style={{ display: "grid", gap: 8 }}>
            {(Object.keys(SOURCE_LABEL) as DatasetSourceKind[]).map((k) => (
              <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${kind === k ? "var(--accent)" : "var(--line)"}`, background: kind === k ? "var(--accent-soft)" : "var(--surface)", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
                <Icon icon={SOURCE_ICON[k]} className="h-5 w-5" />
                <span>
                  <b style={{ fontSize: ".92rem" }}>{SOURCE_LABEL[k]}</b>
                  <span style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)" }}>{KIND_HELP[k]}</span>
                </span>
              </label>
            ))}
          </div>
          {err && <p style={{ color: "var(--fail)", fontSize: ".85rem" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="primary" onClick={create} loading={busy} disabled={!name.trim()}>สร้าง</Button>
            <Button onClick={() => { setCreating(false); setErr(""); }}>ยกเลิก</Button>
          </div>
        </Card>
      )}

      {items.length === 0 && !creating ? (
        <Card><EmptyState icon={<Icon icon={Database} className="h-8 w-8" />} title="ยังไม่มีข้อมูลอ้างอิง" hint="สร้างชุดข้อมูลแรก แล้วนำไปใช้เป็นตัวเลือกใน dropdown ของฟอร์ม" /></Card>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((d) => (
            <Link key={d.id} href={`/datasets/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)" }}>
                <Icon icon={Database} className="h-5 w-5" />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <b style={{ fontFamily: "var(--font-anuphan)" }}>{d.name}</b>
                  <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Icon icon={SOURCE_ICON[d.sourceKind]} className="h-3.5 w-3.5" /> {SOURCE_LABEL[d.sourceKind]}
                    {d.pullHost && <> · {d.pullHost}</>}
                    {" · "}{d.rowCount.toLocaleString()} แถว · {d.columns.length} คอลัมน์
                  </div>
                </div>
                <SyncBadge ds={d} />
                <Icon icon={ChevronRight} className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
