import { describe, expect, it } from "vitest";
import { attachmentHeader, cleanDocPrefix, docNoFileSafe, docNoOf, docNoPreview, sanitizeDocNo, sanitizeSchema } from "@/lib/form-schema";

// 9 ต.ค. 2026 08:00 เวลาไทย = พ.ศ. 2569
const AT = new Date("2026-10-09T01:00:00Z");

describe("doc number", () => {
  it("previews like next_doc_no in 0077", () => {
    expect(docNoPreview({ prefix: "FL-" }, 1, AT)).toBe("FL-0001");
    expect(docNoPreview({ prefix: "FL-", reset: "year" }, 12, AT)).toBe("FL-69-0012");
    expect(docNoPreview({ prefix: "QC", reset: "month", digits: 6 }, 3, AT)).toBe("QC6910-000003");
    expect(docNoPreview({ prefix: "FL-", reset: "year", era: "ce" }, 1, AT)).toBe("FL-26-0001");
    expect(docNoPreview({ prefix: "FL-", reset: "month", era: "ce" }, 1, AT)).toBe("FL-2610-0001");
  });

  it("uses Bangkok time at the year boundary", () => {
    // 31 ธ.ค. 2026 18:00 UTC = 1 ม.ค. 2027 ตีหนึ่งเวลาไทย → พ.ศ. 2570
    expect(docNoPreview({ prefix: "A", reset: "month" }, 1, new Date("2026-12-31T18:00:00Z"))).toBe("A7001-0001");
  });

  it("sanitizes config", () => {
    expect(sanitizeDocNo({ prefix: "  F L-<x>" })).toEqual({ prefix: "FL-x" });
    expect(sanitizeDocNo({ prefix: "" })).toBeUndefined();
    expect(sanitizeDocNo({ prefix: "ตรวจ/", reset: "weekly", digits: 99 })).toEqual({ prefix: "ตรวจ/" });
    expect(sanitizeDocNo({ prefix: "FL", reset: "year", digits: 6 })).toEqual({ prefix: "FL", reset: "year", digits: 6 });
    expect(sanitizeDocNo({ prefix: "FL", reset: "year", era: "ce" })).toEqual({ prefix: "FL", reset: "year", era: "ce" });
    expect(sanitizeDocNo({ prefix: "FL", era: "be" })).toEqual({ prefix: "FL" });
    expect(cleanDocPrefix("A".repeat(40))).toHaveLength(20);
    const s = sanitizeSchema({ title: "x", steps: [{ title: "s", fields: [{ id: "a", type: "text", label: "A" }] }], doc_no: { prefix: "FL-" } });
    expect(s.doc_no).toEqual({ prefix: "FL-" });
  });

  it("falls back to the 8-character id", () => {
    expect(docNoOf({ id: "abcdef12-3456", doc_no: null })).toBe("ABCDEF12");
    expect(docNoOf({ id: "abcdef12-3456", doc_no: "FL-0001" })).toBe("FL-0001");
  });

  it("builds safe file names and headers", () => {
    expect(docNoFileSafe("QC/69-0001")).toBe("QC_69-0001");
    const h = attachmentHeader("KROK-ตรวจ_0001.pdf");
    expect(h).toMatch(/^attachment; filename="KROK-[_]+_0001\.pdf"; filename\*=UTF-8''KROK-/);
    expect(/^[\x20-\x7E]*$/.test(h)).toBe(true);
  });
});
