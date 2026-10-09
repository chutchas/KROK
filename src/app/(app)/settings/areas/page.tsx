import { redirect } from "next/navigation";
import { T } from "@/i18n/T";
import { getSession, redirectNoSession } from "@/lib/session";
import { listAreas } from "./actions";
import AreasClient from "./AreasClient";

export const metadata = { title: "พื้นที่" };

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}><T k="page.ownerAdminOnly" /></div>;

  const res = await listAreas(true);
  return <AreasClient initial={"areas" in res ? res.areas : []} missing={"missing" in res && !!res.missing} />;
}
