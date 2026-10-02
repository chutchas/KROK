import { describe, it, expect } from "vitest";
import { quotaWarnings } from "../quota-warn";
import { DEFAULT_PLANS } from "../plans";

const free = DEFAULT_PLANS[0];
const base = { plan: free, formsUsed: 0, membersUsed: 0, submissionsMonth: 0, storageBytes: 0, aiByPurpose: { form_gen: 0, form_from_image: 0, photo_check: 0, doc_extract: 0 } };

describe("quotaWarnings", () => {
  it("ไม่เตือนเมื่อต่ำกว่า 80%", () => {
    expect(quotaWarnings({ ...base, submissionsMonth: 200 })).toEqual([]);
  });
  it("เตือน 80% และ 100% เรียงจากมากไปน้อย", () => {
    const w = quotaWarnings({ ...base, submissionsMonth: 250, formsUsed: 3 });
    expect(w.map((x) => [x.metric, x.level])).toEqual([["forms", 100], ["submissions", 80]]);
  });
  it("ข้ามโควตาไม่จำกัดและโควตา 0", () => {
    const biz = DEFAULT_PLANS[2];
    expect(quotaWarnings({ ...base, plan: biz, formsUsed: 5000, submissionsMonth: 99999 })).toEqual([]);
  });
});
