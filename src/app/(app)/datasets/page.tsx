import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DATASET_SELECT, rowToMeta } from "@/lib/datasets";
import DatasetsClient from "./DatasetsClient";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const session = await enforceMenu("datasets");
  const supabase = await createClient();

  // ยังไม่ได้รัน migration 0030 → ได้ error → แสดงลิสต์ว่างพร้อมคำแนะนำ
  const { data, error } = await supabase
    .from("datasets")
    .select(DATASET_SELECT)
    .eq("tenant_id", session.tenantId)
    .order("name", { ascending: true });

  return (
    <DatasetsClient
      items={((data || []) as Record<string, unknown>[]).map(rowToMeta)}
      canEdit={canManage(session.role)}
      missingTable={!!error}
    />
  );
}
