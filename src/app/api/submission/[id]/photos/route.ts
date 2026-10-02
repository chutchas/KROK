import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { AnswerItem } from "@/lib/answer-item";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================
// KROK · ดาวน์โหลดรูปถ่ายทั้งหมดของผลการกรอก เป็นไฟล์ zip (ไฟล์ตามที่เก็บในระบบ ไม่ย่อเพิ่ม)
// ชื่อไฟล์ = ลำดับ + ชื่อฟิลด์ (รูปในตาราง: ชื่อตาราง-คอลัมน์-แถว) · ไม่รวมลายเซ็น
// ============================================================

const MAX_TOTAL = 80 * 1024 * 1024; // กันไฟล์ใหญ่เกิน (Vercel function response)

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "photo";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, answers, tenant_id")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

  // ป้ายชื่อของแต่ละรูป ตามลำดับในเอกสาร
  const labels = new Map<string, string>();
  for (const a of (sub.answers || []) as AnswerItem[]) {
    if (a.type === "photo" && a.photoField) labels.set(a.photoField, a.label);
    if (a.type === "table" && a.rows && a.columns) {
      a.rows.forEach((r, ri) => {
        for (const c of a.columns!) {
          const k = r[`${c.id}#photo`];
          if (k) labels.set(k, `${a.label}-${c.label}-แถว${ri + 1}`);
        }
      });
    }
  }
  if (labels.size === 0) return NextResponse.json({ error: "no photos" }, { status: 404 });

  const { data: rows } = await supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", id);
  const byKey = new Map((rows || []).map((r) => [r.field_id as string, r.storage_path as string]));

  const files: Record<string, Uint8Array> = {};
  let total = 0, n = 0;
  for (const [key, label] of labels) {
    const path = byKey.get(key);
    if (!path) continue;
    try {
      const { data: blob } = await supabase.storage.from("submissions").download(path);
      if (!blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (total + buf.byteLength > MAX_TOTAL) break;
      total += buf.byteLength;
      n += 1;
      const ext = (path.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "jpg").toLowerCase();
      files[`${String(n).padStart(2, "0")}-${safeName(label)}.${ext}`] = buf;
    } catch { /* ข้ามรูปที่โหลดไม่ได้ */ }
  }
  if (n === 0) return NextResponse.json({ error: "no photos" }, { status: 404 });

  // รูปบีบอัดมาแล้ว → เก็บแบบไม่บีบซ้ำ (level 0) เร็วกว่าและขนาดแทบเท่ากัน
  const zip = zipSync(files, { level: 0 });
  const docNo = String(sub.id).slice(0, 8).toUpperCase();
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="KROK-${docNo}-photos.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
