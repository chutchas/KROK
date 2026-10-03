import { describe, it, expect, vi } from "vitest";
import { dbError } from "@/lib/db-error";

describe("dbError", () => {
  it("passes through messages meant for users", () => {
    expect(dbError({ message: "ลบไม่ได้ — นี่คือ workspace เดียวที่คุณมี" })).toContain("ลบไม่ได้");
    expect(dbError({ message: "limit reached [quota:forms]" })).toContain("[quota:forms]");
  });
  it("hides raw Postgres errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(dbError({ message: 'insert or update on table "forms" violates foreign key constraint "forms_tenant_id_fkey"' })).toBe("ทำรายการไม่สำเร็จ โปรดลองใหม่");
    expect(dbError({ message: "duplicate key value", code: "23505" })).toBe("ข้อมูลนี้มีอยู่แล้ว");
    expect(dbError({ message: "permission denied for table x", code: "42501" })).toBe("ไม่มีสิทธิ์ทำรายการนี้");
    expect(dbError(null)).toBe("ทำรายการไม่สำเร็จ โปรดลองใหม่");
  });
});
