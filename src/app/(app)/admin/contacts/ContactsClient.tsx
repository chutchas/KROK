"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Inbox, Mail, Phone, Check, Undo2, Trash2, AlertTriangle, UserCheck } from "lucide-react";
import { AsyncButton, Card, EmptyState, Notice } from "@/components/ui";
import { confirmDialog } from "@/components/dialogs";
import { deleteContact, setContactHandled } from "./actions";
import { TOPIC_TH, type ContactTopic } from "@/lib/contact";

export interface ContactRow {
  id: string; created_at: string; name: string; company: string; email: string; phone: string; seats: string; message: string;
  emailed: boolean; email_error: string | null; handled_at: string | null;
  topic: ContactTopic | ""; user_id: string | null; tenant_id: string | null; workspace: string | null;
}

const chip = (bg: string, fg: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: 10, fontSize: ".74rem", fontWeight: 600, background: bg, color: fg, marginLeft: 6, verticalAlign: "middle" });

const fmt = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

/** รายการข้อความจากหน้า "ติดต่อเรา" (หน้าแอดมิน — ภาษาไทย) */
export default function ContactsClient({ rows, missing, need0069, showAll }: { rows: ContactRow[]; missing: boolean; need0069: boolean; showAll: boolean }) {
  const router = useRouter();
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--ink-2)", textDecoration: "none", fontSize: ".85rem", fontWeight: on ? 600 : 500 }}>{label}</Link>
  );
  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <Card>
        <h1 style={{ fontSize: "1.2rem", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}><Icon icon={Inbox} className="h-5 w-5" /> ลูกค้าติดต่อ</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".86rem", margin: "0 0 10px" }}>ข้อความจากหน้า “ติดต่อเรา” (บนเว็บไซต์ และจากเมนู “ติดต่อทีม KROK” ในแอป) — ระบบส่งอีเมลถึงทีมด้วย ถ้าอีเมลไม่ถึง ดูจากหน้านี้ได้เสมอ</p>
        <div style={{ display: "flex", gap: 6 }}>
          {tab("/admin/contacts", !showAll, "ยังไม่ได้ติดต่อกลับ")}
          {tab("/admin/contacts?all=1", showAll, "ทั้งหมด")}
        </div>
        {need0069 && <Notice>ยังไม่ได้รัน migration 0069_contact_requests_user — ข้อความยังเข้าได้ แต่จะไม่เห็นประเภทเรื่องและ workspace ของผู้ใช้</Notice>}
        {missing && <Notice kind="error">ยังไม่ได้รัน migration 0068_contact_requests — ข้อความจะถูกส่งทางอีเมลอย่างเดียว</Notice>}
      </Card>

      {!missing && rows.length === 0 && <Card><EmptyState icon={<Icon icon={Inbox} className="h-7 w-7" />} title={showAll ? "ยังไม่มีข้อความ" : "ติดต่อกลับครบแล้ว"} /></Card>}

      {rows.map((r) => (
        <Card key={r.id} style={{ opacity: r.handled_at ? 0.7 : 1 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b style={{ fontSize: "1rem" }}>{r.name}</b>{r.company && <span style={{ color: "var(--ink-2)" }}> · {r.company}</span>}
              {r.topic && <span style={chip("var(--accent-soft)", "var(--accent-text)")}>{TOPIC_TH[r.topic]}</span>}
              {!need0069 && <span style={r.user_id ? chip("color-mix(in srgb, var(--pass) 14%, transparent)", "var(--pass)") : chip("var(--ground)", "var(--ink-3)")}>
                {r.user_id ? <><Icon icon={UserCheck} className="h-3 w-3" /> ผู้ใช้ในระบบ{r.workspace ? ` · ${r.workspace}` : ""}</> : "คนนอก"}
              </span>}
              <div style={{ fontSize: ".82rem", color: "var(--ink-3)" }}>
                {fmt(r.created_at)}{r.seats && ` · ผู้ใช้ ${r.seats} คน`}
                {r.handled_at && <span style={{ color: "var(--pass)" }}> · ติดต่อแล้ว {fmt(r.handled_at)}</span>}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: ".88rem" }}>
                <a href={`mailto:${r.email}?subject=${encodeURIComponent("Re: ติดต่อ KROK")}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon icon={Mail} className="h-4 w-4" /> {r.email}</a>
                {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon icon={Phone} className="h-4 w-4" /> {r.phone}</a>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <AsyncButton onClick={async () => { await setContactHandled(r.id, !r.handled_at); router.refresh(); }} style={{ padding: "7px 12px", fontSize: ".84rem" }}>
                <Icon icon={r.handled_at ? Undo2 : Check} className="h-4 w-4" /> {r.handled_at ? "ยังไม่ได้ติดต่อ" : "ติดต่อแล้ว"}
              </AsyncButton>
              <AsyncButton variant="danger" aria-label="ลบ" onClick={async () => { if (await confirmDialog({ message: `ลบข้อความของ ${r.name}?`, danger: true })) { await deleteContact(r.id); router.refresh(); } }} style={{ padding: "7px 10px" }}>
                <Icon icon={Trash2} className="h-4 w-4" />
              </AsyncButton>
            </div>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "10px 0 0", fontSize: ".9rem", lineHeight: 1.7, overflowWrap: "anywhere" }}>{r.message}</p>
          {!r.emailed && (
            <div style={{ marginTop: 8, fontSize: ".78rem", color: "var(--warn)", display: "flex", gap: 5, alignItems: "center" }}>
              <Icon icon={AlertTriangle} className="h-3.5 w-3.5" /> อีเมลแจ้งทีมส่งไม่สำเร็จ{r.email_error ? `: ${r.email_error}` : ""}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
