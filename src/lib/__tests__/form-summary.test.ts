import { describe, it, expect } from "vitest";
import { readSummary, summaryOf } from "@/lib/form-summary";
import { sanitizeSchema } from "@/lib/form-schema";

describe("form summary", () => {
  it("counts steps/fields and detects workflow like the SQL version", () => {
    const sc = sanitizeSchema({
      title: "t", category: "qc",
      steps: [
        { id: "s1", title: "a", fields: [{ id: "f1", label: "x", type: "text" }, { id: "f2", label: "y", type: "text" }] },
        { id: "s2", title: "b", assignee: { team_id: "11111111-1111-1111-1111-111111111111" }, fields: [{ id: "f3", label: "z", type: "text" }] },
      ],
    });
    expect(summaryOf(sc)).toEqual({ steps: 2, fields: 3, workflow: true, category: "qc" });
  });
  it("reads DB values defensively", () => {
    expect(readSummary(null)).toEqual({ steps: 0, fields: 0, workflow: false });
    expect(readSummary({ steps: 2, fields: 5, workflow: true, privacy_notice: "x" })).toEqual({ steps: 2, fields: 5, workflow: true, privacy_notice: "x" });
  });
});
