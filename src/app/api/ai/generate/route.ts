import { sm } from "@/lib/server-msg";
import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { aiRateLimited } from "@/lib/rate-limit";
import { generateForm, refineForm } from "@/lib/ai";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await aiRateLimited(session.userId, "generate"))
    return NextResponse.json({ error: await sm("เรียกใช้ AI ถี่เกินไป — รอสักครู่แล้วลองใหม่") }, { status: 429 });
  if (!canManage(session.role))
    return NextResponse.json({ error: await sm("ไม่มีสิทธิ์สร้างฟอร์ม") }, { status: 403 });

  let body: { prompt?: string; schema?: unknown; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const credit = await consumeAiCredit(session.tenantId, "form_gen");
  if (!credit.ok)
    return NextResponse.json(
      { error: `ใช้เครดิต “${credit.label}” ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max}) — อัปเกรดแพ็กเกจได้ที่เมนู “แพ็กเกจ”` },
      { status: 402 }
    );

  try {
    let schema: FormSchema;
    if (body.instruction && body.schema) {
      schema = await refineForm(sanitizeSchema(body.schema), body.instruction.slice(0, 500), { tenantId: session.tenantId });
    } else if (body.prompt) {
      schema = await generateForm(body.prompt.slice(0, 2000), { tenantId: session.tenantId });
    } else {
      return NextResponse.json({ error: await sm("ต้องมี prompt หรือ instruction") }, { status: 400 });
    }
    return NextResponse.json({ schema });
  } catch (e) {
    console.error("ai/generate", e);
    return NextResponse.json(
      { error: e instanceof Error ? await sm(e.message) : "AI ผิดพลาด" },
      { status: 500 }
    );
  }
}
