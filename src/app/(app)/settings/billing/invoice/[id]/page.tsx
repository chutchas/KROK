import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plans";
import PrintButton from "@/app/(app)/submission/[id]/PrintButton";

export const dynamic = "force-dynamic";

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, plan, amount, currency, period, status, issued_at")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) notFound();

  const plan = getPlan(data.plan as string);
  const amount = (data.amount as number) ?? 0;
  const demo = data.status === "demo";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <a href="/settings/billing/history" style={{ fontSize: ".9rem" }}>← กลับ</a>
        <PrintButton />
      </div>

      <div style={{ background: "#fff", color: "#111", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "var(--shadow)", padding: "36px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.5rem" }}>KROK</div>
            <div style={{ color: "#555", fontSize: ".8rem" }}>แพลตฟอร์มฟอร์มดิจิทัลหน้างาน</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>ใบแจ้งหนี้ / INVOICE</div>
            <div style={{ fontSize: ".82rem", color: "#555" }}>เลขที่ {data.number as string}</div>
            <div style={{ fontSize: ".82rem", color: "#555" }}>วันที่ {fmt(data.issued_at as string)}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 20, fontSize: ".88rem" }}>
          <div>
            <div style={{ color: "#888", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em" }}>เรียกเก็บจาก / Bill to</div>
            <div style={{ fontWeight: 600 }}>{session.tenantName}</div>
            <div style={{ color: "#555" }}>{session.email}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#888", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em" }}>งวด / Period</div>
            <div style={{ fontWeight: 600 }}>{data.period as string}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>รายการ</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e5e5e5" }}>
              <td style={{ padding: "10px" }}>แผน {plan.name} — บริการรายเดือน ({data.period as string})</td>
              <td style={{ padding: "10px", textAlign: "right" }} className="tabnum">฿{amount.toLocaleString()}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>รวมทั้งสิ้น</td>
              <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }} className="tabnum">฿{amount.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: 20, padding: "10px 14px", borderRadius: 6, background: demo ? "#fff6e5" : "#eef6ff", color: "#664", fontSize: ".82rem" }}>
          {demo
            ? "* เอกสารเดโม — ยังไม่มีการเรียกเก็บเงินจริง จะเป็นใบเสร็จ/ใบกำกับภาษีที่ถูกต้องเมื่อเปิดระบบชำระเงิน"
            : `สถานะ: ${data.status as string}`}
        </div>
      </div>
    </div>
  );
}
