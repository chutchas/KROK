import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeSchema, type FormSchema } from "./form-schema";

const MODEL = process.env.KROK_AI_MODEL || "claude-sonnet-4-5";

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: key });
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

// ---- ดึง JSON ออกจากคำตอบแบบทนทาน ----
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("AI ไม่ได้ตอบเป็น JSON");
  return JSON.parse(body.slice(start, end + 1));
}

async function ask(
  content: Anthropic.MessageParam["content"],
  maxTokens = 3000
): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function generateForm(prompt: string): Promise<FormSchema> {
  const text = await ask(
    "คุณคือผู้เชี่ยวชาญออกแบบฟอร์มตรวจสอบสำหรับคลังสินค้าและโรงงานผลิต จงออกแบบฟอร์มดิจิทัลจากคำขอนี้:\n\n" +
      prompt +
      "\n\n" +
      SCHEMA_SPEC
  );
  return sanitizeSchema(extractJson(text));
}

export async function refineForm(schema: FormSchema, instruction: string): Promise<FormSchema> {
  const text = await ask(
    "นี่คือ schema ฟอร์มปัจจุบัน:\n" +
      JSON.stringify(schema) +
      "\n\nจงแก้ไขตามคำสั่งนี้: " +
      instruction +
      "\n\nคงส่วนที่ไม่เกี่ยวข้องไว้เหมือนเดิม แล้วตอบกลับ schema ฉบับเต็มหลังแก้\n\n" +
      SCHEMA_SPEC
  );
  return sanitizeSchema(extractJson(text));
}

export async function formFromImage(base64: string, mediaType: string): Promise<FormSchema> {
  const text = await ask([
    {
      type: "image",
      source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 },
    },
    {
      type: "text",
      text:
        "รูปที่แนบคือฟอร์มกระดาษ/เอกสารเดิมที่ใช้ในโรงงานหรือคลังสินค้า จงอ่าน layout และช่องกรอกทั้งหมด " +
        "แล้วแปลงเป็นฟอร์มดิจิทัล เก็บข้อมูลครบเท่าเดิม จัดลำดับขั้นตามการใช้งานจริง\n\n" +
        SCHEMA_SPEC,
    },
  ]);
  return sanitizeSchema(extractJson(text));
}

export interface PhotoCheck {
  ok: boolean;
  reason: string;
}
export async function checkPhoto(
  base64: string,
  mediaType: string,
  hint: string,
  label: string
): Promise<PhotoCheck> {
  const text = await ask(
    [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 },
      },
      {
        type: "text",
        text:
          `รูปที่แนบถูกถ่ายเพื่อตอบข้อ "${label}" ในฟอร์มตรวจสอบหน้างาน เงื่อนไขรูปที่ต้องการ: "${
            hint || "เห็นสิ่งที่ตรวจชัดเจน"
          }"\nจงตัดสินว่ารูปนี้ใช้ได้หรือไม่ ตอบเป็น JSON เดียว: {"ok":true/false,"reason":"เหตุผลสั้นๆ ภาษาไทย"}`,
      },
    ],
    500
  );
  const r = extractJson(text) as Record<string, unknown>;
  return { ok: !!r.ok, reason: String(r.reason || "") };
}
