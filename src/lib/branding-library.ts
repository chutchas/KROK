import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BRANDING_PATH } from "@/lib/theme";

// ============================================================
// คลังรูปแบรนด์ของ workspace (bucket "branding" โฟลเดอร์ <tenant_id>/)
// รวมรายการไฟล์ + ใช้ที่ไหนบ้าง: โลโก้ workspace · ฟอร์ม (รวมที่อยู่ในถังขยะ) · งานกรอกหลายคนที่ยังเปิดอยู่
// งานที่ยังเปิดเก็บสำเนาฟอร์ม ณ ตอนเริ่มงาน → ต้องนับด้วย ไม่งั้นลบไฟล์แล้วรูปในงานนั้นหาย
// ============================================================

export type AssetUse =
  | { kind: "workspace" }
  | { kind: "form"; formId: string; title: string; as: "logo" | "image"; deleted: boolean }
  | { kind: "case"; caseId: string; formId: string | null; title: string };

export interface BrandAsset {
  path: string;
  name: string;
  url: string;
  size: number;
  createdAt: string | null;
  uses: AssetUse[];
}

/** path ใน bucket จาก public URL (ไม่ใช่ไฟล์ของ workspace นี้ = null) */
export function pathFromUrl(url: unknown, tenantId: string): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const i = u.pathname.indexOf(BRANDING_PATH);
    if (i < 0) return null;
    const p = decodeURIComponent(u.pathname.slice(i + BRANDING_PATH.length));
    return p.startsWith(`${tenantId}/`) && !p.includes("..") ? p : null;
  } catch {
    return null;
  }
}

type ThemeLike = { logo?: unknown; logo_url?: unknown } | null;
type ImagesLike = { url?: unknown }[] | null;

/** รูปที่ schema หนึ่งอ้างถึง — โลโก้ที่ตั้งไว้แต่ปิดแสดงอยู่ก็นับ (เปิดกลับมาแล้วรูปต้องยังอยู่) */
function schemaRefs(theme: ThemeLike, images: ImagesLike, tenantId: string): { path: string; as: "logo" | "image" }[] {
  const out: { path: string; as: "logo" | "image" }[] = [];
  const lp = pathFromUrl(theme?.logo_url, tenantId);
  if (lp) out.push({ path: lp, as: "logo" });
  for (const im of Array.isArray(images) ? images : []) {
    const p = pathFromUrl(im?.url, tenantId);
    if (p) out.push({ path: p, as: "image" });
  }
  return out;
}

/**
 * ใช้ที่ไหนบ้าง (path → การใช้งาน)
 * db: ควรเป็น admin client (กรอง tenant เอง) — การนับนี้ใช้กันลบไฟล์ที่ยังใช้อยู่ จึงต้องเห็นครบทุกแถว
 */
export async function brandAssetUses(db: SupabaseClient, tenantId: string): Promise<Map<string, AssetUse[]>> {
  const uses = new Map<string, AssetUse[]>();
  const add = (p: string, u: AssetUse) => { const l = uses.get(p); if (l) l.push(u); else uses.set(p, [u]); };

  const [brand, forms, cases] = await Promise.all([
    db.from("tenant_branding").select("logo_url").eq("tenant_id", tenantId).maybeSingle(),
    db.from("forms").select("id, title, deleted_at, theme:schema->theme, images:schema->images").eq("tenant_id", tenantId),
    db.from("form_cases").select("id, form_id, title:schema->>title, theme:schema->theme, images:schema->images").eq("tenant_id", tenantId).eq("status", "open"),
  ]);
  // อ่านไม่ได้ (ยังไม่รัน migration / ไม่มีตาราง) — forms ต้องอ่านได้เสมอ ไม่งั้นนับไม่ครบ → ห้ามลบ
  if (forms.error) throw new Error(forms.error.message);

  const wp = pathFromUrl(brand.data?.logo_url, tenantId);
  if (wp) add(wp, { kind: "workspace" });
  for (const f of (forms.data || []) as { id: string; title: string; deleted_at: string | null; theme: ThemeLike; images: ImagesLike }[]) {
    for (const r of schemaRefs(f.theme, f.images, tenantId)) add(r.path, { kind: "form", formId: f.id, title: f.title, as: r.as, deleted: !!f.deleted_at });
  }
  for (const c of (cases.data || []) as { id: string; form_id: string | null; title: string | null; theme: ThemeLike; images: ImagesLike }[]) {
    const seen = new Set<string>();
    for (const r of schemaRefs(c.theme, c.images, tenantId)) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      add(r.path, { kind: "case", caseId: c.id, formId: c.form_id, title: c.title || "" });
    }
  }
  return uses;
}

/** ไฟล์ทั้งหมดในโฟลเดอร์ของ workspace (ใหม่สุดก่อน) */
export async function listBrandFiles(storage: SupabaseClient, tenantId: string): Promise<{ path: string; name: string; url: string; size: number; createdAt: string | null }[]> {
  const out: { path: string; name: string; url: string; size: number; createdAt: string | null }[] = [];
  const bucket = storage.storage.from("branding");
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data, error } = await bucket.list(tenantId, { limit: 1000, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    for (const o of data || []) {
      if (!o.id || o.name.startsWith(".")) continue; // โฟลเดอร์ย่อย / placeholder
      const path = `${tenantId}/${o.name}`;
      out.push({
        path,
        name: o.name,
        url: bucket.getPublicUrl(path).data.publicUrl,
        size: Number((o.metadata as { size?: number } | null)?.size ?? 0),
        createdAt: o.created_at ?? null,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getBrandLibrary(storage: SupabaseClient, usesDb: SupabaseClient, tenantId: string): Promise<BrandAsset[]> {
  const [files, uses] = await Promise.all([listBrandFiles(storage, tenantId), brandAssetUses(usesDb, tenantId)]);
  return files.map((f) => ({ ...f, uses: uses.get(f.path) ?? [] }));
}

/** ลบทั้งโฟลเดอร์ของ workspace (ตอนลบ workspace) — admin client */
export async function removeAllBrandFiles(admin: SupabaseClient, tenantId: string): Promise<void> {
  const files = await listBrandFiles(admin, tenantId);
  for (let i = 0; i < files.length; i += 100) {
    await admin.storage.from("branding").remove(files.slice(i, i + 100).map((f) => f.path));
  }
}
