import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import StudioClient from "./StudioClient";
import type { FormSchema } from "@/lib/form-schema";

export const dynamic = "force-dynamic";

export interface FormRow {
  id: string;
  title: string;
  icon: string;
  schema: FormSchema;
  created_by_name: string;
}

export default async function StudioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManage(session.role))
    return (
      <div style={{ color: "var(--ink-2)" }}>
        บัญชีของคุณเป็นระดับ Operator — ไปที่แท็บ “กรอกฟอร์ม” เพื่อใช้งานได้เลย
      </div>
    );

  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, title, icon, schema")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const forms: FormRow[] = (data || []).map((f) => ({
    id: f.id as string,
    title: f.title as string,
    icon: f.icon as string,
    schema: f.schema as FormSchema,
    created_by_name: "",
  }));

  return <StudioClient initialForms={forms} />;
}
