"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import type { HealthReport, HealthStatus, AiProfileInfo } from "@/lib/platform-health";

const STATUS: Record<HealthStatus, { label: string; color: string; bg: string; dot: string }> = {
  ok: { label: "ปกติ", color: "var(--pass)", bg: "var(--pass-soft)", dot: "●" },
  warn: { label: "ควรตรวจ", color: "var(--warn)", bg: "var(--warn-soft)", dot: "▲" },
  fail: { label: "ผิดปกติ", color: "var(--fail)", bg: "var(--fail-soft)", dot: "✕" },
  off: { label: "ไม่ได้เปิดใช้", color: "var(--ink-3)", bg: "var(--code-bg)", dot: "○" },
};

function Badge({ s }: { s: HealthStatus }) {
  const c = STATUS[s];
  return (
    <span style={{ fontSize: ".72rem", fontWeight: 700, borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap", color: c.color, background: c.bg }}>
      {c.dot} {c.label}
    </span>
  );
}

const fmtBytes = (n?: number) => (n == null ? "—" : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const fmtNum = (n?: number) => (n == null ? "—" : n.toLocaleString("th-TH"));

type PingState = { busy?: boolean; ok?: boolean; text?: string };

export default function HealthClient({ report }: { report: HealthReport }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [ping, setPing] = useState<Record<string, PingState>>({});

  const all = report.groups.flatMap((g) => g.checks);
  const worst: HealthStatus = all.some((c) => c.status === "fail") ? "fail" : all.some((c) => c.status === "warn") ? "warn" : "ok";
  const counts = { fail: all.filter((c) => c.status === "fail").length, warn: all.filter((c) => c.status === "warn").length };

  async function test(p: AiProfileInfo) {
    setPing((s) => ({ ...s, [p.purpose]: { busy: true, text: "กำลังทดสอบ..." } }));
    try {
      const res = await fetch("/api/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: p.purpose }) });
      const j = await res.json();
      setPing((s) => ({
        ...s,
        [p.purpose]: j.ok
          ? { ok: true, text: `ตอบกลับได้${j.vision ? " · อ่านรูปได้" : ""} — “${String(j.reply ?? "").slice(0, 60)}”` }
          : { ok: false, text: j.error || "เรียกไม่สำเร็จ" },
      }));
    } catch (e) {
      setPing((s) => ({ ...s, [p.purpose]: { ok: false, text: e instanceof Error ? e.message : "เรียกไม่สำเร็จ" } }));
    }
  }

  async function testAll() {
    for (const p of report.ai.filter((x) => x.hasKey)) await test(p);
  }

  const stat = (label: string, value: string) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>สุขภาพระบบ</h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".88rem", margin: "4px 0 0" }}>
            ตรวจการเชื่อมต่อทุกส่วนอัตโนมัติเมื่อเปิดหน้านี้ · ตรวจล่าสุด {new Date(report.checkedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
          </p>
        </div>
        <Button onClick={() => startRefresh(() => router.refresh())} loading={refreshing}>ตรวจใหม่</Button>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
            <span style={{ fontSize: "1.8rem", color: STATUS[worst].color }}>{STATUS[worst].dot}</span>
            <div>
              <div style={{ fontWeight: 700 }}>{worst === "ok" ? "ทุกระบบปกติ" : worst === "warn" ? `มี ${counts.warn} รายการควรตรวจ` : `มี ${counts.fail} รายการผิดปกติ`}</div>
              {worst !== "ok" && counts.fail > 0 && counts.warn > 0 && <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>และอีก {counts.warn} รายการควรตรวจ</div>}
            </div>
          </div>
          {stat("Workspace", fmtNum(report.stats.tenants))}
          {stat("ผู้ใช้", fmtNum(report.stats.users))}
          {stat("ส่งฟอร์ม 24 ชม.", fmtNum(report.stats.submissions24h))}
          {stat("ขนาดฐานข้อมูล", fmtBytes(report.stats.dbSizeBytes))}
        </div>
      </Card>

      {report.groups.map((g) => (
        <Card key={g.title}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>{g.title}</h2>
          <div style={{ display: "grid" }}>
            {g.checks.map((c, i) => (
              <div key={c.name + i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", flexWrap: "wrap" }}>
                <div style={{ width: 104, flex: "0 0 auto" }}><Badge s={c.status} /></div>
                <div style={{ flex: "1 1 180px", fontWeight: 600, minWidth: 0 }}>{c.name}</div>
                <div style={{ flex: "2 1 240px", fontSize: ".85rem", color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                  {c.detail}
                  {c.ms != null && <span style={{ color: "var(--ink-3)" }}> · {c.ms} ms</span>}
                  {c.href && <> · <a href={c.href}>เปิด</a></>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <h2 style={{ fontSize: "1rem", margin: 0, flex: 1 }}>ทดสอบเรียก AI จริง</h2>
          <Button onClick={testAll} disabled={Object.values(ping).some((p) => p.busy)}>ทดสอบทั้งหมด</Button>
        </div>
        <p style={{ fontSize: ".8rem", color: "var(--ink-3)", margin: "0 0 8px" }}>
          ยิงคำถามสั้น ๆ ไปที่ผู้ให้บริการ AI ของแต่ละงาน (เสียค่า token เล็กน้อย ไม่หักเครดิตลูกค้า) · แก้คีย์/รุ่นได้ที่ <a href="/admin/settings">ตั้งค่าระบบ › AI</a>
        </p>
        {report.ai.map((p, i) => {
          const st = ping[p.purpose];
          return (
            <div key={p.purpose} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{p.provider} / {p.model || "—"}{!p.hasKey && " · ยังไม่ได้ตั้ง API key"}</div>
              </div>
              <div style={{ flex: "2 1 240px", fontSize: ".85rem", color: st?.busy ? "var(--ink-3)" : st?.ok ? "var(--pass)" : "var(--fail)", overflowWrap: "anywhere" }}>
                {st?.text}
              </div>
              <Button onClick={() => test(p)} loading={st?.busy} disabled={!p.hasKey} style={{ padding: "6px 14px", fontSize: ".85rem" }}>ทดสอบ</Button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
