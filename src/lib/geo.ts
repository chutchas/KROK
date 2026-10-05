// ============================================================
// พิกัด GPS ของใบที่ส่ง (ฟอร์มที่เปิด geo) — ใช้ทั้งหน้าจอและ server
// ============================================================

export interface GeoFix {
  lat: number;
  lng: number;
  /** ความคลาดเคลื่อน (เมตร) */
  acc: number;
  /** เวลาที่ได้พิกัด (ms) */
  at: number;
}

/** ตรวจค่าที่มาจากเบราว์เซอร์ · ไม่ถูกต้อง = null */
export function sanitizeGeo(v: unknown, nowMs = Date.now()): GeoFix | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng), acc = Number(o.acc), at = Number(o.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  const fix: GeoFix = {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    acc: Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc), 100000) : 0,
    at: Number.isFinite(at) && at > 0 ? Math.min(at, nowMs + 120_000) : nowMs,
  };
  // พิกัดเก่าเกิน 8 วัน (คิวออฟไลน์เก็บได้ 7 วัน) = ไม่น่าเชื่อ
  if (fix.at < nowMs - 8 * 86400_000) return null;
  return fix;
}

export const fmtCoords = (g: Pick<GeoFix, "lat" | "lng">) => `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
export const mapUrl = (g: Pick<GeoFix, "lat" | "lng">) => `https://www.google.com/maps?q=${g.lat},${g.lng}`;

/** อ่าน geo ที่เก็บในใบ (jsonb) */
export function readGeo(v: unknown): GeoFix | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, acc: Number(o.acc) || 0, at: Number(o.at) || 0 };
}

/** ข้อความลายน้ำ (บรรทัดละรายการ) — เวลาไทยเสมอ เพราะใช้เป็นหลักฐานหน้างาน */
export function watermarkLines(o: { atMs: number; title: string; geo?: GeoFix | null; geoOn: boolean }): string[] {
  const d = new Date(o.atMs + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const when = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} (UTC+7)`;
  const lines = [when];
  if (o.geoOn) lines.push(o.geo ? `${fmtCoords(o.geo)} ±${Math.round(o.geo.acc)}m` : "GPS: —");
  const t = o.title.trim();
  if (t) lines.push(t.length > 60 ? `${t.slice(0, 59)}…` : t);
  return lines;
}
