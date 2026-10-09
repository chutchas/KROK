import { redirect } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui";
import { LocalDate } from "@/i18n/T";
import { nowMs } from "@/lib/clock";

export const dynamic = "force-dynamic";

type Row = { id: number; created_at: string; source: string; kind: string | null; path: string | null; message: string; stack: string | null; digest: string | null; fingerprint: string; user_id: string | null; release: string | null };
type Group = { fp: string; count: number; users: number; last: Row; first: string; paths: string[] };

// บันทึก error จาก production (0053) — จัดกลุ่มตาม fingerprint, 7 วันล่าสุด (สูงสุด 2,000 รายการ)
export default async function ErrorLogPage({ searchParams }: { searchParams: Promise<{ fp?: string; days?: string }> }) {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (!session.isPlatformAdmin && session.platformRole !== "developer") return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Developer / Platform Admin เท่านั้น</div>;
  const admin = getAdminClient();
  if (!admin) return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server</div>;

  const { fp, days: daysRaw } = await searchParams;
  const days = Math.min(30, Math.max(1, parseInt(daysRaw || "7", 10) || 7));
  const since = new Date(nowMs() - days * 86400_000).toISOString();
  let q = admin.from("error_events").select("id, created_at, source, kind, path, message, stack, digest, fingerprint, user_id, release")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
  if (fp && /^[0-9a-f]{16}$/.test(fp)) q = q.eq("fingerprint", fp);
  const { data, error } = await q;
  if (error) return <div style={{ color: "var(--ink-2)" }}>ยังไม่มีตาราง error_events — รัน migration 0053 ก่อน</div>;
  const rows = (data || []) as Row[];

  const groups = new Map<string, Group & { userSet: Set<string>; pathSet: Set<string> }>();
  for (const r of rows) {
    const g = groups.get(r.fingerprint) ?? { fp: r.fingerprint, count: 0, users: 0, last: r, first: r.created_at, paths: [], userSet: new Set(), pathSet: new Set() };
    g.count++;
    g.first = r.created_at;
    if (r.user_id) g.userSet.add(r.user_id);
    if (r.path) g.pathSet.add(r.path);
    groups.set(r.fingerprint, g);
  }
  const list = [...groups.values()].map((g) => ({ ...g, users: g.userSet.size, paths: [...g.pathSet].slice(0, 3) })).sort((a, b) => b.count - a.count);
  const pill = (s: string, c: string) => <span style={{ fontSize: ".7rem", padding: "1px 7px", borderRadius: 10, border: `1px solid ${c}`, color: c, marginRight: 6 }}>{s}</span>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>บันทึก error</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".88rem", margin: "4px 0 0" }}>
          error จาก server และ browser ของผู้ใช้ {days} วันล่าสุด ({rows.length} ครั้ง · {list.length} แบบ) — เก็บในฐานข้อมูลของเราเอง 30 วัน
          {" · "}{[1, 7, 30].map((d) => <a key={d} href={`/admin/errors?days=${d}`} style={{ marginRight: 8, fontWeight: d === days ? 700 : 400 }}>{d} วัน</a>)}
          {fp && <a href={`/admin/errors?days=${days}`}>ดูทั้งหมด</a>}
        </p>
      </div>
      {list.length === 0 && <Card><span style={{ color: "var(--ink-3)" }}>ไม่มี error ในช่วงนี้ 🎉</span></Card>}
      {list.map((g) => (
        <Card key={g.fp}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: "1.1rem", minWidth: 44 }}>{g.count}×</b>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{g.last.message}</div>
              <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 2 }}>
                {pill(g.last.source, g.last.source === "server" ? "var(--fail)" : "var(--accent)")}
                {g.last.kind && pill(g.last.kind, "var(--ink-3)")}
                ผู้ใช้ {g.users} คน · ล่าสุด <LocalDate iso={g.last.created_at} /> · ครั้งแรก <LocalDate iso={g.first} />
                {g.last.release && <> · {g.last.release}</>}
              </div>
              {g.paths.length > 0 && <div style={{ fontSize: ".78rem", color: "var(--ink-2)", marginTop: 2, overflowWrap: "anywhere" }}>{g.paths.join(" · ")}</div>}
              {g.last.stack && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", fontSize: ".8rem", color: "var(--accent-text)" }}>stack {g.last.digest ? `· digest ${g.last.digest}` : ""}</summary>
                  <pre style={{ fontSize: ".72rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "var(--code-bg)", padding: 10, borderRadius: 8, maxHeight: 320, overflow: "auto" }}>{g.last.stack}</pre>
                </details>
              )}
              {!fp && g.count > 1 && <a href={`/admin/errors?days=${days}&fp=${g.fp}`} style={{ fontSize: ".8rem" }}>ดูทุกครั้ง</a>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
