"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Lock, Plug, TriangleAlert } from "lucide-react";

type Provider = "qwen" | "openai" | "azure" | "anthropic";
export interface AiSettings {
  provider: Provider;
  model: string;
  base_url: string;
  azure_endpoint: string;
  azure_api_version: string;
  key_last4: string;
  has_key: boolean;
}

const PROVIDERS: { id: Provider; name: string; hint: string; modelHint: string; vision: boolean }[] = [
  { id: "qwen", name: "Qwen (DashScope)", hint: "endpoint แบบ OpenAI-compatible ของ Alibaba", modelHint: "qwen-vl-max", vision: true },
  { id: "openai", name: "OpenAI", hint: "api.openai.com", modelHint: "gpt-4o", vision: true },
  { id: "azure", name: "Azure OpenAI", hint: "ต้องมี endpoint + deployment + api-version", modelHint: "ชื่อ deployment เช่น gpt-4o", vision: true },
  { id: "anthropic", name: "Anthropic (Claude)", hint: "api.anthropic.com", modelHint: "claude-sonnet-4-5", vision: true },
];

const DEFAULT_BASE: Record<Provider, string> = {
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
  azure: "",
  anthropic: "",
};

export default function AiSettingsClient({ current }: { current: AiSettings }) {
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

  async function save() {
    if (!current.has_key && !apiKey.trim()) {
      setMsg({ t: "กรุณาใส่ API key", err: true });
      return;
    }
    setBusy(true);
    setMsg(null);
    setTest(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("ai_settings_set", {
      p_provider: provider,
      p_model: model.trim(),
      p_base_url: isOpenAICompatible ? baseUrl.trim() || DEFAULT_BASE[provider] : "",
      p_azure_endpoint: provider === "azure" ? azureEndpoint.trim() : "",
      p_azure_api_version: provider === "azure" ? azureApiVersion.trim() : "",
      p_api_key: apiKey.trim(), // ว่าง = คงคีย์เดิม
    });
    setBusy(false);
    if (error) {
      setMsg({ t: error.message, err: true });
      return;
    }
    setApiKey("");
    setMsg({ t: "บันทึกแล้ว — มีผลทันที ไม่ต้อง redeploy" });
    router.refresh();
  }

  async function runTest() {
    setBusy(true);
    setTest({ t: "กำลังทดสอบเรียก LLM..." });
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const j = await res.json();
      setTest(j.ok ? { t: `เชื่อมต่อสำเร็จ (ลองสร้างฟอร์ม “${j.title}” ได้)` } : { t: j.error || "เรียกไม่สำเร็จ", err: true });
    } catch (e) {
      setTest({ t: e instanceof Error ? e.message : "เรียกไม่สำเร็จ", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>ตั้งค่า AI (LLM)</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          เลือกผู้ให้บริการ AI และใส่คีย์ — ใช้กับการสร้างฟอร์ม อ่านฟอร์มจากรูป และตรวจรูปถ่าย เปลี่ยนได้ทุกเมื่อ มีผลทันที
        </p>
      </div>

      <Card>
        <label style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: 6 }}>ผู้ให้บริการ</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); if (!model || PROVIDERS.some((x) => x.modelHint === model)) setModel(""); }}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: provider === p.id ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: provider === p.id ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)",
              }}
            >
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
              เว้นว่างเพื่อใช้ค่าเริ่มต้น ({meta.modelHint}) · <Icon icon={TriangleAlert} className="h-3.5 w-3.5" /> ต้องเป็นรุ่นที่ดูรูปได้ (vision) จึงจะอ่านฟอร์มจากรูป/ตรวจรูปได้
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
            <Field
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={current.has_key ? `ตั้งค่าไว้แล้ว ••••${current.key_last4} (เว้นว่างเพื่อคงเดิม)` : "วางคีย์ที่นี่"}
              autoComplete="off"
            />
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Icon icon={Lock} className="h-3.5 w-3.5" /> คีย์ถูกเก็บฝั่ง server เท่านั้น browser และสมาชิกคนอื่นอ่านไม่ได้ (เห็นได้แค่ 4 ตัวท้าย)
            </p>
          </div>
        </div>

        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
          <Button onClick={runTest} disabled={busy || (!current.has_key && !apiKey)}><Icon icon={Plug} className="h-4 w-4" /> ทดสอบการเชื่อมต่อ</Button>
        </div>
        {test && <Notice kind={test.err ? "error" : "info"}>{test.t}</Notice>}
      </Card>

      <Notice>
        ต้องตั้ง env <code>SUPABASE_SERVICE_ROLE_KEY</code> ฝั่ง server ครั้งเดียว (ไว้อ่านคี่ย์อย่างปลอดภัย) การตั้งค่าหน้านี้จึงทำงาน — ดู README
      </Notice>
    </div>
  );
}
