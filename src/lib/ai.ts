import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { sanitizeSchema, type FormSchema } from "./form-schema";
import { getAdminClient } from "./supabase/admin";

// ============================================================
// Provider-agnostic LLM layer
// เลือก provider ด้วย env ตัวเดียว: LLM_PROVIDER = qwen | openai | azure | anthropic
// เปลี่ยน provider = แก้ env แล้ว redeploy (ไม่ต้องแก้โค้ด)
//
// env ที่ใช้:
//   LLM_PROVIDER          (default: qwen)
//   LLM_API_KEY           (คีย์ของ provider ที่เลือก)
//   LLM_MODEL             (ชื่อรุ่น เช่น qwen-vl-max, gpt-4o, claude-sonnet-4-5)
//   LLM_BASE_URL          (เฉพาะ openai-compatible; มี default ต่อ provider)
//   AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_VERSION  (เฉพาะ azure)
//
// backward-compat: ถ้าไม่ตั้ง LLM_* แต่มี ANTHROPIC_API_KEY → ใช้ Anthropic
// ============================================================

type Provider = "qwen" | "openai" | "azure" | "anthropic";

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseURL?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
}

const DEFAULTS: Record<Provider, { model: string; baseURL?: string }> = {
  qwen: { model: "qwen-vl-max", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  openai: { model: "gpt-4o", baseURL: "https://api.openai.com/v1" },
  azure: { model: "gpt-4o" }, // model = deployment name
  anthropic: { model: "claude-sonnet-4-5" },
};

// config จาก env (ใช้เป็น default/fallback เมื่อ tenant ยังไม่ตั้งค่าเอง)
function envConfig(): ProviderConfig {
  const explicit = (process.env.LLM_PROVIDER || "").toLowerCase() as Provider;
  const provider: Provider =
    explicit && ["qwen", "openai", "azure", "anthropic"].includes(explicit)
      ? explicit
      : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : "qwen";

  const apiKey =
    process.env.LLM_API_KEY ||
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY || "" : "");

  return {
    provider,
    apiKey,
    model: process.env.LLM_MODEL || process.env.KROK_AI_MODEL || DEFAULTS[provider].model,
    baseURL: process.env.LLM_BASE_URL || DEFAULTS[provider].baseURL,
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
  };
}

// config ต่อ tenant: อ่านจาก DB (service role) ก่อน ถ้าไม่มีคีย์ค่อย fallback ไป env
async function resolveConfig(tenantId?: string): Promise<ProviderConfig> {
  const admin = getAdminClient();
  if (tenantId && admin) {
    const { data } = await admin
      .from("tenant_ai_settings")
      .select("provider, model, base_url, azure_endpoint, azure_api_version, api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data && data.api_key) {
      const provider = (data.provider || "qwen") as Provider;
      return {
        provider,
        apiKey: data.api_key as string,
        model: (data.model as string) || DEFAULTS[provider].model,
        baseURL: (data.base_url as string) || DEFAULTS[provider].baseURL,
        azureEndpoint: (data.azure_endpoint as string) || undefined,
        azureApiVersion: (data.azure_api_version as string) || "2024-08-01-preview",
      };
    }
  }
  return envConfig();
}

export interface ImageInput {
  base64: string;
  mediaType: string;
}

// ---- ตัวเรียกกลาง: ส่ง prompt (+รูป) แล้วได้ text กลับ ----
async function complete(
  tenantId: string | undefined,
  userText: string,
  image: ImageInput | null,
  maxTokens = 3000
): Promise<string> {
  const cfg = await resolveConfig(tenantId);
  if (!cfg.apiKey)
    throw new Error("ยังไม่ได้ตั้งค่า AI provider — ไปที่ Settings → AI เพื่อใส่คีย์ (หรือตั้ง env)");

  if (cfg.provider === "anthropic") return completeAnthropic(cfg, userText, image, maxTokens);
  return completeOpenAICompatible(cfg, userText, image, maxTokens);
}

// ---- Anthropic ----
async function completeAnthropic(
  cfg: ProviderConfig,
  userText: string,
  image: ImageInput | null,
  maxTokens: number
): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const content: Anthropic.MessageParam["content"] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType as "image/jpeg", data: image.base64 },
    });
  }
  content.push({ type: "text", text: userText });
  const msg = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ---- OpenAI-compatible (OpenAI / Azure / Qwen) ----
function openAIClient(cfg: ProviderConfig): OpenAI {
  if (cfg.provider === "azure") {
    if (!cfg.azureEndpoint) throw new Error("Azure ต้องตั้ง AZURE_OPENAI_ENDPOINT");
    // Azure OpenAI ผ่าน openai SDK: baseURL ชี้ไป deployment + api-version เป็น query
    return new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: `${cfg.azureEndpoint.replace(/\/$/, "")}/openai/deployments/${cfg.model}`,
      defaultQuery: { "api-version": cfg.azureApiVersion },
      defaultHeaders: { "api-key": cfg.apiKey },
    });
  }
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
}

