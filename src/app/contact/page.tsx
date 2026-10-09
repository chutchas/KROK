import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ContactClient from "./ContactClient";

export const metadata: Metadata = { title: "ติดต่อเรา" };
export const dynamic = "force-dynamic";

// หน้าสาธารณะสำหรับคนนอก · ล็อกอินอยู่ = ไปหน้าในแอป (มี navbar เดิม)
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const [{ from }, s] = await Promise.all([searchParams, getSession().catch(() => null)]);
  if (s) redirect(from === "pricing" ? "/help/contact?topic=billing" : "/help/contact");
  return <ContactClient me={null} defaultTopic={from === "pricing" ? "billing" : ""} />;
}
