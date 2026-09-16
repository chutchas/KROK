"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { TabletSmartphone, Check } from "lucide-react";
import { listDevicesForForm, toggleFormDevice, type DeviceLink } from "@/app/(app)/settings/devices/actions";

/**
 * เลือกเครื่องที่ผูกกับฟอร์มนี้ (ใช้ในหน้าแก้ฟอร์มของ Studio)
 * บันทึกทันทีที่ติ๊ก — ไม่รอกดบันทึกฟอร์ม เพราะเป็นข้อมูลคนละตาราง
 */
export default function FormDevicePicker({ formId }: { formId: string | null }) {
  const [rows, setRows] = useState<DeviceLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      setRows(await listDevicesForForm(formId));
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(d: DeviceLink) {
    if (!formId) return;
    setBusy(d.id);
    setErr("");
    try {
      const res = await toggleFormDevice(formId, d.id, !d.linked);
      if ("error" in res) { setErr(res.error); return; }
      setRows((prev) => prev.map((x) => (x.id === d.id ? { ...x, linked: !x.linked } : x)));
    } finally {
      setBusy(null);
    }
  }

  if (!formId)
    return (
      <p style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "8px 0 0" }}>
        บันทึกฟอร์มก่อน แล้วเปิดกลับมาเลือกเครื่องได้ — ระหว่างนี้ยังไม่มีเครื่องไหนกรอกฟอร์มนี้ได้
      </p>
    );

  const count = rows.filter((r) => r.linked).length;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginBottom: 6 }}>
        เครื่องที่ผูกกับฟอร์มนี้ ({count}/{rows.length})
      </div>

      {loading && <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>กำลังโหลด…</div>}

      {!loading && rows.length === 0 && (
        <p style={{ fontSize: ".82rem", color: "var(--ink-3)", margin: 0 }}>
          ยังไม่มีเครื่องที่อนุมัติแล้วในองค์กร — อนุมัติเครื่องก่อนที่{" "}
          <Link href="/settings/devices" style={{ color: "var(--accent)" }}>ตั้งค่า → อุปกรณ์</Link>
        </p>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((d) => (
          <label
            key={d.id}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 8,
              border: `1px solid ${d.linked ? "var(--accent)" : "var(--line)"}`,
              background: d.linked ? "var(--accent-soft)" : "var(--surface)",
              cursor: busy === d.id ? "wait" : "pointer", opacity: busy === d.id ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={d.linked}
              disabled={busy === d.id}
              onChange={() => toggle(d)}
              style={{ width: 17, height: 17, accentColor: "var(--accent)" }}
            />
            <Icon icon={TabletSmartphone} className="h-4 w-4" />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: ".88rem", fontFamily: "var(--font-anuphan)" }}>{d.name}</b>
              {d.platform && <span style={{ display: "block", fontSize: ".74rem", color: "var(--ink-3)" }}>{d.platform}</span>}
            </span>
            {d.linked && <Icon icon={Check} className="h-4 w-4" />}
          </label>
        ))}
      </div>

      {count === 0 && rows.length > 0 && (
        <p style={{ fontSize: ".8rem", color: "var(--amber)", margin: "8px 0 0" }}>
          ยังไม่ได้เลือกเครื่องเลย — ตอนนี้ยังไม่มีใครกรอกฟอร์มนี้ได้
        </p>
      )}
      {err && <p style={{ fontSize: ".8rem", color: "var(--fail)", margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}
