"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Database, RefreshCw, ExternalLink } from "lucide-react";
import type { FormField, FormSchema, OptionsSource, TableColumn } from "@/lib/form-schema";
import { listDatasetsForPicker, type DatasetPick } from "@/app/(app)/datasets/actions";

// ============================================================
// เลือกแหล่งตัวเลือกของ dropdown: พิมพ์เอง หรือ ดึงจากข้อมูลอ้างอิง (dataset)
// ใช้ทั้งใน FormEditor (มุมมองมือถือ) และ FieldSettingsPanel (มุมมองกระดาษ)
// ============================================================

// โหลดรายการ dataset ครั้งเดียวแล้วแชร์ระหว่างทุกฟิลด์ (หมดอายุ 60 วินาที — เผื่อสลับ workspace)
let cache: { at: number; p: Promise<DatasetPick[]> } | null = null;
function loadPicks(force = false): Promise<DatasetPick[]> {
  if (!cache || force || Date.now() - cache.at > 60_000) cache = { at: Date.now(), p: listDatasetsForPicker().catch(() => []) };
  return cache.p;
}

export function useDatasetPicks() {
  const [picks, setPicks] = useState<DatasetPick[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadPicks().then((p) => { if (alive) setPicks(p); });
    return () => { alive = false; };
  }, []);
  const refresh = () => { setPicks(null); loadPicks(true).then(setPicks); };
  return { picks, refresh };
}

const sel: React.CSSProperties = {
  padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
  color: "var(--ink)", fontFamily: "inherit", fontSize: ".85rem", width: "100%", minWidth: 0,
};
const hint: React.CSSProperties = { fontSize: ".76rem", color: "var(--ink-3)", margin: "4px 0 0" };
const lbl: React.CSSProperties = { display: "block", fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)", margin: "8px 0 4px" };

function ModeToggle({ fromDataset, onChange }: { fromDataset: boolean; onChange: (v: boolean) => void }) {
  const b = (on: boolean): React.CSSProperties => ({
    padding: "5px 11px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem",
    fontWeight: on ? 600 : 400, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--ink-2)",
    display: "inline-flex", alignItems: "center", gap: 5,
  });
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      <button type="button" style={b(!fromDataset)} onClick={() => onChange(false)}>พิมพ์เอง</button>
      <button type="button" style={{ ...b(fromDataset), borderLeft: "1px solid var(--line)" }} onClick={() => onChange(true)}>
        <Icon icon={Database} className="h-3.5 w-3.5" /> จากข้อมูลอ้างอิง
      </button>
    </div>
  );
}

