import { describe, it, expect, afterEach } from "vitest";
import { clientIp, sniffImage } from "./client-ip";

const req = (h: Record<string, string>) => new Request("https://x.test/", { headers: h });

describe("clientIp", () => {
  afterEach(() => { delete process.env.VERCEL; delete process.env.TRUSTED_PROXY_HOPS; });
  it("on Vercel prefers the Vercel header over a spoofable x-forwarded-for", () => {
    process.env.VERCEL = "1";
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1", "x-vercel-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "1.1.1.1" }))).toBe("2.2.2.2");
  });
  it("elsewhere ignores client-set headers and uses the proxy-appended XFF hop", () => {
    expect(clientIp(req({ "x-real-ip": "6.6.6.6", "x-vercel-forwarded-for": "7.7.7.7", "x-forwarded-for": "1.1.1.1, 3.3.3.3" }))).toBe("3.3.3.3");
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(req({ "x-forwarded-for": "spoof, 4.4.4.4, 10.0.0.1" }))).toBe("4.4.4.4");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("sniffImage", () => {
  it("detects real image headers", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });
  it("rejects non-images", () => {
    expect(sniffImage(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});
