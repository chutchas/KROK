import "server-only";
import { repairFormulas } from "@/lib/formula";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { sanitizeSchema, type FormSchema } from "./form-schema";
import { ICON_KEY_LIST } from "./form-icons";
import { getAdminClient } from "./supabase/admin";
import { PURPOSE_NEEDS_VISION as PURPOSE_NEEDS_VISION_MAP, type AiPurpose } from "./ai-purpose";
import { parseExtractResult as parseExtract, type ExtractKey as EK } from "./doc-extract";
import { tileForReading } from "./image-tiles";

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

// ============================================================
// purpose — งานแต่ละชนิดตั้งค่า provider/model/key แยกกันได้
//   form_gen        สร้าง/แก้ฟอร์มจาก prompt   (ไม่ต้อง vision, ปริมาณต่ำ, ฉลาด)
//   form_from_image สร้างฟอร์มจากรูปฟอร์มเดิม  (vision, ปริมาณต่ำ, ฉลาด)
//   photo_check     ตรวจรูปหน้างาน             (vision, ปริมาณสูง, ถูก)
//   doc_extract     ดึงข้อมูลจากเอกสาร         (vision, ปริมาณสูง, ถูก + OCR ไทย)
// ============================================================
export {
  AI_PURPOSES,
  PURPOSE_NEEDS_VISION,
  PURPOSE_LABELS,
  PURPOSE_HINTS,
  isAiPurpose,
  type AiPurpose,
} from "./ai-purpose";

const PROFILE_COLS = "provider, model, base_url, azure_endpoint, azure_api_version, api_key, enabled";

function rowToConfig(data: Record<string, unknown>): ProviderConfig {
  const provider = ((data.provider as string) || "qwen") as Provider;
  return {
    provider,
    apiKey: (data.api_key as string) || "",
    model: (data.model as string) || DEFAULTS[provider].model,
    baseURL: (data.base_url as string) || DEFAULTS[provider].baseURL,
    azureEndpoint: (data.azure_endpoint as string) || undefined,
    azureApiVersion: (data.azure_api_version as string) || "2024-08-01-preview",
  };
}

// ลำดับการเลือกคีย์:
//   profile ของ purpose → profile 'form_gen' (ตัวตั้งต้น)
//   → platform_ai_settings (ของเดิม เผื่อยังไม่ได้รัน migration) → env
// ตั้งค่าตัวเดียวก็ใช้ได้ทั้งระบบ แล้วค่อยแยกเฉพาะ purpose ที่อยากประหยัด
export async function resolveConfig(purpose: AiPurpose = "form_gen"): Promise<ProviderConfig> {
  const admin = getAdminClient();
  if (admin) {
    const { data } = await admin
      .from("platform_ai_profiles")
      .select(PROFILE_COLS)
      .eq("purpose", purpose)
      .maybeSingle();
    if (data && data.enabled !== false && data.api_key) return rowToConfig(data);

    if (purpose !== "form_gen") {
      const { data: def } = await admin
        .from("platform_ai_profiles")
        .select(PROFILE_COLS)
        .eq("purpose", "form_gen")
        .maybeSingle();
      if (def && def.enabled !== false && def.api_key) return rowToConfig(def);
    }

    // ของเดิม (0017) — เผื่อ deploy โค้ดก่อนรัน migration 0027
    const { data: legacy } = await admin
      .from("platform_ai_settings")
      .select("provider, model, base_url, azure_endpoint, azure_api_version, api_key")
      .eq("id", true)
      .maybeSingle();
    if (legacy && legacy.api_key) return rowToConfig(legacy);
  }
  return envConfig();
}

export interface ImageInput {
  base64: string;
  mediaType: string;
  /** คำอธิบายรูปที่ส่งให้ AI ก่อนรูปนั้น (เช่น "หน้า 1 — ครึ่งบนแบบขยาย") */
  label?: string;
}