async function completeOpenAICompatible(
  cfg: ProviderConfig,
  userText: string,
  image: ImageInput | null,
  maxTokens: number
): Promise<string> {
  const client = openAIClient(cfg);
  // สำคัญ: ไม่มีรูป → ส่ง content เป็น string ธรรมดา
  // ถ้าส่งเป็น array แบบ multimodal โมเดล text (qwen-plus/qwen-max) จะตอบ 403 Model access denied
  const content: OpenAI.Chat.Completions.ChatCompletionUserMessageParam["content"] = image
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } },
      ]
    : userText;
  const res = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return res.choices[0]?.message?.content || "";
}

// ============================================================
// ดึง JSON ออกจากคำตอบแบบทนทาน
// ============================================================
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("AI ไม่ได้ตอบเป็น JSON");
  return JSON.parse(body.slice(start, end + 1));
}

export const SCHEMA_SPEC = `ตอบกลับเป็น JSON object เดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON ตาม spec นี้:
{"title":"ชื่อฟอร์ม","description":"อธิบายสั้นๆ ว่าใช้เมื่อไหร่","icon":"emoji 1 ตัว",
"steps":[{"title":"ชื่อขั้นตอน","fields":[{
 "id":"snake_case_id","type":"text|number|select|checkbox|pass_fail|photo|barcode|signature|datetime",
 "label":"คำถาม/สิ่งที่ต้องตรวจ (ภาษาไทย)","required":true,
 "tooltip":"คำแนะนำสั้นๆ ช่วยให้กรอกถูกต้อง เช่น จุดที่ต้องดู วิธีวัด",
 "example":"ตัวอย่างคำตอบที่ดี (เฉพาะ text/number)",
 "min":0,"max":100,"unit":"หน่วย (เฉพาะ number ที่มีช่วงค่ามาตรฐาน)",
 "options":["ตัวเลือก"],
 "photo_hint":"รูปต้องเห็นอะไรชัดเจน (เฉพาะ photo)",
 "on_fail_require_note":true}]}]}
กติกา: แบ่ง 2-4 steps ตามลำดับงานจริง, รวม 6-14 fields,
ใช้ pass_fail กับรายการตรวจสภาพ (พร้อม on_fail_require_note:true),
ใช้ photo เมื่อควรมีหลักฐานภาพ (ใส่ photo_hint เสมอ),
ใช้ barcode ถ้ามีการระบุเครื่องจักร/พาเลท/เอกสารด้วยรหัส,
ใช้ number พร้อม min/max/unit เมื่อมีค่ามาตรฐาน,
เขียน tooltip ทุก field ให้คนหน้างานที่ไม่เคยทำก็เข้าใจ,
ปิดท้ายด้วย signature ถ้าเหมาะสม`;

export async function generateForm(tenantId: string, prompt: string): Promise<FormSchema> {
  const text = await complete(
    tenantId,
    "คุณคือผู้เชี่ยวชาญออกแบบฟอร์มตรวจสอบสำหรับคลังสินค้าและโรงงานผลิต จงออกแบบฟอร์มดิจิทัลจากคำขอนี้:\n\n" +
      prompt +
      "\n\n" +
      SCHEMA_SPEC,
    null
  );
  return sanitizeSchema(extractJson(text));
}

export async function refineForm(tenantId: string, schema: FormSchema, instruction: string): Promise<FormSchema> {
  const text = await complete(
    tenantId,
    "นี่คือ schema ฟอร์มปัจจุบัน:\n" +
      JSON.stringify(schema) +
      "\n\nจงแก้ไขตามคำสั่งนี้: " +
      instruction +
      "\n\nคงส่วนที่ไม่เกี่ยวข้องไว้เหมือนเดิม แล้วตอบกลับ schema ฉบับเต็มหลังแก้\n\n" +
      SCHEMA_SPEC,
    null
  );
  return sanitizeSchema(extractJson(text));
}

export async function formFromImage(tenantId: string, base64: string, mediaType: string): Promise<FormSchema> {
  const text = await complete(
    tenantId,
    "รูปที่แนบคือฟอร์มกระดาษ/เอกสารเดิมที่ใช้ในโรงงานหรือคลังสินค้า จงอ่าน layout และช่องกรอกทั้งหมด " +
      "แล้วแปลงเป็นฟอร์มดิจิทัล เก็บข้อมูลครบเท่าเดิม จัดลำดับขั้นตามการใช้งานจริง\n\n" +
      SCHEMA_SPEC,
    { base64, mediaType }
  );
  return sanitizeSchema(extractJson(text));
}

export interface PhotoCheck {
  ok: boolean;
  reason: string;
}
export async function checkPhoto(
  tenantId: string,
  base64: string,
  mediaType: string,
  hint: string,
  label: string
): Promise<PhotoCheck> {
  const text = await complete(
    tenantId,
    `รูปที่แนบถูกถ่ายเพื่อตอบข้อ "${label}" ในฟอร์มตรวจสอบหน้างาน เงื่อนไขรูปที่ต้องการ: "${
      hint || "เห็นสิ่งที่ตรวจชัดเจน"
    }"\nจงตัดสินว่ารูปนี้ใช้ได้หรือไม่ ตอบเป็น JSON เดียว: {"ok":true/false,"reason":"เหตุผลสั้นๆ ภาษาไทย"}`,
    { base64, mediaType },
    500
  );
  const r = extractJson(text) as Record<string, unknown>;
  return { ok: !!r.ok, reason: String(r.reason || "") };
}
