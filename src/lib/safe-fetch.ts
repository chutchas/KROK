import "server-only";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

// ============================================================
// KROK · safe fetch — เรียก URL ที่ผู้ใช้กรอก (API pull ของ dataset) อย่างปลอดภัย
//
// กัน SSRF: ห้ามเชื่อมต่อไปยัง IP ภายใน/สงวน เช่น 127.0.0.1, 10.x, 192.168.x,
// 169.254.169.254 (metadata ของ AWS) ฯลฯ
// - ตรวจ IP "ตอนเชื่อมต่อจริง" ผ่าน lookup ของ socket → กัน DNS rebinding
// - ไม่ follow redirect อัตโนมัติ — ตามเองสูงสุด 3 ครั้งและตรวจทุกปลายทาง
// - จำกัดเวลา และขนาด response
// ============================================================

export class SafeFetchError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
}
const V4_BLOCK: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCK.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    // IPv4-mapped (::ffff:10.0.0.1)
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (/^::ffff:/.test(v)) return true; // รูปแบบ hex ของ mapped → ปฏิเสธไว้ก่อน
    if (/^::[0-9a-f]/.test(v)) return true;   // IPv4-compatible ::/96 (เช่น ::7f00:1)
    if (/^2002:/.test(v)) return true;        // 6to4 ห่อ IPv4 ข้างใน
    if (/^fe[c-f]/.test(v)) return true;      // site-local fec0::/10 (เลิกใช้แล้ว)
    if (/^f[cd]/.test(v)) return true;        // fc00::/7 unique local
    if (/^fe[89ab]/.test(v)) return true;     // fe80::/10 link-local
    if (/^ff/.test(v)) return true;           // multicast
    if (/^2001:db8/.test(v)) return true;     // documentation
    if (/^64:ff9b:/.test(v)) return true;     // NAT64
    return false;
  }
  return true;
}

// lookup ที่ปฏิเสธ IP ภายใน — ใช้กับ socket โดยตรง
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
    if (err) return (callback as (e: Error | null, a?: unknown, f?: number) => void)(err);
    const list = (addresses as unknown as dns.LookupAddress[]) || [];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (!list.length || bad) {
      return (callback as (e: Error | null) => void)(
        new SafeFetchError(`ไม่อนุญาตให้เชื่อมต่อที่อยู่ภายในเครือข่าย (${bad?.address ?? hostname})`)
      );
    }
    if ((options as dns.LookupOptions)?.all) return (callback as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    return (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
  });
};

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  body: Buffer;
}

function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("URL ไม่ถูกต้อง");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SafeFetchError("รองรับเฉพาะ http/https");
  if (u.username || u.password) throw new SafeFetchError("ห้ามใส่ user:password ใน URL — ใช้ header แทน");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedIp(host)) throw new SafeFetchError("ไม่อนุญาตให้เชื่อมต่อที่อยู่ภายในเครือข่าย");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host))
    throw new SafeFetchError("ไม่อนุญาตให้เชื่อมต่อโฮสต์ภายใน");
  return u;
}

function once(u: URL, opt: SafeFetchOptions): Promise<SafeFetchResult & { location?: string }> {
  const lib = u.protocol === "https:" ? https : http;
  const maxBytes = opt.maxBytes ?? 10 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method: opt.method ?? "GET",
        headers: { "user-agent": "KROK-Dataset-Sync/1.0", accept: "application/json", ...(opt.headers || {}) },
        lookup: safeLookup,
        timeout: opt.timeoutMs ?? 20000,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, contentType: "", body: Buffer.alloc(0), location: res.headers.location });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new SafeFetchError(`ข้อมูลใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)}MB`));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, contentType: String(res.headers["content-type"] || ""), body: Buffer.concat(chunks) }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("หมดเวลารอการตอบกลับ")));
    req.on("error", (e) => reject(e instanceof SafeFetchError ? e : new SafeFetchError(e.message || "เชื่อมต่อไม่ได้")));
    if (opt.body) req.write(opt.body);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, opt: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  // เวลารวมทั้งคำขอ (timeout ของ socket เป็นแค่ idle — ปลายทางที่ส่งทีละนิดจะลากยาวได้)
  const deadlineMs = (opt.timeoutMs ?? 20000) * 2;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new SafeFetchError("หมดเวลารอการตอบกลับ")), deadlineMs);
  });
  try {
    return await Promise.race([follow(rawUrl, opt), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function follow(rawUrl: string, opt: SafeFetchOptions): Promise<SafeFetchResult> {
  let u = checkUrl(rawUrl);
  const origin = u.origin;
  for (let hop = 0; hop < 4; hop++) {
    const r = await once(u, opt);
    if (!r.location) return r;
    if (hop === 3) throw new SafeFetchError("redirect มากเกินไป");
    const next = checkUrl(new URL(r.location, u).toString());
    if (u.protocol === "https:" && next.protocol === "http:") throw new SafeFetchError("ปฏิเสธ redirect จาก https ไป http");
    // redirect ข้ามโดเมน → ไม่ส่ง header ที่ผู้ใช้ตั้ง (อาจมี token) ต่อไปให้ปลายทางใหม่
    if (next.origin !== origin) opt = { ...opt, headers: {} };
    // redirect → เปลี่ยนเป็น GET และไม่ส่ง body ต่อ (ตามพฤติกรรมเบราว์เซอร์สำหรับ 301/302/303)
    if (r.status !== 307 && r.status !== 308) opt = { ...opt, method: "GET", body: undefined };
    u = next;
  }
  throw new SafeFetchError("redirect มากเกินไป");
}

/** ชื่อ header ที่ห้ามผู้ใช้ตั้งเอง */
export const FORBIDDEN_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade", "te", "trailer", "proxy-authorization"]);
