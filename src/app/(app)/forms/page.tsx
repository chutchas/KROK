import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countFields, type FormSchema } from "@/lib/form-schema";
import FormsListClient, { type FormListItem } from "./FormsListClient";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, title, icon, schema")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const forms: FormListItem[] = ((data || []) as { id: string; title: string; icon: string; schema: FormSchema }[]).map(
    (f) => ({ id: f.id, title: f.title, icon: f.icon, steps: f.schema.steps.length, fields: countFields(f.schema) })
  );

  return <FormsListClient forms={forms} />;
}
