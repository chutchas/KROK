import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { generateForm, refineForm } from "@/lib/ai";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างฟอร์ม" }, { status: 403 });

  let body: { prompt?: string; schema?: unknown; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    let schema: FormSchema;
    if (body.instruction && body.schema) {
      schema = await refineForm(sanitizeSchema(body.schema), body.instruction.slice(0, 500));
    } else if (body.prompt) {
      schema = await generateForm(body.prompt.slice(0, 2000));
    } else {
      return NextResponse.json({ error: "ต้องมี prompt หรือ instruction" }, { status: 400 });
    }
    return NextResponse.json({ schema });
  } catch (e) {
    console.error("ai/generate", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI ผิดพลาด" },
      { status: 500 }
    );
  }
}
