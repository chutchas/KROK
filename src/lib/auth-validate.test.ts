import { describe, expect, it } from "vitest";
import { emailIssue, passwordIssue, hasNonAscii } from "./auth-validate";

describe("auth-validate", () => {
  it("email", () => {
    expect(emailIssue("")).toBe("login.emailRequired");
    expect(emailIssue("sss")).toBe("login.emailInvalid");
    expect(emailIssue("a@b")).toBe("login.emailInvalid");
    expect(emailIssue("a@b.c")).toBe("login.emailInvalid");
    expect(emailIssue("แอดมิน@x.com")).toBe("login.emailThai");
    expect(emailIssue(" a.b+c@mail.co.th ")).toBeNull();
  });
  it("password", () => {
    expect(passwordIssue("", false)).toBe("login.passwordRequired");
    expect(passwordIssue("abc", false)).toBeNull();
    expect(passwordIssue("abc", true)).toBe("login.passwordShort");
    expect(passwordIssue("abcdef", true)).toBeNull();
  });
  it("non-ascii", () => { expect(hasNonAscii("ฟหก")).toBe(true); expect(hasNonAscii("abc 1")).toBe(false); });
});
