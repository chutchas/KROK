"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Lock, Plug, TriangleAlert } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";

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

// hint/modelHint ที่เป็น key → แปลตอนแสดง; ที่เป็นข้อความธรรมดา (ชื่อโดเมน/รุ่น) → แสดงตรง ๆ
const PROVIDERS: { id: Provider; name: string; hint: string; hintKey?: MessageKey; modelHint: string; modelHintKey?: MessageKey; vision: boolean }[] = [
  { id: "qwen", name: "Qwen (DashScope)", hint: "", hintKey: "ai.hintQwen", modelHint: "qwen-vl-max", vision: true },
  { id: "openai", name: "OpenAI", hint: "api.openai.com", modelHint: "gpt-4o", vision: true },
  { id: "azure", name: "Azure OpenAI", hint: "", hintKey: "ai.hintAzure", modelHint: "", modelHintKey: "ai.modelHintAzure", vision: true },
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
  const { t, tt } = useT();
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
  const modelHint = meta.modelHintKey ? t(meta.modelHintKey) : meta.modelHint;

  async function save() {
    if (!current.has_key && !apiKey.trim()) {
      setMsg({ t: t("ai.needKey"), err: true });
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
    setMsg({ t: t("ai.savedNow") });
    router.refresh();
  }

  async function runTest() {
    setBusy(true);
    setTest({ t: t("ai.testing") });
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const j = await res.json();
      setTest(j.ok ? { t: tt("ai.testOk", { title: j.title }) } : { t: j.error || t("ai.testFail"), err: true });
    } catch (e) {
      setTest({ t: e instanceof Error ? e.message : t("ai.testFail"), err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("ai.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {t("ai.sub")}
        </p>
      </div>

      <Card>
        <label style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: 6 }}>{t("ai.provider")}</label>
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
              <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", marginTop: 2 }}>{p.hintKey ? t(p.hintKey) : p.hint}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 4 }}>{t("ai.model")}</label>
            <Field value={model} onChange={(e) => setModel(e.target.value)} placeholder={modelHint} />
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              {tt("ai.modelDefault", { m: modelHint })} · <Icon icon={TriangleAlert} className="h-3.5 w-3.5" /> {t("ai.visionNote")}
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
                <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0" }}>{t("ai.azureModelNote")}</p>
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
              placeholder={current.has_key ? tt("ai.keySet", { last4: current.key_last4 }) : t("ai.keyPaste")}
              autoComplete="off"
            />
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "4px 0 0", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("ai.keyServerOnly")}
            </p>
          </div>
        </div>

        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button>
          <Button onClick={runTest} disabled={busy || (!current.has_key && !apiKey)}><Icon icon={Plug} className="h-4 w-4" /> {t("ai.testBtn")}</Button>
        </div>
        {test && <Notice kind={test.err ? "error" : "info"}>{test.t}</Notice>}
      </Card>

      <Notice>
        {t("ai.envNote1")}<code>SUPABASE_SERVICE_ROLE_KEY</code>{t("ai.envNote2")}
      </Notice>
    </div>
  );
}
