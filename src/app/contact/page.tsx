import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import ContactClient from "./ContactClient";

export const metadata: Metadata = { title: "ติดต่อเรา · KROK" };
export const dynamic = "force-dynamic";

// ไม่ต้องล็อกอิน · ล็อกอินอยู่ = เติมชื่อ/อีเมล/workspace ให้ และกลับเข้าแอปได้
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const [{ from }, s] = await Promise.all([searchParams, getSession().catch(() => null)]);
  const me = s ? { name: s.displayName, email: s.email, company: s.tenantName } : null;
  const topic = from === "pricing" ? "billing" : me ? "usage" : "";
  return <ContactClient me={me} defaultTopic={topic} />;
}
