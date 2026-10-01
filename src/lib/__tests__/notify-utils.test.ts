import { describe, it, expect } from "vitest";
import { smtpPortAllowed, smtpHostShapeOk, friendlySmtpError, webhookStatusFailed } from "../notify-utils";
import { filterAnswersByFields } from "../webhook-utils";

describe("smtp guard", () => {
  it("allows only SMTP ports", () => {
    expect(smtpPortAllowed(587)).toBe(true);
    expect(smtpPortAllowed(465)).toBe(true);
    expect(smtpPortAllowed(22)).toBe(false);
    expect(smtpPortAllowed(6379)).toBe(false);
    expect(smtpPortAllowed("587")).toBe(false);
  });
  it("rejects IPs / localhost / internal names", () => {
    expect(smtpHostShapeOk("smtp.gmail.com")).toBe(true);
    expect(smtpHostShapeOk("mail.company.co.th")).toBe(true);
    for (const h of ["127.0.0.1", "169.254.169.254", "localhost", "db.internal", "printer.local", "::1", "smtp.gmail.com/x", "a b.com", ""])
      expect(smtpHostShapeOk(h)).toBe(false);
  });
  it("never leaks raw errors", () => {
    expect(friendlySmtpError({ code: "EAUTH", message: "535 5.7.8 at 10.0.0.5" })).not.toMatch(/10\.0/);
    expect(friendlySmtpError({ code: "ECONNECTION", message: "connect ECONNREFUSED 10.1.2.3:25" })).not.toMatch(/ECONNREFUSED|10\./);
    expect(friendlySmtpError(new Error("weird banner"))).not.toMatch(/banner/);
  });
});

describe("webhookStatusFailed", () => {
  it("flags non-2xx and errors", () => {
    expect(webhookStatusFailed("200")).toBe(false);
    expect(webhookStatusFailed("204 (attempt 2)")).toBe(false);
    expect(webhookStatusFailed("test HTTP 200")).toBe(false);
    expect(webhookStatusFailed("404")).toBe(true);
    expect(webhookStatusFailed("503 (attempt 3)")).toBe(true);
    expect(webhookStatusFailed("test HTTP 401")).toBe(true);
    expect(webhookStatusFailed("error: timeout")).toBe(true);
    expect(webhookStatusFailed(null)).toBe(false);
  });
});

describe("filterAnswersByFields", () => {
  it("filters by embedded id when present (schema may have changed)", () => {
    const answers = [{ id: "b", label: "B" }, { id: "a", label: "A" }, { id: "c", label: "C" }];
    // fieldIds (schema ปัจจุบัน) ลำดับต่างจากตอนส่ง — ต้องไม่ใช้
    expect(filterAnswersByFields(answers, ["a", "b", "c"], ["a"])).toEqual([{ id: "a", label: "A" }]);
  });
  it("falls back to index for legacy answers", () => {
    expect(filterAnswersByFields([{ label: "A" }, { label: "B" }], ["a", "b"], ["b"])).toEqual([{ label: "B" }]);
  });
  it("no selection = all", () => {
    expect(filterAnswersByFields([{ id: "a" }], [], [])).toEqual([{ id: "a" }]);
  });
});
