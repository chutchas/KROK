import { redirect } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getBrandLibrary } from "@/lib/branding-library";
import MediaClient from "./MediaClient";

export const dynamic = "force-dynamic";

// ตั้งค่า Workspace › คลังรูปภาพ (owner/admin)
export default async function WorkspaceMediaPage() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;
  const supabase = await createClient();
  // ยังไม่รัน 0056 = แจ้งในการ์ด ไม่ทำให้หน้าพัง
  const res = await getBrandLibrary(supabase, getAdminClient() ?? supabase, session.tenantId)
    .then((assets) => ({ assets, failed: false }))
    .catch(() => ({ assets: [], failed: true }));
  return <MediaClient assets={res.assets} failed={res.failed} />;
}
