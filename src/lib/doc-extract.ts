// ============================================================
// KROK · แปลงคำตอบดิบจาก LLM → ค่าที่เชื่อถือได้
// แยกจาก lib/ai.ts (server-only) เพื่อให้เทสต์ได้โดยไม่ต้องเรียกโมเดล
// ============================================================

export interface ExtractKey {
  key: string;                                        // ชื่อค่าที่ต้องการ เช่น "เลขที่ใบส่งของ"
  hint?: string;                                      // คำใบ้ว่าอยู่ตรงไหน/หน้าตายังไง
  type?: "text" | "number" | "datetime" | "select";
  options?: string[];                                 // เฉพาะ select
}

export interface ExtractedValue {
  key: string;
  value: string;
  confidence: number; // 0..1
}

export interface DocExtractResult {
  values: ExtractedValue[];
  not_found: string[];
}

const MAX_VALUE_LEN = 300;

/**
 * แปลงคำตอบดิบจาก LLM → ผลลัพธ์ที่เชื่อถือได้
 * - รับเฉพาะ key ที่ขอไป (ที่โมเดลแต่งเพิ่มมาเองทิ้งทั้งหมด)
 * - ตัดซ้ำ, clamp confidence, จำกัดความยาวค่า
 * - select ที่ค่าไม่ตรง options → ถือว่าไม่เจอ
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์ได้โดยไม่ต้องเรียกโมเดล
 */
export function parseExtractResult(raw: unknown, keys: ExtractKey[]): DocExtractResult {
  const wanted = new Map(keys.map((k) => [k.key, k]));
  const seen = new Set<string>();
  const values: ExtractedValue[] = [];

  const list = (raw as Record<string, unknown>)?.values;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const key = String(o.key ?? "");
      const spec = wanted.get(key);
      if (!spec || seen.has(key)) continue;

      let value = String(o.value ?? "").trim().slice(0, MAX_VALUE_LEN);
      if (!value) continue;

      if (spec.type === "number") {
        const n = value.replace(/[, ]/g, "");
        if (!/^-?\d+(\.\d+)?$/.test(n)) continue;
        value = n;
      }
      if (spec.type === "select") {
        const hit = (spec.options ?? []).find((opt) => opt.toLowerCase() === value.toLowerCase());
        if (!hit) continue;
        value = hit;
      }

      const c = typeof o.confidence === "number" ? o.confidence : parseFloat(String(o.confidence));
      const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5;

      seen.add(key);
      values.push({ key, value, confidence });
    }
  }

  return { values, not_found: keys.map((k) => k.key).filter((k) => !seen.has(k)) };
}
