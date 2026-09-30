"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Lock, Plug, TriangleAlert, Globe, Eye, EyeOff } from "lucide-react";
import { savePlatformAi } from "./actions";
import {
  AI_PURPOSES,
  PURPOSE_HINTS,
  PURPOSE_LABELS,
  PURPOSE_NEEDS_VISION,
  type AiPurpose,
} from "@/lib/ai-purpose";

type Provider = "qwen" | "openai" | "azure" | "anthropic";

export interface AiSettings {
  provider: Provider;
  model: string;
  base_url: string;
  azure_endpoint: string;
  azure_api_version: string;
  key_last4: string;
  has_key: boolean;
  enabled: boolean;
  /** true = ยังไม่ได้ตั้งของตัวเอง กำลังใช้ค่าจาก form_gen */
  inherited: boolean;
}

export type AiProfiles = Record<AiPurpose, AiSettings>;

const PROVIDERS: { id: Provider; name: string; hint: string; modelHint: string }[] = [
  { id: "qwen", name: "Qwen (DashScope)", hint: "endpoint แบบ OpenAI-compatible ของ Alibaba", modelHint: "qwen-vl-max" },
  { id: "openai", name: "OpenAI", hint: "api.openai.com", modelHint: "gpt-4o" },
  { id: "azure", name: "Azure OpenAI", hint: "ต้องมี endpoint + deployment + api-version", modelHint: "ชื่อ deployment เช่น gpt-4o" },
  { id: "anthropic", name: "Anthropic (Claude)", hint: "api.anthropic.com", modelHint: "claude-sonnet-4-5" },
];

const DEFAULT_BASE: Record<Provider, string> = {
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
  azure: "",
  anthropic: "",
};

export default function AdminAiClient({
  profiles,
  configured,
  embedded,
}: {
  profiles: AiProfiles;
  configured: boolean;
  embedded?: boolean;
}) {
  const [purpose, setPurpose] = useState<AiPurpose>("form_gen");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!embedded && (
        <div>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={Globe} className="h-5 w-5" /> ตั้งค่า AI (ระดับแพลตฟอร์ม)
          </h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
            คีย์ชุดนี้ใช้ร่วมกันทุก workspace — ตั้งค่าได้เฉพาะ Platform Admin / Developer เปลี่ยนแล้วมีผลทันที
          </p>
        </div>
      )}

      <Notice kind="info">
        แต่ละงานตั้งรุ่นและคีย์แยกกันได้ เพราะความฉลาดที่ต้องใช้และปริมาณการเรียกต่างกันมาก —
        งานหน้างานยิงมากกว่างานสร้างฟอร์มเป็นร้อยเท่า ตั้งไว้เฉพาะ “{PURPOSE_LABELS.form_gen}” ตัวเดียว
        งานอื่นจะใช้ค่าเดียวกันโดยอัตโนมัติ
      </Notice>

      {/* ---- แท็บเลือกงาน ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
        {AI_PURPOSES.map((p) => {
          const active = p === purpose;
          const prof = profiles[p];
          return (
            <button
              key={p}
              onClick={() => setPurpose(p)}
              style={{
                textAlign: "left", padding: "11px 13px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: active ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: active ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)",
              }}
            >
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".92rem", display: "flex", alignItems: "center", gap: 5 }}>
                {PURPOSE_LABELS[p]}
                {PURPOSE_NEEDS_VISION[p] && <Icon icon={Eye} className="h-3.5 w-3.5 text-sky-500" />}
              </b>
              <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".74rem", marginTop: 3 }}>
                {prof.has_key && !prof.inherited
                  ? `${prof.provider} · ${prof.model || "ค่าเริ่มต้น"}`
                  : "ใช้ค่าจากงานสร้างฟอร์ม"}
              </span>
            </button>
          );
        })}
      </div>

      {/* key = รีเซ็ต state ของฟอร์มเมื่อสลับแท็บ */}
      <PurposeForm key={purpose} purpose={purpose} current={profiles[purpose]} />

      {!configured && (
        <Notice kind="error">
          ต้องตั้ง env <code>SUPABASE_SERVICE_ROLE_KEY</code> ฝั่ง server ก่อน หน้านี้จึงบันทึก/อ่านคีย์ได้
        </Notice>
      )}
    </div>
  );
}

