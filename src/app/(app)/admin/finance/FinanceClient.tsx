"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice } from "@/components/ui";
import type { FinanceReport, MonthSummary } from "@/lib/platform-finance";
import type { CostBucket } from "@/lib/finance-calc";
import { saveCostSettings, saveModelPrice } from "./actions";

const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const usd = (n: number) => `$${n < 10 ? n.toFixed(3) : n.toFixed(2)}`;
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" });
};

const th: React.CSSProperties = { textAlign: "left", fontWeight: 600, color: "var(--ink-3)", fontSize: ".75rem", padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid var(--line)", fontSize: ".86rem", verticalAlign: "top" };
const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const numTh: React.CSSProperties = { ...th, textAlign: "right" };
const inputStyle: React.CSSProperties = { fontFamily: "inherit", fontSize: ".9rem", padding: "7px 9px", border: "1px solid var(--line-strong)", borderRadius: 7, background: "var(--surface)", color: "var(--ink)", width: "100%" };

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pass" | "fail" }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: "1.45rem", fontWeight: 700, color: tone ? `var(--${tone})` : undefined, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function Trend({ rows }: { rows: MonthSummary[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenueThb, r.aiThb + r.fixedThb)));
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 150, padding: "8px 0 0", overflowX: "auto" }}>
      {rows.map((r) => (
        <div key={r.month} style={{ flex: "1 0 54px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 110 }}>
            <div title={`รายได้ ${baht(r.revenueThb)}`} style={{ width: 16, height: Math.max(2, (r.revenueThb / max) * 110), background: "var(--pass)", borderRadius: "3px 3px 0 0" }} />
            <div title={`ต้นทุน ${baht(r.aiThb + r.fixedThb)}`} style={{ width: 16, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 110 }}>
              <div style={{ height: Math.max(r.aiThb > 0 ? 2 : 0, (r.aiThb / max) * 110), background: "var(--fail)", borderRadius: r.fixedThb ? 0 : "3px 3px 0 0" }} />
              <div style={{ height: (r.fixedThb / max) * 110, background: "var(--ink-3)", order: -1, borderRadius: "3px 3px 0 0" }} />
            </div>
          </div>
          <div style={{ fontSize: ".72rem", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{monthLabel(r.month)}</div>
          <div style={{ fontSize: ".72rem", fontWeight: 600, color: r.profitThb >= 0 ? "var(--pass)" : "var(--fail)", whiteSpace: "nowrap" }}>{baht(r.profitThb)}</div>
        </div>
      ))}
    </div>
  );
}

function CostTable({ title, rows, keyLabel, nameOf, usdThb }: { title: string; rows: CostBucket[]; keyLabel: string; nameOf: (b: CostBucket) => string; usdThb: number }) {
  return (
    <Card>
      <h2 style={{ fontSize: "1rem", margin: "0 0 6px" }}>{title}</h2>
      {rows.length === 0 ? (
        <div style={{ color: "var(--ink-3)", fontSize: ".86rem" }}>ยังไม่มีการใช้งานในเดือนนี้</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr><th style={th}>{keyLabel}</th><th style={numTh}>ครั้ง</th><th style={numTh}>Token เข้า</th><th style={numTh}>Token ออก</th><th style={numTh}>USD</th><th style={numTh}>บาท</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.key}>
                  <td style={{ ...td, minWidth: 140, overflowWrap: "break-word" }}>{nameOf(b)}{b.unpriced && <span style={{ color: "var(--fail)", fontSize: ".75rem" }}> · ยังไม่ตั้งราคา</span>}</td>
                  <td style={num}>{b.calls.toLocaleString("th-TH")}</td>
                  <td style={num}>{tok(b.inputTokens)}</td>
                  <td style={num}>{tok(b.outputTokens)}</td>
                  <td style={num}>{usd(b.usd)}</td>
                  <td style={num}>{baht(b.usd * usdThb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PriceRow({ model, provider, note, initial, onSaved }: { model: string; provider: string; note: string; initial?: { inputPerM: number; outputPerM: number }; onSaved: () => void }) {
  const [inp, setInp] = useState(initial ? String(initial.inputPerM) : "");
  const [out, setOut] = useState(initial ? String(initial.outputPerM) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const dirty = inp !== (initial ? String(initial.inputPerM) : "") || out !== (initial ? String(initial.outputPerM) : "");

  async function save(remove = false) {
    const a = Number(inp), b = Number(out);
    if (!remove && (inp.trim() === "" || out.trim() === "" || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0)) {
      setMsg({ t: "ใส่ตัวเลข ≥ 0 ทั้งสองช่อง", err: true });
      return;
    }
    setBusy(true);
    const r = await saveModelPrice(model, a, b, remove);
    setBusy(false);
    if ("error" in r) { setMsg({ t: r.error, err: true }); return; }
    setMsg({ t: remove ? "ลบราคาแล้ว" : "บันทึกแล้ว" });
    if (remove) { setInp(""); setOut(""); }
    onSaved();
  }

  return (
    <tr>
      <td style={{ ...td, minWidth: 160, overflowWrap: "break-word" }}>
        <div style={{ fontWeight: 600 }}>{model}</div>
        <div style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{[provider, note].filter(Boolean).join(" · ")}</div>
        {msg && <div style={{ fontSize: ".75rem", color: msg.err ? "var(--fail)" : "var(--pass)" }}>{msg.t}</div>}
      </td>
      <td style={{ ...td, width: 110 }}><input aria-label={`ราคาขาเข้า ${model}`} inputMode="decimal" value={inp} onChange={(e) => setInp(e.target.value)} placeholder="0.00" style={inputStyle} /></td>
      <td style={{ ...td, width: 110 }}><input aria-label={`ราคาขาออก ${model}`} inputMode="decimal" value={out} onChange={(e) => setOut(e.target.value)} placeholder="0.00" style={inputStyle} /></td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <Button onClick={() => save()} loading={busy} disabled={!dirty} style={{ padding: "6px 12px", fontSize: ".82rem" }}>บันทึก</Button>
        {initial && <Button variant="ghost" onClick={() => save(true)} disabled={busy} style={{ padding: "6px 8px", fontSize: ".82rem" }}>ลบ</Button>}
      </td>
    </tr>
  );
}

export default function FinanceClient({ report }: { report: FinanceReport }) {
  const router = useRouter();
  const r = report;
  const c = r.current;
  const [fx, setFx] = useState(String(r.settings.usdThb));
  const [fixed, setFixed] = useState(String(r.settings.fixedMonthlyThb));
  const [sBusy, setSBusy] = useState(false);
  const [sMsg, setSMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [newModel, setNewModel] = useState("");
  const [extraModels, setExtraModels] = useState<string[]>([]);
  const priceOf = new Map(r.prices.map((p) => [p.model, p]));
  const refresh = () => router.refresh();

  async function saveSettings() {
    const a = Number(fx), b = Number(fixed);
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b < 0) { setSMsg({ t: "ตัวเลขไม่ถูกต้อง", err: true }); return; }
    setSBusy(true);
    const res = await saveCostSettings(a, b);
    setSBusy(false);
    if ("error" in res) { setSMsg({ t: res.error, err: true }); return; }
    setSMsg({ t: "บันทึกแล้ว" });
    refresh();
  }

  const mrrProfit = r.subs.mrrThb - c.aiThb - c.fixedThb;
  const unpricedModels = r.aiByModel.filter((b) => b.unpriced).map((b) => b.key);
  const models = [...r.modelsToPrice, ...extraModels.filter((m) => !r.modelsToPrice.some((x) => x.model === m)).map((m) => ({ model: m, provider: "", used: false, configuredFor: [] as string[] }))];

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>ยอดขายและต้นทุน</h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".88rem", margin: "4px 0 0" }}>
            รายได้จากใบแจ้งหนี้ที่ชำระแล้ว · ต้นทุน AI จาก token ที่ใช้จริง × ราคาที่ตั้งด้านล่าง (บาท อัตรา {r.settings.usdThb} บาท/USD)
          </p>
        </div>
        <label style={{ fontSize: ".85rem", color: "var(--ink-2)", display: "flex", gap: 6, alignItems: "center" }}>
          เดือน
          <select value={r.month} onChange={(e) => router.push(`/admin/finance?m=${e.target.value}`)} style={{ ...inputStyle, width: "auto" }}>
            {r.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>

      {r.missing.length > 0 && <Notice kind="error">ยังไม่ได้รัน migration {r.missing.join(", ")} — ข้อมูล token / ราคา / ค่าตั้งยังว่าง</Notice>}
      {unpricedModels.length > 0 && <Notice kind="error">รุ่นที่ยังไม่ได้ตั้งราคา: {unpricedModels.join(", ")} — ต้นทุน AI ที่แสดงจึงต่ำกว่าความจริง ตั้งราคาได้ที่ส่วนท้ายของหน้า</Notice>}
      {!r.tokensSince && r.missing.length === 0 && <Notice>ยังไม่มีการบันทึก token — ระบบเริ่มเก็บ token จริงหลังรัน migration 0058 (ข้อมูลก่อนหน้านี้มีแค่จำนวนครั้งที่หักเครดิต)</Notice>}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Kpi label="รายได้เดือนนี้ (ชำระแล้ว)" value={baht(c.revenueThb)} sub={`${c.invoices} ใบแจ้งหนี้`} />
        <Kpi label="MRR ตอนนี้" value={baht(r.subs.mrrThb)} sub={`${r.subs.activePaid} บัญชีที่จ่ายอยู่`} />
        <Kpi label="ต้นทุน AI" value={baht(c.aiThb)} sub={`${usd(c.aiUsd)} · ${c.aiCalls.toLocaleString("th-TH")} ครั้ง${c.aiUnpriced ? " · มีรุ่นไม่มีราคา" : ""}`} />
        <Kpi label="ต้นทุนคงที่" value={baht(c.fixedThb)} sub="ตั้งเองด้านล่าง" />
        <Kpi label="กำไรขั้นต้น (จากยอดชำระ)" value={baht(c.profitThb)} tone={c.profitThb >= 0 ? "pass" : "fail"} sub={`ถ้าคิดจาก MRR: ${baht(mrrProfit)}`} />
      </div>

      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "1rem", margin: 0, flex: 1 }}>6 เดือนล่าสุด</h2>
          <span style={{ fontSize: ".75rem", color: "var(--ink-3)", display: "flex", gap: 10 }}>
            <span><span style={{ color: "var(--pass)" }}>■</span> รายได้</span>
            <span><span style={{ color: "var(--fail)" }}>■</span> ต้นทุน AI</span>
            <span><span style={{ color: "var(--ink-3)" }}>■</span> ต้นทุนคงที่</span>
          </span>
        </div>
        <Trend rows={r.trend} />
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr><th style={th}>เดือน</th><th style={numTh}>รายได้</th><th style={numTh}>ต้นทุน AI</th><th style={numTh}>คงที่</th><th style={numTh}>กำไร</th><th style={numTh}>เรียก AI</th><th style={numTh}>เครดิตที่หัก</th></tr></thead>
            <tbody>
              {[...r.trend].reverse().map((m) => (
                <tr key={m.month}>
                  <td style={td}>{monthLabel(m.month)}</td>
                  <td style={num}>{baht(m.revenueThb)}</td>
                  <td style={num}>{baht(m.aiThb)}{m.aiUnpriced && <span style={{ color: "var(--fail)" }}>*</span>}</td>
                  <td style={num}>{baht(m.fixedThb)}</td>
                  <td style={{ ...num, color: m.profitThb >= 0 ? "var(--pass)" : "var(--fail)", fontWeight: 600 }}>{baht(m.profitThb)}</td>
                  <td style={num}>{m.aiCalls.toLocaleString("th-TH")}</td>
                  <td style={num}>{m.creditCalls.toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
          “เรียก AI” = ครั้งที่บันทึก token ได้ (นับรวมการทดสอบของแอดมิน) · “เครดิตที่หัก” = จำนวนเครดิตของลูกค้า (มีข้อมูลย้อนหลังก่อนเริ่มเก็บ token)
          {r.tokensSince && <> · เริ่มเก็บ token {new Date(r.tokensSince).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</>}
        </p>
      </Card>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        <Card>
          <h2 style={{ fontSize: "1rem", margin: "0 0 6px" }}>สมาชิกที่จ่ายอยู่ (ตอนนี้)</h2>
          {r.subs.byPlan.length === 0 ? <div style={{ color: "var(--ink-3)", fontSize: ".86rem" }}>ยังไม่มีบัญชีแบบเสียเงิน</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>แพ็กเกจ</th><th style={numTh}>บัญชี</th><th style={numTh}>MRR</th></tr></thead>
              <tbody>{r.subs.byPlan.map((p) => <tr key={p.plan}><td style={td}>{p.name}</td><td style={num}>{p.count}</td><td style={num}>{baht(p.mrrThb)}</td></tr>)}</tbody>
            </table>
          )}
          <p style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: "6px 0 0" }}>นับบัญชีที่ยังไม่หมดอายุ (รวมช่วงผ่อนผัน 3 วัน) · ใช้ราคาที่ล็อกไว้ตอนสมัคร ถ้าไม่มีใช้ราคาแพ็กเกจปัจจุบัน</p>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1rem", margin: "0 0 6px" }}>รายได้เดือนนี้ตามแพ็กเกจ</h2>
          {r.revenueByPlan.length === 0 ? <div style={{ color: "var(--ink-3)", fontSize: ".86rem" }}>ยังไม่มีใบแจ้งหนี้ที่ชำระในเดือนนี้</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>แพ็กเกจ</th><th style={numTh}>ใบ</th><th style={numTh}>ยอด</th></tr></thead>
              <tbody>{r.revenueByPlan.map((p) => <tr key={p.plan}><td style={td}>{p.name}</td><td style={num}>{p.count}</td><td style={num}>{baht(p.amountThb)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>

      <CostTable title="ต้นทุน AI ตามรุ่น" rows={r.aiByModel} keyLabel="รุ่น" nameOf={(b) => b.key} usdThb={r.settings.usdThb} />
      <CostTable title="ต้นทุน AI ตามงาน" rows={r.aiByPurpose} keyLabel="งาน" nameOf={(b) => (b as CostBucket & { label: string }).label} usdThb={r.settings.usdThb} />
      <CostTable title="Workspace ที่ใช้ AI มากที่สุด" rows={r.topTenants} keyLabel="Workspace" nameOf={(b) => (b as CostBucket & { name: string }).name} usdThb={r.settings.usdThb} />

      <Card>
        <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>ตั้งค่าการคำนวณต้นทุน</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", alignItems: "end" }}>
          <label style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>อัตราแลกเปลี่ยน (บาท ต่อ 1 USD)
            <input inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>ต้นทุนคงที่ต่อเดือน (บาท) เช่น Vercel + Supabase + โดเมน
            <input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <div><Button variant="primary" onClick={saveSettings} loading={sBusy}>บันทึก</Button></div>
        </div>
        {sMsg && <div style={{ fontSize: ".8rem", marginTop: 6, color: sMsg.err ? "var(--fail)" : "var(--pass)" }}>{sMsg.t}</div>}

        <h3 style={{ fontSize: ".95rem", margin: "18px 0 4px" }}>ราคา AI ต่อ 1 ล้าน token (USD)</h3>
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "0 0 6px" }}>
          ดูราคาล่าสุดจากหน้า pricing ของผู้ให้บริการ (Anthropic / OpenAI) แล้วกรอกตามรุ่น · ราคาใหม่มีผลกับการคำนวณทุกเดือนย้อนหลังด้วย
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><th style={th}>รุ่น</th><th style={th}>ขาเข้า</th><th style={th}>ขาออก</th><th style={th}></th></tr></thead>
            <tbody>
              {models.map((m) => (
                <PriceRow key={m.model} model={m.model} provider={m.provider}
                  note={[m.used ? "มีการใช้งาน" : "", m.configuredFor.length ? `ตั้งไว้สำหรับ ${m.configuredFor.join(", ")}` : ""].filter(Boolean).join(" · ")}
                  initial={priceOf.get(m.model)} onSaved={refresh} />
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 440 }}>
          <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="เพิ่มรุ่นอื่น เช่น ชื่อรุ่นตามที่ผู้ให้บริการใช้" style={inputStyle} />
          <Button onClick={() => { const v = newModel.trim(); if (v) { setExtraModels((x) => [...x, v]); setNewModel(""); } }}>เพิ่ม</Button>
        </div>
      </Card>
    </div>
  );
}
