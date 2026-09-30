import { describe, it, expect, vi } from "vitest";
import {
  parseCsv,
  detectDelimiter,
  decodeText,
  tableFromMatrix,
  inferType,
  slugKey,
  sanitizeColumns,
  findRecords,
  inferFieldPaths,
  columnsFromPaths,
  mapPulledRecords,
  mapPushedRecord,
  toRowPayload,
  filterOptions,
  coerceCell,
} from "@/lib/datasets";
import { sanitizeSchema, datasetIdsOf, labelMap } from "@/lib/form-schema";

vi.mock("server-only", () => ({}));

const DS = "11111111-2222-4333-8444-555555555555";

describe("CSV", () => {
  it("แยกคอลัมน์ รองรับเครื่องหมายคำพูด คอมมาในเซลล์ และขึ้นบรรทัดใหม่", () => {
    const rows = parseCsv('code,name\nC1,"บริษัท ก, จำกัด"\nC2,"บรรทัด\nสอง"\n');
    expect(rows).toEqual([["code", "name"], ["C1", "บริษัท ก, จำกัด"], ["C2", "บรรทัด\nสอง"]]);
  });
  it('"" ข้างในคือเครื่องหมายคำพูด และตัด BOM', () => {
    expect(parseCsv('﻿a\n"x ""y"""')).toEqual([["a"], ['x "y"']]);
  });
  it("เดาตัวคั่น ; และ tab", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("ข้ามบรรทัดว่าง", () => {
    expect(parseCsv("a\n\n1\n\n")).toEqual([["a"], ["1"]]);
  });
  it("ถอดรหัส windows-874 เมื่อไม่ใช่ UTF-8", () => {
    const tis = new Uint8Array([0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5]); // "สวัสดี"
    expect(decodeText(tis)).toBe("สวัสดี");
    expect(decodeText(new TextEncoder().encode("สวัสดี"))).toBe("สวัสดี");
  });
});

describe("ตาราง → คอลัมน์", () => {
  it("หัวภาษาไทยได้ key c1.. และเดาชนิด", () => {
    const t = tableFromMatrix([["รหัส", "ชื่อ", "qty"], ["0012", "A", "5"], ["0013", "B", "1,200"]]);
    expect(t.columns.map((c) => c.key)).toEqual(["c1", "c2", "qty"]);
    expect(t.columns.map((c) => c.type)).toEqual(["text", "text", "number"]); // 0012 ต้องเป็น text
    expect(t.records[1]).toEqual({ c1: "0013", c2: "B", qty: 1200 });
  });
  it("ตัดแถวว่างทิ้ง", () => {
    const t = tableFromMatrix([["a"], [""], [null], ["x"]]);
    expect(t.totalRows).toBe(1);
  });
  it("inferType", () => {
    expect(inferType(["1", "2.5", ""])).toBe("number");
    expect(inferType(["1", "x"])).toBe("text");
    expect(inferType([])).toBe("text");
  });
  it("slugKey ไม่ซ้ำ", () => {
    const used = new Set<string>();
    expect(slugKey("Customer Name", 0, used)).toBe("customer_name");
    expect(slugKey("Customer-Name", 1, used)).toBe("customer_name_2");
    expect(slugKey("2024", 2, used)).toBe("c_2024");
  });
  it("sanitizeColumns ตัด key ไม่ถูกต้อง/ซ้ำ", () => {
    expect(sanitizeColumns([{ key: "ok", label: "OK" }, { key: "Bad Key" }, { key: "ok" }, { key: "n", type: "number" }]))
      .toEqual([{ key: "ok", label: "OK", type: "text" }, { key: "n", label: "n", type: "number" }]);
  });
  it("coerceCell อ่านค่าจาก exceljs (สูตร/rich text/วันที่)", () => {
    expect(coerceCell({ formula: "A1", result: 7 }, "number")).toBe(7);
    expect(coerceCell({ richText: [{ text: "ab" }, { text: "c" }] }, "text")).toBe("abc");
    expect(coerceCell(new Date("2026-09-30T00:00:00Z"), "text")).toBe("2026-09-30");
  });
});

describe("JSON (API)", () => {
  const resp = { data: { items: [{ id: 1, name: "A", addr: { city: "BKK" }, tags: ["x"] }, { id: 2, name: "B", addr: { city: "CNX" } }] } };
  it("หา array อัตโนมัติ และตาม path", () => {
    expect(findRecords(resp, "")?.length).toBe(2);
    expect(findRecords(resp, "data.items")?.length).toBe(2);
    expect(findRecords(resp, "data.nope")).toBeNull();
    expect(findRecords([1, 2], "")).toEqual([1, 2]);
  });
  it("เดา field รวม object ซ้อนหนึ่งชั้น ไม่เอา array", () => {
    const recs = findRecords(resp, "")!;
    expect(inferFieldPaths(recs)).toEqual(["id", "name", "addr.city"]);
  });
  it("map ตาม field_map", () => {
    const recs = findRecords(resp, "")!;
    const { columns, field_map } = columnsFromPaths(recs, ["id", "addr.city"]);
    expect(columns.map((c) => c.key)).toEqual(["id", "addr_city"]);
    expect(mapPulledRecords(recs, columns, field_map)).toEqual([{ id: 1, addr_city: "BKK" }, { id: 2, addr_city: "CNX" }]);
  });
  it("push จับคู่ด้วย key หรือ label", () => {
    const cols = [{ key: "code", label: "รหัส", type: "text" as const }, { key: "qty", label: "จำนวน", type: "number" as const }];
    expect(mapPushedRecord({ code: "A", จำนวน: "3" }, cols)).toEqual({ code: "A", qty: 3 });
    expect(mapPushedRecord({ other: 1 }, cols)).toBeNull();
    expect(mapPushedRecord([1], cols)).toBeNull();
  });
  it("row payload ใช้ค่า key column", () => {
    expect(toRowPayload([{ code: "A", n: 1 }, { code: null, n: 2 }], "code")).toEqual([
      { k: "A", d: { code: "A", n: 1 } },
      { k: null, d: { code: null, n: 2 } },
    ]);
  });
});

describe("dropdown กรองตามกัน", () => {
  const opts = ["สาขา 1", "สาขา 2", "สาขา 1", "สาขา 3"];
  const parents = ["ลูกค้า A", "ลูกค้า A", "ลูกค้า B", "ลูกค้า B"];
  it("ไม่มี parents = ทั้งหมด", () => {
    expect(filterOptions(["x", "y"], undefined, "")).toEqual(["x", "y"]);
  });
  it("แม่ยังว่าง = ไม่มีตัวเลือก", () => {
    expect(filterOptions(opts, parents, "")).toEqual([]);
    expect(filterOptions(opts, parents, [])).toEqual([]);
  });
  it("กรองตามแม่ และตัดซ้ำเมื่อแม่เลือกหลายค่า", () => {
    expect(filterOptions(opts, parents, "ลูกค้า B")).toEqual(["สาขา 1", "สาขา 3"]);
    expect(filterOptions(opts, parents, ["ลูกค้า A", "ลูกค้า B"])).toEqual(["สาขา 1", "สาขา 2", "สาขา 3"]);
  });
});

describe("form-schema: options_source", () => {
  const base = (fields: unknown[]) => ({ title: "t", steps: [{ title: "s", fields }] });

  it("เก็บ options_source ของ select และคอลัมน์ตาราง", () => {
    const s = sanitizeSchema(base([
      { id: "cust", type: "select", label: "ลูกค้า", options_source: { dataset_id: DS, column: "name" } },
      { id: "t", type: "table", label: "ตาราง", columns: [{ id: "c", label: "สินค้า", type: "select", options_source: { dataset_id: DS, column: "sku", parent: { column: "x", field_id: "cust" } } }] },
    ]));
    expect(s.steps[0].fields[0].options_source).toEqual({ dataset_id: DS, column: "name" });
    // คอลัมน์ตารางไม่รองรับ parent
    expect(s.steps[0].fields[1].columns![0].options_source).toEqual({ dataset_id: DS, column: "sku" });
    expect(datasetIdsOf(s)).toEqual([DS]);
  });

  it("ตัด options_source ที่ไม่ถูกต้อง / ชนิดฟิลด์ไม่รองรับ", () => {
    const s = sanitizeSchema(base([
      { id: "a", type: "select", label: "a", options_source: { dataset_id: "nope", column: "name" } },
      { id: "b", type: "text", label: "b", options_source: { dataset_id: DS, column: "name" } },
      { id: "c", type: "select", label: "c", options_source: { dataset_id: DS, column: "Bad Col" } },
    ]));
    expect(s.steps[0].fields.every((f) => !f.options_source)).toBe(true);
  });

  it("parent ต้องเป็น select/checkbox ที่อยู่ก่อนหน้า", () => {
    const s = sanitizeSchema({
      title: "t",
      steps: [
        { title: "1", fields: [
          { id: "cust", type: "select", label: "ลูกค้า", options_source: { dataset_id: DS, column: "customer" } },
          { id: "branch", type: "select", label: "สาขา", options_source: { dataset_id: DS, column: "branch", parent: { field_id: "cust", column: "customer" } } },
          { id: "early", type: "select", label: "ก่อน", options_source: { dataset_id: DS, column: "x", parent: { field_id: "later", column: "y" } } },
          { id: "self", type: "checkbox", label: "ตัวเอง", options_source: { dataset_id: DS, column: "x", parent: { field_id: "self", column: "y" } } },
          { id: "txt", type: "text", label: "ข้อความ" },
          { id: "bytext", type: "select", label: "ตามข้อความ", options_source: { dataset_id: DS, column: "x", parent: { field_id: "txt", column: "y" } } },
        ] },
        { title: "2", fields: [{ id: "later", type: "select", label: "หลัง", options: ["a"] }] },
      ],
    });
    const f = Object.fromEntries(s.steps.flatMap((st) => st.fields).map((x) => [x.id, x]));
    expect(f.branch.options_source?.parent).toEqual({ field_id: "cust", column: "customer" });
    expect(f.early.options_source?.parent).toBeUndefined();
    expect(f.self.options_source?.parent).toBeUndefined();
    expect(f.bytext.options_source?.parent).toBeUndefined();
  });

  it("ไม่บันทึกค่า runtime (options_parents / options_error)", () => {
    const s = sanitizeSchema(base([{ id: "a", type: "select", label: "a", options: ["x"], options_parents: ["p"], options_error: "e" }]));
    expect(s.steps[0].fields[0]).not.toHaveProperty("options_parents");
    expect(s.steps[0].fields[0]).not.toHaveProperty("options_error");
  });
});

describe("แสดงชื่อ เก็บรหัส (label_column)", () => {
  it("เก็บ label_column ทั้งฟิลด์และคอลัมน์ตาราง แต่ตัดถ้าซ้ำกับ column หรือไม่ถูกต้อง", () => {
    const s = sanitizeSchema({
      title: "t",
      steps: [{ title: "s", fields: [
        { id: "a", type: "select", label: "a", options_source: { dataset_id: DS, column: "code", label_column: "name" } },
        { id: "b", type: "select", label: "b", options_source: { dataset_id: DS, column: "code", label_column: "code" } },
        { id: "c", type: "checkbox", label: "c", options_source: { dataset_id: DS, column: "code", label_column: "Bad Col" } },
        { id: "t", type: "table", label: "t", columns: [{ id: "x", label: "x", type: "select", options_source: { dataset_id: DS, column: "sku", label_column: "sku_name" } }] },
      ] }],
    });
    const f = s.steps[0].fields;
    expect(f[0].options_source).toEqual({ dataset_id: DS, column: "code", label_column: "name" });
    expect(f[1].options_source).toEqual({ dataset_id: DS, column: "code" });
    expect(f[2].options_source).toEqual({ dataset_id: DS, column: "code" });
    expect(f[3].columns![0].options_source).toEqual({ dataset_id: DS, column: "sku", label_column: "sku_name" });
  });
  it("ไม่บันทึก option_labels (runtime)", () => {
    const s = sanitizeSchema({ title: "t", steps: [{ title: "s", fields: [{ id: "a", type: "select", label: "a", options: ["C1"], option_labels: ["ชื่อ"] }] }] });
    expect(s.steps[0].fields[0]).not.toHaveProperty("option_labels");
  });
  it("labelMap จับคู่ค่ากับชื่อ ข้ามชื่อว่าง และเก็บตัวแรกเมื่อค่าซ้ำ (cascading)", () => {
    const m = labelMap(["C1", "C2", "C1"], ["บริษัท ก", "", "อื่น"]);
    expect(m.get("C1")).toBe("บริษัท ก");
    expect(m.has("C2")).toBe(false);
    expect(labelMap(["C1"], undefined).size).toBe(0);
  });
});

