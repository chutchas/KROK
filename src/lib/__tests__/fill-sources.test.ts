import { describe, it, expect } from "vitest";
import { sanitizeSchema, sanitizeFillSources, docDerivedRatio, type FormField } from "@/lib/form-schema";
import { parseExtractResult, type ExtractKey } from "@/lib/doc-extract";

const F = (id: string, type: FormField["type"] = "text", extra: Partial<FormField> = {}): FormField => ({
  id, type, label: id, required: false, ...extra,
});

describe("sanitizeFillSources", () => {
  const fields = [F("po"), F("qty", "number"), F("d", "datetime"), F("photo", "photo"), F("pf", "pass_fail")];

  it("ตัดฟิลด์ที่ไม่มีอยู่ใน step เดียวกันทิ้ง", () => {
    const out = sanitizeFillSources(
      [{ id: "a", kind: "doc", label: "ใบส่งของ", map: [{ field_id: "po", key: "เลขที่" }, { field_id: "ไม่มีจริง", key: "x" }] }],
      fields
    );
    expect(out).toHaveLength(1);
    expect(out[0].map.map((m) => m.field_id)).toEqual(["po"]);
  });

  it("ไม่ยอมให้เติมฟิลด์ผลตรวจ/รูป/ลายเซ็น", () => {
    const out = sanitizeFillSources(
      [{ id: "a", kind: "doc", map: [{ field_id: "photo", key: "x" }, { field_id: "pf", key: "y" }] }],
      fields
    );
    expect(out).toHaveLength(0); // ไม่เหลือ map → ทิ้งทั้งแหล่ง
  });

  it("หนึ่งฟิลด์ถูกจองได้จากแหล่งเดียว", () => {
    const out = sanitizeFillSources(
      [
        { id: "a", kind: "doc", map: [{ field_id: "po", key: "x" }] },
        { id: "b", kind: "doc", map: [{ field_id: "po", key: "y" }] },
      ],
      fields
    );
    expect(out).toHaveLength(1);
  });

  it("scan แบบ raw ผูกได้ฟิลด์เดียว", () => {
    const out = sanitizeFillSources(
      [{ id: "a", kind: "scan", parse: "raw", map: [{ field_id: "po", key: "x" }, { field_id: "qty", key: "y" }] }],
      fields
    );
    expect(out[0].map).toHaveLength(1);
  });

  it("ตัดทิ้งเมื่อ regex คอมไพล์ไม่ผ่าน", () => {
    const bad = sanitizeFillSources(
      [{ id: "a", kind: "scan", parse: "regex", pattern: "(?<x", map: [{ field_id: "po", key: "x" }] }],
      fields
    );
    expect(bad).toHaveLength(0);

    const good = sanitizeFillSources(
      [{ id: "a", kind: "scan", parse: "regex", pattern: "(?<x>\\w+)", map: [{ field_id: "po", key: "x" }] }],
      fields
    );
    expect(good).toHaveLength(1);
  });

  it("จำกัดจำนวนแหล่งแบบเอกสารต่อขั้นตอน", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`, kind: "doc", map: [{ field_id: ["po", "qty", "d"][i % 3], key: "k" }],
    }));
    expect(sanitizeFillSources(many, fields).length).toBeLessThanOrEqual(4);
  });
});

describe("barcode เป็น alias ของ text + สแกน", () => {
  const schema = sanitizeSchema({
    title: "t",
    steps: [{ title: "s", fields: [{ id: "unit", type: "barcode", label: "เลขตู้" }] }],
  });

  it("แปลงชนิดเป็น text", () => {
    expect(schema.steps[0].fields[0].type).toBe("text");
  });

  it("สร้างแหล่งสแกนให้อัตโนมัติ", () => {
    const src = schema.steps[0].fill_sources?.[0];
    expect(src?.kind).toBe("scan");
    expect(src?.parse).toBe("raw");
    expect(src?.map[0].field_id).toBe("unit");
  });

  it("ผ่าน sanitize ซ้ำแล้วไม่เพิ่มแหล่งซ้ำ", () => {
    const again = sanitizeSchema(schema);
    expect(again.steps[0].fill_sources).toHaveLength(1);
  });
});

describe("docDerivedRatio", () => {
  it("นับเฉพาะฟิลด์ที่มาจากเอกสาร ไม่นับที่มาจากสแกน", () => {
    const schema = sanitizeSchema({
      title: "t",
      steps: [{
        title: "s",
        fields: [{ id: "a", type: "text", label: "a" }, { id: "b", type: "text", label: "b" }],
        fill_sources: [{ id: "x", kind: "scan", parse: "raw", map: [{ field_id: "a", key: "k" }] }],
      }],
    });
    expect(docDerivedRatio(schema)).toBe(0);
  });
});

describe("parseExtractResult", () => {
  const keys: ExtractKey[] = [
    { key: "เลขที่", type: "text" },
    { key: "จำนวน", type: "number" },
    { key: "สถานะ", type: "select", options: ["ปกติ", "เสียหาย"] },
  ];

  it("ทิ้ง key ที่ไม่ได้ขอ", () => {
    const r = parseExtractResult({ values: [{ key: "แอบใส่มา", value: "x", confidence: 1 }] }, keys);
    expect(r.values).toHaveLength(0);
    expect(r.not_found).toHaveLength(3);
  });

  it("ตัวเลขที่ไม่ใช่ตัวเลขถือว่าไม่เจอ", () => {
    const r = parseExtractResult({ values: [{ key: "จำนวน", value: "ประมาณสิบ", confidence: 0.9 }] }, keys);
    expect(r.values).toHaveLength(0);
    expect(r.not_found).toContain("จำนวน");
  });

  it("ล้างคอมมาออกจากตัวเลข", () => {
    const r = parseExtractResult({ values: [{ key: "จำนวน", value: "1,250", confidence: 0.9 }] }, keys);
    expect(r.values[0].value).toBe("1250");
  });

  it("select ที่ค่าไม่ตรงตัวเลือกถือว่าไม่เจอ", () => {
    const bad = parseExtractResult({ values: [{ key: "สถานะ", value: "บุบนิดหน่อย", confidence: 1 }] }, keys);
    expect(bad.values).toHaveLength(0);

    const ok = parseExtractResult({ values: [{ key: "สถานะ", value: "เสียหาย", confidence: 1 }] }, keys);
    expect(ok.values[0].value).toBe("เสียหาย");
  });

  it("clamp confidence และตัดค่าซ้ำ", () => {
    const r = parseExtractResult(
      { values: [{ key: "เลขที่", value: "A1", confidence: 9 }, { key: "เลขที่", value: "B2", confidence: 1 }] },
      keys
    );
    expect(r.values).toHaveLength(1);
    expect(r.values[0].confidence).toBe(1);
    expect(r.values[0].value).toBe("A1");
  });

  it("ทนคำตอบที่ผิดรูปโดยไม่ throw", () => {
    expect(parseExtractResult(null, keys).not_found).toHaveLength(3);
    expect(parseExtractResult({ values: "ไม่ใช่ array" }, keys).not_found).toHaveLength(3);
  });
});
