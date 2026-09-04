"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/ui";

export interface AnswerItem {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
}
export interface SubRow {
  id: string;
  form_title: string;
  form_icon: string;
  user_name: string;
  result: "pass" | "fail";
  fails: string[];
  answers: AnswerItem[];
  duration_s: number | null;
  submitted_at: string;
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
const todayKey = () => new Date().toLocaleDateString("sv");

export default function DashboardClient({ tenantId, initial }: { tenantId: string; initial: SubRow[] }) {
  const [subs, setSubs] = useState<SubRow[]>(initial);
  const [open, setOpen] = useState<SubRow | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("krok-subs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as SubRow;
          setSubs((prev) => (prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, 100)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId]);

  const stats = useMemo(() => {
    const today = todayKey();
    const t = subs.filter((s) => new Date(s.submitted_at).toLocaleDateString("sv") === today);
    const pass = t.filter((s) => s.result === "pass").length;
    const fail = t.filter((s) => s.result === "fail").length;
    return { today: t.length, pass, fail, rate: pass + fail ? Math.round((pass / (pass + fail)) * 100) : null };
  }, [subs]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }} className="krok-tiles">
        <Tile v={stats.today} label="ส่งวันนี้" />
        <Tile v={stats.pass} label="ผ่าน" color="var(--pass)" />
        <Tile v={stats.fail} label="ไม่ผ่าน / พบปัญหา" color="var(--fail)" />
        <Tile v={stats.rate == null ? "–" : stats.rate + "%"} label="อัตราผ่าน" />
      </div>

      <Card>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--pass)" }} />
          รายการล่าสุด (realtime)
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>
          อัปเดตทันทีเมื่อมีคน submit จากหน้างาน
        </p>
        <div>
          {subs.length === 0 && <span style={{ color: "var(--ink-3)" }}>ยังไม่มีข้อมูล — ลองกรอกฟอร์มดู</span>}
          {subs.map((s) => (
            <div
              key={s.id}
              onClick={() => setOpen(s)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>{s.form_icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: ".93rem" }}>{s.form_title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{s.user_name || "—"} · {fmt(s.submitted_at)}</small>
              </div>
              {s.fails?.length ? <Pill kind="fail">✗ {s.fails.length} ปัญหา</Pill> : s.result === "pass" ? <Pill kind="pass">✓ ผ่าน</Pill> : <Pill kind="na">ส่งแล้ว</Pill>}
            </div>
          ))}
        </div>
      </Card>

      {open && <DetailModal sub={open} tenantId={tenantId} onClose={() => setOpen(null)} />}

      <style>{`@media(max-width:700px){.krok-tiles{grid-template-columns:repeat(2,1fr)!important}}`}</style>
    </div>
  );
}

function Tile({ v, label, color }: { v: number | string; label: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.7rem", fontWeight: 700, color: color || "var(--ink)" }}>{v}</div>
      <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

function DetailModal({ sub, tenantId, onClose }: { sub: SubRow; tenantId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("submission_photos")
        .select("field_id, storage_path")
        .eq("submission_id", sub.id);
      if (!data) return;
      const out: Record<string, string> = {};
      for (const p of data) {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p.storage_path as string, 3600);
        if (signed?.signedUrl) out[p.field_id as string] = signed.signedUrl;
      }
      if (!cancelled) setPhotos(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [sub.id, tenantId]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      className="no-print"
    >
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{sub.form_icon} {sub.form_title}</h2>
          {sub.result === "fail" ? <Pill kind="fail">✗ พบปัญหา</Pill> : <Pill kind="pass">✓ ผ่าน</Pill>}
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>
          โดย {sub.user_name || "—"} · {fmt(sub.submitted_at)} · ใช้เวลา {sub.duration_s ?? "–"} วินาที
        </p>
        {sub.answers.map((a, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 14px", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
            <div style={{ color: "var(--ink-2)" }}>
              {a.label}
              {a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}>{a.note}</div>}
            </div>
            <div style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", color: a.fail ? "var(--fail)" : a.type === "pass_fail" ? "var(--pass)" : "var(--ink)" }}>
              {a.photoField ? (
                photos[a.photoField] ? (
                  <img src={photos[a.photoField]} alt="รูปแนบ" style={{ maxHeight: 110, borderRadius: 6 }} />
                ) : (
                  <span style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>กำลังโหลดรูป...</span>
                )
              ) : (
                a.display ?? "—"
              )}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
