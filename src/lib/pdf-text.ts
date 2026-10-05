// ข้อความจาก PDF (pdfjs getTextContent) → บรรทัดตามตำแหน่งจริง + ตรวจว่าใช้ได้ไหม (แยกไว้ให้เทสต์ได้)

/** ข้อความที่ดึงได้ใช้ได้จริงไหม — PDF บางไฟล์ฝังฟอนต์ไทยแบบเข้ารหัสเอง ได้ตัวอักษรขยะ (PUA / �) */
export function usableText(t: string): boolean {
  const s = t.replace(/\s+/g, "");
  if (s.length < 15) return false;
  const bad = (s.match(/[\uE000-\uF8FF\uFFFD\u0000-\u0008]/g) || []).length;
  if (bad / s.length > 0.03) return false;
  // ไทยที่ถอดผิดมักเป็นสระ/วรรณยุกต์ลอยติดกันผิดปกติ
  const floating = (s.match(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]{3,}/g) || []).length;
  return floating < 3;
}

/** เรียงข้อความของหน้าเป็นบรรทัด ตามตำแหน่งจริง (บนลงล่าง ซ้ายไปขวา) */
/** แก้รูปแบบที่ PDF ไทยมักถอดผิด: สระอำแยกเป็น นิคหิต+า / อำซ้ำ า · ตัดอักขระควบคุม (กล่องติ๊กที่ไม่มี glyph) */
export function normalizeThai(t: string): string {
  return t
    .replace(/\u0E4D\u0E32/g, "\u0E33")
    .replace(/\u0E33\u0E32/g, "\u0E33")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]{3,}/g, "  ");
}

export function linesOf(items: { str: string; transform: number[] }[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join("  ").replace(/\s{3,}/g, "  ").trim())
    .map(normalizeThai)
    .filter(Boolean)
    .join("\n");
}
