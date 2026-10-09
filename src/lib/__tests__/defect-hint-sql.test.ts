import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFECT_CONTAINS, DEFECT_EXACT } from "@/lib/defect-words";

describe("0078 ใช้คำชุดเดียวกับแอป", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0078_form_defect_hint.sql"), "utf8");
  it("คำในตัวเลือก (contains)", () => {
    const m = sql.match(/~ '\(([^)]*)\)'/);
    expect(m?.[1].split("|").sort()).toEqual([...DEFECT_CONTAINS].sort());
  });
  it("คำทั้งตัวเลือก (exact)", () => {
    const m = sql.match(/in \(('[^)]*')\)/);
    expect(m?.[1].split(",").map((x) => x.trim().replace(/'/g, "")).sort()).toEqual([...DEFECT_EXACT].sort());
  });
});
