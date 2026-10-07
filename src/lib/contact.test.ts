import { describe, expect, it } from "vitest";
import { cleanContact, contactEmail, contactErrors } from "./contact";

describe("contact", () => {
  it("clean + validate", () => {
    const c = cleanContact({ name: "  สมชาย  ", email: " A@B.co ", message: "อยากได้ใบเสนอราคา", seats: "51-200", phone: "02 586 1979", extra: 1 });
    expect(c).toEqual({ name: "สมชาย", company: "", email: "a@b.co", phone: "02 586 1979", seats: "51-200", topic: "", message: "อยากได้ใบเสนอราคา" });
    expect(contactErrors(c)).toEqual([]);
    expect(contactErrors(cleanContact({ email: "x", message: "hi", phone: "abc" }))).toEqual(["name", "email", "phone", "message"]);
    expect(cleanContact({ seats: "lots" }).seats).toBe("");
    expect(cleanContact({ topic: "billing" }).topic).toBe("billing");
    expect(cleanContact({ topic: "hack" }).topic).toBe("");
  });
  it("email escapes html", () => {
    const m = contactEmail(cleanContact({ name: "<b>x</b>", email: "a@b.co", message: "<script>" }), "https://k/admin/contacts");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).toContain("<b>x</b>");
  });
  it("in-app sender + topic", () => {
    const c = cleanContact({ name: "ต้น", email: "a@b.co", message: "สร้างฟอร์มไม่ได้", topic: "usage" });
    const m = contactEmail(c, "https://k/admin/contacts", { workspace: "โรงงาน A", role: "ผู้ดูแล", userId: "u1" });
    expect(m.subject).toBe("[KROK] ผู้ใช้ติดต่อ · ปัญหาการใช้งาน: ต้น");
    expect(m.text).toContain("Workspace: โรงงาน A");
    expect(contactEmail(c, "x").subject).toContain("ติดต่อจากเว็บไซต์");
  });
});