interface CompleteOpts {
  /** 0 = คัดลอกตามจริง ไม่เรียบเรียงเอง (งานอ่านเอกสาร) · ไม่ระบุ = ค่าเริ่มต้นของผู้ให้บริการ */
  temperature?: number;
  /** workspace ที่ใช้ (บันทึก token เพื่อคิดต้นทุน) */
  tenantId?: string | null;
}

/** บริบทของการเรียก AI จาก route (ใช้บันทึกต้นทุนต่อ workspace) */
export interface AiCtx {
  tenantId?: string | null;
}

interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** บันทึก token จริงของการเรียกครั้งนี้ (0058) — ล้มเหลว/ยังไม่รัน migration = ข้าม ไม่กระทบงาน */
async function recordUsage(cfg: ProviderConfig, purpose: AiPurpose, tenantId: string | null | undefined, c: Completion) {
  if (!c.inputTokens && !c.outputTokens) return;
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("ai_token_usage").insert({
      tenant_id: tenantId ?? null, purpose, provider: cfg.provider, model: cfg.model,
      input_tokens: Math.max(0, Math.round(c.inputTokens)), output_tokens: Math.max(0, Math.round(c.outputTokens)),
    });
  } catch { /* best-effort */ }
}

/** รุ่นที่ไม่รับ temperature (เช่น รุ่น reasoning บางรุ่น) ตอบ 400 → ลองใหม่โดยไม่ส่ง */
const isTemperatureRejected = (e: unknown) => /temperature/i.test(e instanceof Error ? e.message : String(e));

// ---- ตัวเรียกกลาง: ส่ง prompt (+รูป 0..n) แล้วได้ text กลับ ----
async function complete(
  purpose: AiPurpose,
  userText: string,
  image: ImageInput | ImageInput[] | null,
  maxTokens = 3000,
  opts: CompleteOpts = {}
): Promise<string> {
  const cfg = await resolveConfig(purpose);
  if (!cfg.apiKey)
    throw new Error("ระบบยังไม่ได้ตั้งค่า AI — โปรดให้ผู้ดูแลแพลตฟอร์มตั้งค่าที่เมนู Platform → AI");

  const images = image == null ? [] : Array.isArray(image) ? image : [image];
  const run = (o: CompleteOpts) =>
    cfg.provider === "anthropic" ? completeAnthropic(cfg, userText, images, maxTokens, o) : completeOpenAICompatible(cfg, userText, images, maxTokens, o);
  let c: Completion;
  try {
    c = await run(opts);
  } catch (e) {
    if (opts.temperature !== undefined && isTemperatureRejected(e)) c = await run({ ...opts, temperature: undefined });
    else throw e;
  }
  await recordUsage(cfg, purpose, opts.tenantId, c);
  return c.text;
}

