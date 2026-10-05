import { sm } from "@/lib/server-msg";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { aiRateLimited } from "@/lib/rate-limit";
import { extractDoc, type ExtractKey } from "@/lib/ai";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_KEYS = 12;

// ดึงข้อมูลจากรูปเอกสารที่คนหน้างานถ่าย → คืนค่าที่อ่านได้พร้อม confidence
// ค่าที่คืนยังไม่ถูกบันทึกลงฟอร์ม — คนหน้างานต้องยืนยันก่อนเสมอ
//
// การสแกนบาร์โค้ด/QR ไม่ผ่าน route นี้ (ถอดรหัสบนเครื่องผู้ใช้ ไม่มีต้นทุน)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await aiRateLimited(session.userId, "doc_extract"))
    return NextResponse.json({ error: await sm("เรียกใช้ AI ถี่เกินไป — รอสักครู่แล้วลองใหม่") }, { status: 429 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const docHint = String(form.get("doc_hint") || "").slice(0, 300);

    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: await sm("ชนิดไฟล์ไม่รองรับ") }, { status: 400 });
    if (file.size > 8 * 1024 * 1024)
      return NextResponse.json({ error: await sm("ไฟล์ใหญ่เกิน 8MB") }, { status: 400 });

    let keys: ExtractKey[];
    try {
      const parsed = JSON.parse(String(form.get("keys") || "[]"));
      if (!Array.isArray(parsed)) throw new Error();
      keys = parsed
        .filter((k): k is Record<string, unknown> => !!k && typeof k === "object")
        .slice(0, MAX_KEYS)
        .map((k) => ({
          key: String(k.key ?? "").slice(0, 60),
          hint: k.hint ? String(k.hint).slice(0, 200) : undefined,
          type: ["text", "number", "datetime", "select"].includes(String(k.type))
            ? (String(k.type) as ExtractKey["type"])
            : "text",
          options: Array.isArray(k.options) ? k.options.slice(0, 20).map(String) : undefined,
        }))
        .filter((k) => k.key.length > 0);
    } catch {
      return NextResponse.json({ error: await sm("รายการค่าที่จะดึงไม่ถูกต้อง") }, { status: 400 });
    }
    if (keys.length === 0)
      return NextResponse.json({ error: await sm("ไม่ได้ระบุค่าที่จะดึง") }, { status: 400 });

    const credit = await consumeAiCredit(session.tenantId, "doc_extract");
    if (!credit.ok)
      return NextResponse.json(
        {
          error: `ใช้เครดิต “${credit.label}” ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max}) — กรอกด้วยมือได้ตามปกติ`,
        },
        { status: 402 }
      );

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractDoc(keys, docHint, { base64, mediaType: file.type }, { tenantId: session.tenantId });
    return NextResponse.json(result);
  } catch (e) {
    console.error("ai/extract-doc", e);
    return NextResponse.json(
      { error: e instanceof Error ? await sm(e.message) : "อ่านเอกสารไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
