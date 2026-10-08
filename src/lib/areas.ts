// ============================================================
// KROK · พื้นที่ (Area) — ชนิดข้อมูลและตัวช่วยที่ใช้ได้ทั้ง client/server (0072)
// ============================================================

export interface AreaRow {
  id: string;
  code: string;
  name: string;
  sort: number;
  active: boolean;
}

/** แถวจาก RPC area_open_items */
export interface OpenItem {
  kind: "case" | "approval";
  id: string;
  form_id: string | null;
  form_title: string;
  form_icon: string;
  area_id: string;
  area_code: string;
  area_name: string;
  /** งาน: ชื่อขั้นปัจจุบัน */
  step_title: string;
  /** งาน: ผู้ถือหรือทีม · รออนุมัติ: ผู้ส่ง */
  holder: string;
  started_at: string;
}

export interface AreaGroup {
  area_id: string;
  area_code: string;
  area_name: string;
  items: OpenItem[];
}

/** จัดกลุ่มตามพื้นที่ (เรียงตามชื่อพื้นที่ · ในกลุ่มเก่าสุดก่อน) */
export function groupByArea(items: OpenItem[]): AreaGroup[] {
  const map = new Map<string, AreaGroup>();
  for (const it of items) {
    let g = map.get(it.area_id);
    if (!g) {
      g = { area_id: it.area_id, area_code: it.area_code, area_name: it.area_name, items: [] };
      map.set(it.area_id, g);
    }
    g.items.push(it);
  }
  const out = [...map.values()];
  for (const g of out) g.items.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return out.sort((a, b) => a.area_name.localeCompare(b.area_name, "th"));
}

/** เปิดมานานเท่าไร: นาที / ชั่วโมง / วัน */
export function openAge(startedAt: string, now: number = Date.now()): { unit: "m" | "h" | "d"; n: number } {
  const ms = Math.max(0, now - Date.parse(startedAt));
  const m = Math.floor(ms / 60000);
  if (m < 60) return { unit: "m", n: m };
  const h = Math.floor(m / 60);
  if (h < 48) return { unit: "h", n: h };
  return { unit: "d", n: Math.floor(h / 24) };
}