// ---- Anthropic ----
async function completeAnthropic(
  cfg: ProviderConfig,
  userText: string,
  images: ImageInput[],
  maxTokens: number,
  opts: CompleteOpts
): Promise<Completion> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const content: Anthropic.MessageParam["content"] = [];
  images.forEach((img, i) => {
    if (img.label) content.push({ type: "text", text: `รูปที่ ${i + 1}: ${img.label}` });
    else if (images.length > 1) content.push({ type: "text", text: `หน้า ${i + 1}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType as "image/jpeg", data: img.base64 },
    });
  });
  content.push({ type: "text", text: userText });
  const msg = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    messages: [{ role: "user", content }],
  });
  const u = msg.usage as { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined;
  return {
    text: msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n"),
    inputTokens: (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0),
    outputTokens: u?.output_tokens ?? 0,
  };
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
  images: ImageInput[],
  maxTokens: number,
  opts: CompleteOpts
): Promise<Completion> {
  const client = openAIClient(cfg);
  // สำคัญ: ไม่มีรูป → ส่ง content เป็น string ธรรมดา
  // ถ้าส่งเป็น array แบบ multimodal โมเดล text (qwen-plus/qwen-max) จะตอบ 403 Model access denied
  const content: OpenAI.Chat.Completions.ChatCompletionUserMessageParam["content"] =
    images.length > 0
      ? [
          { type: "text", text: userText },
          ...images.flatMap((img, i) => [
            ...(img.label ? [{ type: "text" as const, text: `รูปที่ ${i + 1}: ${img.label}` }] : []),
            { type: "image_url" as const, image_url: { url: `data:${img.mediaType};base64,${img.base64}`, detail: "high" as const } },
          ]),
        ]
      : userText;
  const res = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    messages: [{ role: "user", content }],
  });
  return {
    text: res.choices[0]?.message?.content || "",
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
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

// วิธีเขียนสูตร (ใช้ทั้งออกแบบใหม่และคัดลอกจากเอกสาร) — อ้างด้วย id เสมอ ไม่ใช่ชื่อ
const FORMULA_SPEC = `สูตรคำนวณ (ใช้เมื่อมีค่าที่ "คำนวณได้จากช่องอื่น" เช่น ผลต่าง ผลรวม เปอร์เซ็นต์ ค่าเฉลี่ย จำนวนเงิน):
- ฟิลด์ type "formula" = คนไม่ต้องกรอก ระบบคำนวณให้ · ใส่ "formula" และ "decimals" (0-4) · ใส่ unit/min/max ได้ (นอกช่วง = ไม่ผ่าน) · required:false
- อ้างฟิลด์ตัวเลขด้วย {id ของฟิลด์} เช่น {weight_after} - {weight_before} · อ้างได้เฉพาะฟิลด์ type number หรือ formula
- รวมทั้งคอลัมน์ของตาราง: SUM({id ตาราง.id คอลัมน์}) เช่น SUM({items.amount}) (ใช้ทั้งคอลัมน์ได้เฉพาะใน SUM AVG MIN MAX COUNT)
- คอลัมน์ type "formula" ในตาราง = คำนวณทีละแถว อ้างคอลัมน์อื่นในแถวเดียวกันด้วย {id คอลัมน์} เช่น {qty} * {price}
- ใช้ได้: + - * / ^ ( ) > < >= <= = <> และ SUM AVG MIN MAX COUNT ROUND(x,n) ROUNDUP ROUNDDOWN ABS SQRT IF(เงื่อนไข,ค่าจริง,ค่าเท็จ) AND OR NOT · คอลัมน์ pass_fail: ผ่าน=1 ไม่ผ่าน=0 · checkbox: ติ๊ก=1
- id ที่อ้างต้องตรงกับ id ที่ประกาศในฟอร์มนี้ทุกตัว ห้ามอ้างฟิลด์ข้อความ/ตัวเลือก และอย่าใส่สูตรถ้าไม่มีค่าที่คำนวณได้จริง`;

export const SCHEMA_SPEC = `ตอบกลับเป็น JSON object เดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON ตาม spec นี้:
{"title":"ชื่อฟอร์ม","description":"อธิบายสั้นๆ ว่าใช้เมื่อไหร่","icon":"ชื่อไอคอน 1 ชื่อจากรายการนี้ที่เข้ากับเอกสารที่สุด: ${ICON_KEY_LIST.join(", ")}",
"steps":[{"title":"ชื่อขั้นตอน","fields":[{
 "id":"snake_case_id","type":"text|number|select|checkbox|pass_fail|photo|barcode|signature|datetime|table|formula",
 "label":"คำถาม/สิ่งที่ต้องตรวจ (ใช้ภาษาเดียวกับคำขอ)","required":true,
 "tooltip":"คำแนะนำสั้นๆ ช่วยให้กรอกถูกต้อง เช่น จุดที่ต้องดู วิธีวัด",
 "example":"ตัวอย่างคำตอบที่ดี (เฉพาะ text/number)",
 "min":0,"max":100,"unit":"หน่วย (เฉพาะ number ที่มีช่วงค่ามาตรฐาน)",
 "options":["ตัวเลือก"],
 "fail_options":["ตัวเลือกที่แปลว่าไม่ผ่าน เช่น ชำรุด (เฉพาะ select/checkbox · ต้องอยู่ใน options)"],
 "photo_hint":"รูปต้องเห็นอะไรชัดเจน (เฉพาะ photo)",
 "on_fail_require_note":true,
 "columns":[{"id":"snake_id","label":"หัวคอลัมน์","type":"text|number|select|formula|pass_fail|checkbox|datetime|scan","width":2,"options":["เฉพาะ select"],"fail_options":["ตัวเลือกที่แปลว่าไม่ผ่าน (เฉพาะ select)"],"formula":"เฉพาะ formula","decimals":2}],
 "min_rows":3,
 "formula":"สูตร (เฉพาะ type formula)","decimals":2}]}]}
สำคัญสูงสุด: ถ้าผู้ใช้ระบุจำนวนฟิลด์ จำนวนขั้นตอน หรือสิ่งที่ต้องมี/ไม่ต้องมี (เช่น "5 ช่อง", "3 ขั้นตอน", "ไม่ต้องมีรูป") ให้ทำตามคำขอนั้นก่อนกฎทั่วไปเสมอ
กติกา (เป็นค่าแนะนำ ปรับตามความเหมาะสมของงานได้ ไม่ใช่กฎตายตัว):
โดยทั่วไปแบ่ง 2-4 steps ตามลำดับงานจริง (งานสั้นใช้ step เดียวได้ งานยาว/หลายส่วนมีมากกว่า 4 ได้), จำนวนฟิลด์ปกติ 6-14 แต่ปรับให้พอดีเนื้องาน (งานเล็กน้อยกว่านี้ได้ งานละเอียดมากกว่านี้ได้),
ใช้ pass_fail กับรายการตรวจสภาพ (พร้อม on_fail_require_note:true),
select ที่มีตัวเลือกแบบ ปกติ/ชำรุด/ขาด ให้ใส่ fail_options เป็นตัวเลือกที่แปลว่าไม่ผ่าน,
ใช้ photo เมื่อควรมีหลักฐานภาพ (ใส่ photo_hint เสมอ),
ใช้ barcode ถ้ามีการระบุเครื่องจักร/พาเลท/เอกสารด้วยรหัส,
ใช้ number พร้อม min/max/unit เมื่อมีค่ามาตรฐาน,
เขียน tooltip ทุก field ให้คนหน้างานที่ไม่เคยทำก็เข้าใจ,
ปิดท้ายด้วย signature ถ้าเหมาะสม,
${FORMULA_SPEC}
สำคัญ: เขียนทุกข้อความในฟอร์ม (title, label, tooltip, example, options) ด้วยภาษาเดียวกับคำขอของผู้ใช้ (ไทยหรืออังกฤษ) ห้ามปนภาษาอื่นเช่นจีนเด็ดขาด`;

export async function generateForm(prompt: string, ctx: AiCtx = {}): Promise<FormSchema> {
  const text = await complete(
    "form_gen",
    "คุณคือผู้เชี่ยวชาญออกแบบฟอร์มตรวจสอบสำหรับคลังสินค้าและโรงงานผลิต จงออกแบบฟอร์มดิจิทัลจากคำขอนี้:\n\n" +
      prompt +
      "\n\n" +
      SCHEMA_SPEC,
    null,
    3000,
    { tenantId: ctx.tenantId }
  );
  return repairFormulas(sanitizeSchema(extractJson(text)));
}

export async function refineForm(schema: FormSchema, instruction: string, ctx: AiCtx = {}): Promise<FormSchema> {
  const text = await complete(
    "form_gen",
    "นี่คือ schema ฟอร์มปัจจุบัน:\n" +
      JSON.stringify(schema) +
      "\n\nจงแก้ไขตามคำสั่งนี้: " +
      instruction +
      "\n\nคงส่วนที่ไม่เกี่ยวข้องไว้เหมือนเดิม แล้วตอบกลับ schema ฉบับเต็มหลังแก้\n\n" +
      SCHEMA_SPEC,
    null,
    3000,
    { tenantId: ctx.tenantId }
  );
  return repairFormulas(sanitizeSchema(extractJson(text)));
}

// spec สำหรับ "คัดลอกฟอร์มเดิมจากรูป/ไฟล์" — เน้นความเหมือน ไม่ใช่ออกแบบใหม่
export const REPLICATE_SPEC = `ตอบกลับเป็น JSON object เดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON ตาม spec นี้:
{"title":"ชื่อฟอร์มตามที่พิมพ์บนเอกสาร","description":"อธิบายสั้นๆ (ถ้าเอกสารมี)","icon":"ชื่อไอคอน 1 ชื่อจากรายการนี้ที่เข้ากับเอกสารที่สุด: ${ICON_KEY_LIST.join(", ")}",
"steps":[{"title":"ชื่อหัวข้อ/section ตามเอกสาร","fields":[{
 "id":"snake_case_id",
 "type":"text|number|select|checkbox|pass_fail|photo|barcode|signature|datetime|table",
 "label":"ข้อความ/หัวข้อช่องกรอก คัดลอกคำต่อคำจากเอกสาร","required":false,
 "width":"full|half",
 "options":["ตัวเลือกตามที่พิมพ์ในเอกสาร"],
 "columns":[{"id":"snake_id","label":"หัวคอลัมน์ตามเอกสาร","type":"text|number|select|formula|pass_fail|checkbox|datetime|scan","width":2,"formula":"เฉพาะ formula"}],
 "formula":"สูตร (เฉพาะ type formula)",
 "min":0,"max":100,"unit":"หน่วยที่พิมพ์ข้างช่อง (ถ้ามี)"}]}]}

โหมดนี้คือ "ทำสำเนาดิจิทัลของฟอร์มเดิม" ไม่ใช่ออกแบบฟอร์มใหม่ ให้ยึดหลักนี้อย่างเคร่งครัด:
1. เก็บ "ทุก" ช่องกรอก/ช่องว่าง/ช่องติ๊ก/บรรทัดที่คนต้องเขียนหรือเลือก ให้ครบ ห้ามข้ามหรือยุบรวมช่อง และห้ามเพิ่มช่องที่ไม่มีในเอกสาร ไม่จำกัดจำนวนฟิลด์ (มี 30+ ก็ต้องครบ)
2. เรียงลำดับฟิลด์ตามเอกสารจริง (บนลงล่าง ซ้ายไปขวา)
3. ทุกหัวข้อ/section/กล่องในเอกสาร = 1 step โดยใช้ชื่อหัวข้อนั้นเป็น title ของ step ถ้าเอกสารไม่มีการแบ่งหัวข้อชัดเจน ให้ใช้ step เดียว
4. คัดลอก label คำต่อคำตามภาษาที่พิมพ์ในเอกสาร ห้ามแปลหรือเรียบเรียงใหม่
5. เดาชนิดฟิลด์จากลักษณะช่องจริง: เส้น/กล่องว่างให้เขียน = text (หรือ number ถ้าเป็นตัวเลข/ค่าที่วัด); ช่องติ๊กหลายอัน = checkbox; ผ่าน/ไม่ผ่าน หรือ ใช่/ไม่ใช่ หรือ OK/NG = pass_fail; เลือกได้อันเดียวจากรายการ = select พร้อม options ตามจริง; ช่องวันที่/เวลา = datetime; เส้นเซ็นชื่อ = signature; ช่องแนบรูป/ถ่ายรูป = photo; รหัส/serial/barcode ที่ต้องสแกน = barcode
6. select/checkbox ให้ใส่ options ตามที่พิมพ์ในเอกสาร "ทุกตัวเลือก" คำต่อคำ
7. required = true เฉพาะช่องที่เอกสารระบุว่าบังคับ (เครื่องหมาย * หรือคำว่าบังคับ) นอกนั้น false
8. ใส่ min/max/unit เฉพาะเมื่อเอกสารพิมพ์ค่ามาตรฐาน/หน่วยไว้จริง ห้ามแต่งเพิ่ม
9. ห้ามเพิ่ม tooltip/example/on_fail_require_note เอง (โหมดนี้เน้นเหมือนของเดิม ไม่ใช่ปรับปรุง)
10. ถ้ารูปมีหลายหน้า/หลายส่วนต่อกัน ให้อ่านทุกหน้าจนครบ
11. ถ้าเอกสารมี "ตารางรายการ" (เช่น รายการสินค้า มีหัวคอลัมน์ Item/รายการ/จำนวน/ราคา/หน่วย) ให้ใช้ type "table" หนึ่งฟิลด์ พร้อม columns ตามหัวคอลัมน์จริง (label คัดลอกจากเอกสาร, type = number สำหรับจำนวน/ราคา ไม่งั้น text, width = ความกว้างสัมพัทธ์ 1-6) ตาราง 1 อัน = 1 field type table (อย่าแตกเป็นหลายฟิลด์) และตั้ง width ของฟิลด์ตารางเป็น full
12. width = จัดวางให้เหมือนต้นฉบับ: ถ้าเอกสารเรียงช่องเป็น "คอลัมน์เดียว" (บนลงล่าง) ให้ทุกฟิลด์เป็น "full"; ถ้ามีสองช่องสั้นๆ อยู่บรรทัดเดียวกันจริง ให้จับคู่เป็น "half" ทั้งคู่; ฟิลด์ยาว (ชื่อบริษัท, ที่อยู่, รายการสินค้า, หมายเหตุ, ช่องเซ็นชื่อ) ให้ "full" เสมอ
13. คอลัมน์ตาราง: ช่องติ๊ก ✓ = checkbox, OK/NG หรือ ผ่าน/ไม่ผ่าน = pass_fail, วันที่ = datetime, รหัสสินค้า/serial ที่สแกน = scan, คอลัมน์ "รวม/Amount/จำนวนเงิน" ที่ได้จากคอลัมน์อื่น = formula; ช่อง "รวมทั้งสิ้น/Total" ใต้ตาราง = ฟิลด์ type formula
${FORMULA_SPEC}
สำคัญ: ผลลัพธ์ต้องใกล้เคียงฟอร์มเดิม 90%+ ทั้งจำนวนฟิลด์และโครงสร้าง เพื่อให้ผู้ใช้แก้ต่อได้ง่าย`;

export async function formFromImage(
  images: ImageInput[] | { base64: string; mediaType: string },
  /** ข้อความจริงที่ดึงจาก PDF (หน้าละ 1 สตริง) — สะกดถูกต้อง ใช้แก้คำที่ AI อ่านจากรูปเพี้ยน */
  pdfText: string[] = [],
  ctx: AiCtx = {}
): Promise<FormSchema> {
  const pages = Array.isArray(images) ? images : [images];
  const imgs = await tileForReading(pages);
  const zoomed = imgs.length > pages.length;
  const text = pdfText.map((t) => t.trim()).filter(Boolean).length
    ? pdfText.map((t, i) => `--- หน้า ${i + 1} ---\n${t.trim() || "(หน้านี้ไม่มีข้อความในไฟล์ — อ่านจากรูป)"}`).join("\n").slice(0, 20000)
    : "";
  const out = await complete(
    "form_from_image",
    "รูป/ไฟล์ที่แนบคือฟอร์มเดิมที่ใช้จริง (กระดาษ/เอกสาร/PDF) หน้าที่ของคุณคือทำ 'สำเนาดิจิทัล' ให้เหมือนของเดิมมากที่สุด " +
      (pages.length > 1 ? `เอกสารมี ${pages.length} หน้า (แนบมาตามลำดับ) ` : "") +
      "อ่านทุกหัวข้อและช่องกรอกทั้งหมดในทุกหน้า แล้วสร้าง schema ที่มีฟิลด์ครบและโครงสร้างใกล้เคียงของเดิม\n\n" +
      (zoomed
        ? "รูปที่แนบมีทั้ง \"ทั้งหน้า\" และ \"ครึ่งบน/ครึ่งล่างแบบขยาย\" ของหน้าเดียวกัน (ซ้อนกันเล็กน้อยตรงรอยต่อ): " +
          "ใช้รูปทั้งหน้าดูโครงสร้างและลำดับ · อ่านตัวสะกดของ label/ตัวเลือก/หัวคอลัมน์จากรูปขยาย · ช่องที่อยู่ตรงรอยต่อจะเห็นในทั้งสองรูป ให้นับเป็นช่องเดียว ห้ามสร้างซ้ำ\n\n"
        : "") +
      (text
        ? "ข้อความต้นฉบับที่ดึงจากไฟล์ PDF โดยตรง (ตัวสะกดถูกต้อง 100% แต่ลำดับ/การขึ้นบรรทัดอาจไม่ตรงกับหน้าเอกสาร):\n" +
          "<<<\n" + text + "\n>>>\n" +
          "กฎการใช้ข้อความนี้: label, ตัวเลือก, หัวคอลัมน์, ชื่อฟอร์ม และชื่อหัวข้อ ให้คัดลอกการสะกดจากข้อความนี้เมื่อตรงกับสิ่งที่เห็นในรูป " +
          "(ห้ามสะกดใหม่ ห้ามแต่งคำ) · ใช้รูปเพื่อดูโครงสร้าง ตำแหน่ง และชนิดช่องกรอก · ข้อความที่เป็นคำอธิบาย/หมายเหตุท้ายเอกสารไม่ต้องสร้างเป็นช่องกรอก\n\n"
        : "ถ้าอ่านคำไหนไม่ชัด ให้เลือกคำที่สมเหตุสมผลในบริบทของฟอร์มนั้น ห้ามใส่ตัวอักษรที่ไม่มีความหมาย\n\n") +
      REPLICATE_SPEC,
    imgs,
    8000,
    { temperature: 0, tenantId: ctx.tenantId }
  );
  return repairFormulas(sanitizeSchema(extractJson(out)));
}

export interface PhotoCheck {
  ok: boolean;
  reason: string;
}
export async function checkPhoto(
  base64: string,
  mediaType: string,
  hint: string,
  label: string,
  ctx: AiCtx = {}
): Promise<PhotoCheck> {
  const text = await complete(
    "photo_check",
    `รูปที่แนบถูกถ่ายเพื่อตอบข้อ "${label}" ในฟอร์มตรวจสอบหน้างาน เงื่อนไขรูปที่ต้องการ: "${
      hint || "เห็นสิ่งที่ตรวจชัดเจน"
    }"\nจงตัดสินว่ารูปนี้ใช้ได้หรือไม่ ตอบเป็น JSON เดียว: {"ok":true/false,"reason":"เหตุผลสั้นๆ ภาษาไทย"}`,
    { base64, mediaType },
    500,
    { tenantId: ctx.tenantId }
  );
  const r = extractJson(text) as Record<string, unknown>;
  return { ok: !!r.ok, reason: String(r.reason || "") };
}

// ============================================================
// ดึงข้อมูลจากเอกสาร (doc extract)
// ใช้กับ "เอกสารภายนอก" ที่เราคุมต้นทางไม่ได้ เช่น ใบส่งของ/COA/ใบรับรอง
// ไม่ใช่การสแกนฟอร์มของเราที่กรอกด้วยมือย้อนเข้าระบบ
//
// หมายเหตุ: บาร์โค้ด/QR ไม่ผ่านทางนี้ — ถอดรหัสบนเครื่องผู้ใช้ ไม่มีค่าใช้จ่าย
// ============================================================

export {
  parseExtractResult,
  type DocExtractResult,
  type ExtractKey,
  type ExtractedValue,
} from "./doc-extract";

export async function extractDoc(
  keys: EK[],
  docHint: string,
  image: ImageInput,
  ctx: AiCtx = {}
): Promise<import("./doc-extract").DocExtractResult> {
  if (keys.length === 0) return { values: [], not_found: [] };

  const spec = keys
    .map((k) => {
      const bits = [`- "${k.key}"`];
      if (k.hint) bits.push(`(${k.hint})`);
      if (k.type === "number") bits.push("[ตัวเลขล้วน ไม่ต้องมีหน่วยหรือคอมมา]");
      if (k.type === "datetime") bits.push("[รูปแบบ YYYY-MM-DD หรือ YYYY-MM-DDTHH:mm]");
      if (k.type === "select") bits.push(`[เลือกจาก: ${(k.options ?? []).join(" | ")}]`);
      return bits.join(" ");
    })
    .join("\n");

  const text = await complete(
    "doc_extract",
    `รูปที่แนบคือเอกสารจริงจากหน้างาน${docHint ? ` (${docHint})` : ""}\n` +
      `จงอ่านเอกสารแล้วดึงเฉพาะค่าต่อไปนี้:\n${spec}\n\n` +
      `กติกาเด็ดขาด:\n` +
      `1. คัดค่าตามที่พิมพ์/เขียนบนเอกสารเป๊ะ ๆ ห้ามแปล ห้ามเรียบเรียง ห้ามเติมข้อมูลที่ไม่มี\n` +
      `2. ห้ามเดา — ถ้าอ่านไม่ออกหรือไม่มีในเอกสาร ให้ใส่ชื่อค่านั้นใน not_found แทน\n` +
      `3. confidence = ความมั่นใจจริง 0.0-1.0 (อ่านชัดเจน=สูง, เบลอ/ลายมือ/คลุมเครือ=ต่ำ)\n` +
      `4. ห้ามคืน key อื่นนอกเหนือจากรายการข้างบน\n\n` +
      `ตอบเป็น JSON object เดียวเท่านั้น:\n` +
      `{"values":[{"key":"ชื่อค่า","value":"ค่าที่อ่านได้","confidence":0.95}],"not_found":["ชื่อค่าที่ไม่เจอ"]}`,
    image,
    2000,
    { temperature: 0, tenantId: ctx.tenantId }
  );

  return parseExtract(extractJson(text), keys);
}

// ============================================================
// ทดสอบคีย์/รุ่นของ purpose หนึ่ง ๆ (ใช้ในหน้า Platform → AI)
// purpose ที่ต้อง vision จะแนบรูปทดสอบไปด้วย เพื่อให้จับได้ทันที
// ถ้าเผลอตั้งรุ่นที่ไม่รองรับรูป (เช่น qwen-plus จะตอบ 403 Model access denied)
// ============================================================
const TEST_IMAGE_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeUlEQVR4nO3PQQkAMAzAwKqpf0ETMxF7HINABFzm7H7dcEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFj125G4EPHrsLDgAAAABJRU5ErkJggg==";

export interface PingResult {
  ok: boolean;
  provider: Provider;
  model: string;
  vision: boolean;
  reply?: string;
  error?: string;
}

export async function pingModel(purpose: AiPurpose): Promise<PingResult> {
  const cfg = await resolveConfig(purpose);
  const vision = PURPOSE_NEEDS_VISION_MAP[purpose];
  const base = { provider: cfg.provider, model: cfg.model, vision };

  if (!cfg.apiKey) return { ...base, ok: false, error: "ยังไม่ได้ตั้ง API key" };

  try {
    const reply = vision
      ? await complete(
          purpose,
          'รูปที่แนบเป็นสี่เหลี่ยมสีเดียว ตอบชื่อสีนั้นเป็นคำเดียว',
          { base64: TEST_IMAGE_B64, mediaType: "image/png" },
          50
        )
      : await complete(purpose, 'ตอบกลับคำเดียวว่า "พร้อม"', null, 50);
    return { ...base, ok: true, reply: reply.trim().slice(0, 120) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เรียก LLM ไม่สำเร็จ";
    return {
      ...base,
      ok: false,
      error: vision && /denied|not support|invalid.*image|vision/i.test(msg)
        ? `รุ่นนี้ไม่รองรับรูปภาพ — งานนี้ต้องใช้โมเดลแบบ vision (${msg})`
        : msg,
    };
  }
}
