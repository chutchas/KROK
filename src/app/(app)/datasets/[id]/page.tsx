import { notFound } from "next/navigation";
import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DATASET_SELECT, rowToMeta, type DatasetRecord } from "@/lib/datasets";
import { formsUsingDataset } from "@/lib/datasets-server";
import DatasetDetailClient, { type SyncRun } from "./DatasetDetailClient";
import { getTenantPlan } from "@/lib/quota";
import { MAX_DATASET_ROWS } from "@/lib/datasets";

export const metadata = { title: "ชุดข้อมูล" };

export const dynamic = "force-dynamic";

const PREVIEW_ROWS = 300;

export default async function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await enforceMenu("datasets");
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("datasets")
    .select(`${DATASET_SELECT}, active_batch`)
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!row) notFound();
  const ds = rowToMeta(row as Record<string, unknown>);

  const [{ data: rows }, { data: runs }, usedBy, plan] = await Promise.all([
    supabase
      .from("dataset_rows")
      .select("data")
      .eq("dataset_id", id)
      .eq("batch", row.active_batch as string)
      .order("id", { ascending: true })
      .limit(PREVIEW_ROWS),
    supabase
      .from("dataset_sync_runs")
      .select("id, kind, status, rows_in, message, created_at")
      .eq("dataset_id", id)
      .order("created_at", { ascending: false })
      .limit(15),
    formsUsingDataset(supabase, session.tenantId, id),
    getTenantPlan(session.tenantId),
  ]);

  return (
    <DatasetDetailClient
      ds={ds}
      rows={((rows || []) as { data: DatasetRecord }[]).map((r) => r.data)}
      previewLimit={PREVIEW_ROWS}
      runs={(runs || []) as SyncRun[]}
      usedBy={usedBy}
      canEdit={canManage(session.role)}
      maxRows={Math.min(plan.maxDatasetRows, MAX_DATASET_ROWS)}
    />
  );
}
