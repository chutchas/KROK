import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import HelpClient from "./HelpClient";

export const metadata: Metadata = { title: "คู่มือการใช้งาน" };

// คู่มือสั้น ๆ ในแอป (ค้นหาได้) — เนื้อหาจาก src/lib/help-articles.ts ที่เดียวกับปุ่ม "วิธีใช้"
export default async function HelpPage() {
  const s = await getSession();
  if (!s) redirect("/login?next=/help");
  return <HelpClient />;
}
