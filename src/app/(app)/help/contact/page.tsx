import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TOPIC_OPTIONS, type ContactTopic } from "@/lib/contact";
import { ContactInApp } from "@/app/contact/ContactClient";

export const metadata: Metadata = { title: "ติดต่อทีม KROK" };
export const dynamic = "force-dynamic";

// ติดต่อทีม KROK จากในแอป (เมนูโปรไฟล์ / เมนูข้าง) — คนนอกใช้ /contact
export default async function HelpContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const [{ topic }, s] = await Promise.all([searchParams, getSession()]);
  if (!s) redirect("/login?next=/help/contact");
  const t: ContactTopic = (TOPIC_OPTIONS as readonly string[]).includes(topic ?? "") ? (topic as ContactTopic) : "usage";
  return <ContactInApp me={{ name: s.displayName, email: s.email, company: s.tenantName }} defaultTopic={t} />;
}