function DatasetColumnPicker({
  picks,
  value,
  onChange,
  onRefresh,
}: {
  picks: DatasetPick[] | null;
  value: OptionsSource | undefined;
  onChange: (v: OptionsSource | undefined) => void;
  onRefresh: () => void;
}) {
  if (picks === null) return <p style={hint}>กำลังโหลดข้อมูลอ้างอิง...</p>;
  if (picks.length === 0)
    return (
      <p style={hint}>
        ยังไม่มีข้อมูลอ้างอิง — <Link href="/datasets" target="_blank" style={{ color: "var(--accent)" }}>สร้างที่เมนู “ข้อมูลอ้างอิง”</Link>{" "}
        <button type="button" onClick={onRefresh} style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: "inherit" }}>
          <Icon icon={RefreshCw} className="h-3 w-3" /> โหลดใหม่
        </button>
      </p>
    );
  const ds = picks.find((p) => p.id === value?.dataset_id);
  return (
    <>
      <label style={lbl}>ชุดข้อมูล</label>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={value?.dataset_id || ""}
          onChange={(e) => {
            const p = picks.find((x) => x.id === e.target.value);
            onChange(p ? { dataset_id: p.id, column: p.columns[0]?.key || "" } : undefined);
          }}
          style={sel}
        >
          <option value="">— เลือก —</option>
          {picks.map((p) => (
            <option key={p.id} value={p.id} disabled={p.columns.length === 0}>
              {p.name} ({p.columns.length === 0 ? "ยังไม่มีคอลัมน์" : `${p.rowCount.toLocaleString()} แถว`})
            </option>
          ))}
        </select>
        {ds && (
          <Link href={`/datasets/${ds.id}`} target="_blank" title="เปิดชุดข้อมูล" style={{ display: "inline-flex", alignItems: "center", padding: "0 8px", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink-2)" }}>
            <Icon icon={ExternalLink} className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {value?.dataset_id && !ds && <p style={{ ...hint, color: "var(--fail)" }}>ไม่พบชุดข้อมูลที่เลือกไว้ (อาจถูกลบ)</p>}
      {ds && (
        <>
          <label style={lbl}>คอลัมน์ที่บันทึกเป็นค่า</label>
          <select
            value={value?.column || ""}
            onChange={(e) => {
              const column = e.target.value;
              const next: OptionsSource = { ...value!, column };
              if (next.label_column === column) delete next.label_column;
              onChange(next);
            }}
            style={sel}
          >
            {ds.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label style={lbl}>คอลัมน์ที่แสดงให้ผู้กรอกเห็น</label>
          <select
            value={value?.label_column || ""}
            onChange={(e) => {
              const next: OptionsSource = { ...value!, label_column: e.target.value || undefined };
              if (!next.label_column) delete next.label_column;
              onChange(next);
            }}
            style={sel}
          >
            <option value="">— แสดงค่าเดียวกับที่บันทึก —</option>
            {ds.columns.filter((c) => c.key !== value?.column).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {value?.label_column && (
            <p style={hint}>
              ผู้กรอกเห็น “{ds.columns.find((c) => c.key === value.label_column)?.label}” พร้อม “{ds.columns.find((c) => c.key === value.column)?.label}” ตัวเล็ก ๆ
              — submission เก็บทั้งสองค่า (ต้องรัน migration 0031)
            </p>
          )}
        </>
      )}
    </>
  );
}

/** แหล่งตัวเลือกของฟิลด์ select / checkbox (รองรับกรองตามฟิลด์ก่อนหน้า) */
export default function OptionsSourceEditor({
  schema,
  field,
  onPatch,
  staticEditor,
}: {
  schema: FormSchema;
  field: FormField;
  onPatch: (p: Partial<FormField>) => void;
  staticEditor: React.ReactNode;
}) {
  const { picks, refresh } = useDatasetPicks();
  // เลือกโหมด "จากข้อมูลอ้างอิง" แล้วแต่ยังไม่ได้เลือกชุดข้อมูล — จำไว้ต่อฟิลด์
  const [wantFor, setWantFor] = useState<string | null>(null);
  const fromDs = !!field.options_source || wantFor === field.id;
  const setFromDs = (v: boolean) => setWantFor(v ? field.id : null);

  const src = field.options_source;
  const ds = picks?.find((p) => p.id === src?.dataset_id);

  // ฟิลด์ที่เป็นแม่ได้: select/checkbox ที่อยู่ก่อนหน้าในฟอร์ม
  const parents: FormField[] = [];
  outer: for (const st of schema.steps)
    for (const f of st.fields) {
      if (f.id === field.id) break outer;
      if (f.type === "select" || f.type === "checkbox") parents.push(f);
    }

  return (
    <div>
      <ModeToggle
        fromDataset={fromDs}
        onChange={(v) => {
          setFromDs(v);
          if (!v) onPatch({ options_source: undefined });
        }}
      />
      {!fromDs ? (
        <div style={{ marginTop: 8 }}>{staticEditor}</div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <DatasetColumnPicker picks={picks} value={src} onRefresh={refresh} onChange={(v) => onPatch({ options_source: v })} />
          {ds && src && (
            <>
              <label style={lbl}>กรองตามคำตอบของช่องก่อนหน้า (ไม่บังคับ)</label>
              <select
                value={src.parent?.field_id || ""}
                onChange={(e) => {
                  const pid = e.target.value;
                  if (!pid) {
                    const { parent: _drop, ...rest } = src;
                    void _drop;
                    onPatch({ options_source: rest });
                  }
                  else onPatch({ options_source: { ...src, parent: { field_id: pid, column: src.parent?.column || ds.columns.find((c) => c.key !== src.column)?.key || ds.columns[0].key } } });
                }}
                style={sel}
                disabled={parents.length === 0}
              >
                <option value="">{parents.length ? "— ไม่กรอง —" : "— ไม่มีช่องเลือกก่อนหน้า —"}</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.label || "(ไม่มีชื่อ)"}</option>)}
              </select>
              {src.parent && (
                <>
                  <label style={lbl}>ค่าที่บันทึกของช่องนั้นต้องตรงกับคอลัมน์</label>
                  <select value={src.parent.column} onChange={(e) => onPatch({ options_source: { ...src, parent: { ...src.parent!, column: e.target.value } } })} style={sel}>
                    {ds.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <p style={hint}>
                    เช่น ช่อง “ลูกค้า” ใช้คอลัมน์ ลูกค้า → ช่องนี้ (สาขา) กรองด้วยคอลัมน์ ลูกค้า — ผู้กรอกจะเห็นเฉพาะสาขาของลูกค้าที่เลือก
                  </p>
                </>
              )}
              <p style={hint}>
                ตัวเลือกดึงตอนเปิดฟอร์ม · ออฟไลน์ใช้ข้อมูลรอบล่าสุดที่เปิดไว้ · ฟอร์มสาธารณะ ทุกคนที่มีลิงก์จะเห็นค่าในคอลัมน์นี้
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** แหล่งตัวเลือกของคอลัมน์ select ในฟิลด์ตาราง (ไม่มีการกรองตามกัน) */
export function ColumnSourceEditor({
  col,
  onPatch,
  staticEditor,
}: {
  col: TableColumn;
  onPatch: (p: Partial<TableColumn>) => void;
  staticEditor: React.ReactNode;
}) {
  const { picks, refresh } = useDatasetPicks();
  const [wantFor, setWantFor] = useState<string | null>(null);
  const fromDs = !!col.options_source || wantFor === col.id;
  const setFromDs = (v: boolean) => setWantFor(v ? col.id : null);
  return (
    <div>
      <ModeToggle fromDataset={fromDs} onChange={(v) => { setFromDs(v); if (!v) onPatch({ options_source: undefined }); }} />
      <div style={{ marginTop: 6 }}>
        {fromDs ? (
          <DatasetColumnPicker picks={picks} value={col.options_source} onRefresh={refresh} onChange={(v) => onPatch({ options_source: v ? { dataset_id: v.dataset_id, column: v.column, ...(v.label_column ? { label_column: v.label_column } : {}) } : undefined })} />
        ) : (
          staticEditor
        )}
      </div>
    </div>
  );
}