function PurposeForm({ purpose, current }: { purpose: AiPurpose; current: AiSettings }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(current.provider);
  const [model, setModel] = useState(current.model);
  const [baseUrl, setBaseUrl] = useState(current.base_url);
  const [azureEndpoint, setAzureEndpoint] = useState(current.azure_endpoint);
  const [azureApiVersion, setAzureApiVersion] = useState(current.azure_api_version || "2024-08-01-preview");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [test, setTest] = useState<{ t: string; err?: boolean } | null>(null);

  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const isOpenAICompatible = provider === "qwen" || provider === "openai";
  const needsVision = PURPOSE_NEEDS_VISION[purpose];
  const isDefault = purpose === "form_gen";

  async function save() {
    if (!current.has_key && !apiKey.trim()) {
      setMsg({ t: "กรุณาใส่ API key", err: true });
      return;
    }
    setBusy(true); setMsg(null); setTest(null);
    const res = await savePlatformAi({
      purpose,
      provider,
      model: model.trim(),
      base_url: isOpenAICompatible ? (baseUrl.trim() || DEFAULT_BASE[provider]) : "",
      azure_endpoint: provider === "azure" ? azureEndpoint.trim() : "",
      azure_api_version: provider === "azure" ? azureApiVersion.trim() : "",
      api_key: apiKey.trim(),
    });
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setApiKey("");
    setMsg({ t: "บันทึกแล้ว — มีผลกับทุก workspace ทันที ไม่ต้อง redeploy" });
    router.refresh();
  }

  async function runTest() {
    setBusy(true);
    setTest({ t: needsVision ? "กำลังทดสอบด้วยรูป (ต้องใช้รุ่น vision)..." : "กำลังทดสอบเรียก LLM..." });
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      const j = await res.json();
      setTest(
        j.ok
          ? { t: `เชื่อมต่อสำเร็จ · ${j.provider} / ${j.model}${j.vision ? " · อ่านรูปได้" : ""} — ตอบกลับ: “${j.reply}”` }
          : { t: j.error || "เรียกไม่สำเร็จ", err: true }
      );
    } catch (e) {
      setTest({ t: e instanceof Error ? e.message : "เรียกไม่สำเร็จ", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
          {PURPOSE_LABELS[purpose]}
          {needsVision ? (
            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-2)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon icon={Eye} className="h-3 w-3" /> ต้องใช้รุ่น vision
            </span>
          ) : (
            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-3)", background: "var(--surface-2, var(--surface))", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon icon={EyeOff} className="h-3 w-3" /> ไม่ต้องใช้ vision
            </span>
          )}
        </h2>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "4px 0 0" }}>{PURPOSE_HINTS[purpose]}</p>
      </div>

      {current.inherited && !isDefault && (
        <Notice kind="info">
          ตอนนี้ยังไม่ได้ตั้งคีย์ของงานนี้ — กำลังใช้ค่าจาก “{PURPOSE_LABELS.form_gen}” ตั้งคีย์ที่นี่เมื่ออยากแยกรุ่น/แยกบิล
        </Notice>
      )}

      <label style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: 6 }}>ผู้ให้บริการ</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {PROVIDERS.map((p) => (
          <button key={p.id}
            onClick={() => { setProvider(p.id); if (!model || PROVIDERS.some((x) => x.modelHint === model)) setModel(""); }}
            style={{ textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              border: provider === p.id ? "2px solid var(--accent)" : "1px solid var(--line)",
              background: provider === p.id ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)" }}>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".95rem" }}>{p.name}</b>
            <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 2 }}>{p.hint}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>รุ่นโมเดล (model)</label>
          <Field value={model} onChange={(e) => setModel(e.target.value)} placeholder={meta.modelHint} />
          <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            เว้นว่างเพื่อใช้ค่าเริ่มต้น ({meta.modelHint})
            {needsVision && (
              <>
                · <Icon icon={TriangleAlert} className="h-3.5 w-3.5" /> งานนี้ต้องเป็นรุ่นที่ดูรูปได้ (vision) — กดทดสอบเพื่อยืนยัน
              </>
            )}
          </p>
        </div>

        {isOpenAICompatible && (
          <div>
            <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>Base URL</label>
            <Field value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE[provider]} />
          </div>
        )}

        {provider === "azure" && (
          <>
            <div>
              <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>Azure Endpoint</label>
              <Field value={azureEndpoint} onChange={(e) => setAzureEndpoint(e.target.value)} placeholder="https://xxx.openai.azure.com" />
              <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0" }}>ช่อง “รุ่นโมเดล” ด้านบน = ชื่อ deployment ของคุณ</p>
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>API version</label>
              <Field value={azureApiVersion} onChange={(e) => setAzureApiVersion(e.target.value)} placeholder="2024-08-01-preview" />
            </div>
          </>
        )}

        <div>
          <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>API Key</label>
          <Field type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={current.has_key ? `ตั้งค่าไว้แล้ว ••••${current.key_last4} (เว้นว่างเพื่อคงเดิม)` : "วางคีย์ที่นี่"} autoComplete="off" />
          <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <Icon icon={Lock} className="h-3.5 w-3.5" /> คีย์ถูกเก็บฝั่ง server เท่านั้น browser และผู้ใช้อื่นอ่านไม่ได้ (เห็นได้แค่ 4 ตัวท้าย)
          </p>
        </div>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
        <Button onClick={runTest} disabled={busy || (!current.has_key && !apiKey)}>
          <Icon icon={Plug} className="h-4 w-4" /> ทดสอบการเชื่อมต่อ
        </Button>
      </div>
      {test && <Notice kind={test.err ? "error" : "info"}>{test.t}</Notice>}
    </Card>
  );
}
