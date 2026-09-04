import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countFields, type FormSchema } from "@/lib/form-schema";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, title, icon, schema")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const forms = (data || []) as { id: string; title: string; icon: string; schema: FormSchema }[];

  return (
    <Card>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 4 }}>เลือกฟอร์มที่จะกรอก</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>
        งานหน้างาน — เปิดจากมือถือหรือแท็บเล็ต กรอกทีละขั้นตามลำดับ
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {forms.length === 0 && (
          <span style={{ color: "var(--ink-3)" }}>ยังไม่มีฟอร์ม — ให้ผู้ดูแลสร้างในแท็บ “สร้างฟอร์ม” ก่อน</span>
        )}
        {forms.map((f) => (
          <Link
            key={f.id}
            href={`/fill/${f.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "16px",
              background: "var(--surface)",
              textDecoration: "none",
              color: "var(--ink)",
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
              {f.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontFamily: "var(--font-anuphan)" }}>{f.title}</b>
              <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".78rem" }}>
                {f.schema.steps.length} ขั้นตอน · {countFields(f.schema)} ฟิลด์
              </small>
            </div>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: ".9rem" }}>เริ่มกรอก →</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
