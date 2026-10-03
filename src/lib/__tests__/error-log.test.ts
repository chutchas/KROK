import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => null }));
import { cleanPath, fingerprintOf } from "@/lib/error-log";

describe("error log", () => {
  it("strips query strings and hashes from paths", () => {
    expect(cleanPath("/auth/confirm?token_hash=abc&email=a@b.c")).toBe("/auth/confirm");
    expect(cleanPath("/f/123#x")).toBe("/f/123");
    expect(cleanPath(null)).toBeNull();
  });
  it("groups the same error across different ids", () => {
    const a = fingerprintOf({ message: "row 12 failed", path: "/submission/11111111-2222-3333-4444-555555555555", stack: "Error\n    at foo (a.js:1:2)" });
    const b = fingerprintOf({ message: "row 98 failed", path: "/submission/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", stack: "Error\n    at foo (a.js:1:2)" });
    expect(a).toBe(b);
    expect(fingerprintOf({ message: "other" })).not.toBe(a);
  });
});
