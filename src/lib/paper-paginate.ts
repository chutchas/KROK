// ============================================================
// KROK · แบ่งหน้ากระดาษ A4 ของเอกสารที่วางแบบตำแหน่งอิสระ
// แคนวาสกระดาษเป็นแผ่นยาวแผ่นเดียว — ตอนพิมพ์/ทำ PDF เบราว์เซอร์ตัดทุก ๆ ความสูง A4
// บล็อกที่คร่อมรอยตัดจะขาดครึ่ง → เลื่อนบล็อกนั้น (และทุกอย่างที่อยู่ต่ำกว่า) ไปเริ่มหน้าถัดไป
// บล็อกที่อยู่แถวเดียวกัน (top เท่ากัน) ย้ายไปด้วยกัน — คอลัมน์ข้างกันไม่เหลื่อม
// บล็อกที่สูงเกินหนึ่งหน้า (ตารางยาว) ปล่อยให้ขึ้นหน้าใหม่ได้ตามปกติ ไม่ย้าย
// ============================================================

/** A4 @96dpi: 297mm = 1122.5px — ปัดลงเพื่อไม่ให้ล้นเป็นหน้าว่าง */
export const PAGE_H = 1122;
/** ระยะขอบบนของหน้าที่ 2 เป็นต้นไป */
export const PAGE_TOP = 40;
/** ระยะขอบล่างที่ไม่วางเนื้อหา */
export const PAGE_BOTTOM = 28;

export function paginateTops(
  /** keepWithNext = หัวข้อขั้นตอน: ห้ามค้างท้ายหน้าโดยเนื้อหาของมันไปขึ้นหน้าถัดไป */
  items: { key: string; top: number; h: number; keepWithNext?: boolean }[],
  pageH = PAGE_H,
  topPad = PAGE_TOP,
  bottomPad = PAGE_BOTTOM,
): { tops: Record<string, number>; bottom: number } {
  const sorted = [...items].sort((a, b) => a.top - b.top);
  // แถวเดียวกัน = top เท่ากัน
  const rows: (typeof sorted)[] = [];
  for (const b of sorted) {
    const last = rows[rows.length - 1];
    if (last && last[0].top === b.top) last.push(b);
    else rows.push([b]);
  }
  const usable = pageH - topPad - bottomPad;
  const crossesAt = (row: typeof sorted, y: number) => {
    const page = Math.floor(y / pageH);
    const limit = (page + 1) * pageH - bottomPad;
    return row.some((b) => b.h <= usable && y + b.h > limit);
  };
  const tops: Record<string, number> = {};
  let offset = 0;
  let bottom = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const y = row[0].top + offset;
    const page = Math.floor(y / pageH);
    let crosses = crossesAt(row, y);
    // หัวข้อ: แถวถัดไปจะถูกย้ายขึ้นหน้าใหม่ → ย้ายหัวข้อไปด้วย
    const next = rows[r + 1];
    if (!crosses && next && row.every((b) => b.keepWithNext)) {
      const ny2 = next[0].top + offset;
      crosses = Math.floor(ny2 / pageH) === page && crossesAt(next, ny2);
    }
    let ny = y;
    if (crosses) ny = (page + 1) * pageH + topPad;
    // ต้นหน้าใหม่ที่ไม่ได้ย้าย แต่ตกอยู่ในขอบบน → เลื่อนลงให้พ้นขอบ
    else if (page > 0 && y - page * pageH < topPad) ny = page * pageH + topPad;
    offset += ny - y;
    for (const b of row) { tops[b.key] = ny; bottom = Math.max(bottom, ny + b.h); }
  }
  return { tops, bottom };
}

/** ความสูงแคนวาสทั้งหมดเป็นจำนวนหน้าเต็ม */
export function pagedHeight(contentBottom: number, pageH = PAGE_H): number {
  return Math.max(1, Math.ceil(contentBottom / pageH)) * pageH;
}
