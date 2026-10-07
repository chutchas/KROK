import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = { title: "ติดต่อเรา · KROK" };

export default function ContactPage() {
  return <ContactClient />;
}
