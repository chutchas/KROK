import { describe, it, expect } from "vitest";
import { filterAnswersByFields } from "@/lib/webhook-utils";

describe("filterAnswersByFields", () => {
  const fieldIds = ["name", "temp", "note", "photo"];
  const answers = ["สมชาย", 72, "ปกติ", "url://x"];

  it("keeps only the selected fields, preserving order", () => {
    expect(filterAnswersByFields(answers, fieldIds, ["temp", "photo"])).toEqual([72, "url://x"]);
    expect(filterAnswersByFields(answers, fieldIds, ["name"])).toEqual(["สมชาย"]);
  });

  it("returns all answers when no fields are selected", () => {
    expect(filterAnswersByFields(answers, fieldIds, [])).toEqual(answers);
  });

  it("returns all answers when there is no field map", () => {
    expect(filterAnswersByFields(answers, [], ["temp"])).toEqual(answers);
  });

  it("ignores selected fields that don't exist in the map", () => {
    expect(filterAnswersByFields(answers, fieldIds, ["ghost", "note"])).toEqual(["ปกติ"]);
  });

  it("selecting every field returns everything", () => {
    expect(filterAnswersByFields(answers, fieldIds, fieldIds)).toEqual(answers);
  });
});
