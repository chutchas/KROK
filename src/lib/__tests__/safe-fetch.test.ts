import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isBlockedIp, safeFetch } = await import("@/lib/safe-fetch");

describe("safe-fetch: กัน SSRF", () => {
  it("บล็อก IP ภายใน/สงวน", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::7f00:1", "2002:7f00:1::1", "fec0::1"])
      expect(isBlockedIp(ip), ip).toBe(true);
  });
  it("ไม่บล็อก IP สาธารณะ", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"])
      expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("ปฏิเสธ URL อันตรายก่อนเชื่อมต่อ", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(safeFetch("http://localhost:3000/")).rejects.toThrow();
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow();
    await expect(safeFetch("https://user:pw@example.com/")).rejects.toThrow();
    await expect(safeFetch("http://[::1]/")).rejects.toThrow();
  });
});
