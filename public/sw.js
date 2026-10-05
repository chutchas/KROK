// KROK service worker — หน้าออฟไลน์ + ไฟล์ของแอป
// (การส่งฟอร์มออฟไลน์จัดการด้วย IndexedDB queue ในแอป ไม่ใช่ที่นี่)
// หน้าออฟไลน์ (/offline) = หน้ากรอกฟอร์มที่อ่านชุดฟอร์มจาก IndexedDB — แอปสั่งให้เก็บไว้ล่วงหน้า (krok-precache-shell)
// ไม่เก็บหน้าอื่นของแอป (แดชบอร์ด/รายงาน/ใบส่ง) ไว้ในเครื่อง — กันข้อมูลค้างให้คนอื่นเห็นบนเครื่องที่ใช้ร่วมกัน
const SHELL_CACHE = "krok-shell-v3"; // หน้าออฟไลน์ + JS/CSS ที่หน้านั้นใช้ (สร้างใหม่ทุกครั้งที่เตรียม — ของเก่าถูกลบ)
const STATIC_CACHE = "krok-static-v3"; // JS/CSS/รูปที่โหลดระหว่างใช้งาน (จำกัดจำนวน ลบของเก่าสุดก่อน)
const KEEP = [SHELL_CACHE, STATIC_CACHE];
const STATIC_MAX = 250;
const SHELL = "/offline";
// Next ตอบ header "Vary: Accept-Encoding, rsc, ..." — Safari นำ header ของคำขอมาเทียบตอนค้นใน cache ด้วย
// ทำให้หาไฟล์ที่เก็บไว้ไม่เจอ (Chrome ไม่เป็น) → ค้นแบบไม่สน Vary เสมอ
const IV = { ignoreVary: true };
const OFFLINE_HTML =
  '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ออฟไลน์</title>' +
  '<style>body{font-family:system-ui,"Sarabun",sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px}' +
  '.b{max-width:360px}h1{font-size:1.2rem;margin:0 0 8px}p{color:#475569;font-size:.92rem;line-height:1.5}</style></head>' +
  '<body><div class="b"><h1>ออฟไลน์อยู่</h1><p>ยังไม่มีการเชื่อมต่ออินเทอร์เน็ต — เครื่องนี้ยังไม่ได้เตรียมฟอร์มสำหรับกรอกออฟไลน์ เปิดแอปตอนมีเน็ตสักครั้ง ระบบจะเตรียมให้อัตโนมัติ</p></div></body></html>';

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // ลบ cache รุ่นเก่า (รวมหน้าที่เคยเก็บไว้ทั้งหมดจากรุ่นก่อน)
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const offlineResponse = () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });

/** เก็บเพิ่ม · ตัดของเก่าสุดออกทุก ๆ 25 ไฟล์ที่เก็บ (keys() เรียงตามลำดับที่เก็บ — put ซ้ำ = ย้ายไปท้าย) */
let putsSinceTrim = 0;
async function putStatic(req, res) {
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(req, res);
  if (++putsSinceTrim < 25) return;
  putsSinceTrim = 0;
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_MAX; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ข้าม supabase/api ภายนอก
  if (url.pathname.startsWith("/api/")) return; // API ต้องสด

  // นำทางหน้า → ใช้เครือข่ายเสมอ (ไม่เก็บหน้า) · ไม่มีเน็ต → หน้าออฟไลน์ (รายการฟอร์ม/หน้ากรอกจากข้อมูลในเครื่อง)
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (await caches.match(SHELL, { ...IV, cacheName: SHELL_CACHE })) || offlineResponse();
        }
      })()
    );
    return;
  }

  // ไฟล์ของ build (/_next/static ชื่อไฟล์มี hash — ไม่เปลี่ยนเนื้อหา) → ใช้ของในเครื่องเลย ไม่ต้องโหลดซ้ำเบื้องหลัง
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(req, IV);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) e.waitUntil(putStatic(req, res.clone()).catch(() => {}));
        return res;
      })()
    );
    return;
  }

  // รูป/ไฟล์อื่นใน public → ใช้ของในเครื่องก่อน แล้วอัปเดตเบื้องหลัง
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(req, IV);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) e.waitUntil(putStatic(req, res.clone()).catch(() => {}));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

// แอปสั่ง: เก็บหน้าออฟไลน์ + ไฟล์ JS/CSS ที่หน้านั้นใช้ · ไฟล์ของรุ่นก่อนที่ไม่ใช้แล้วถูกลบ
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const res = await fetch(SHELL, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const assets = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) assets.add(new URL(m[0], self.location.origin).href);
  for (const a of assets) {
    if (await cache.match(a, IV)) continue;
    try {
      const r = await fetch(a);
      if (r.ok) await cache.put(a, r);
    } catch { /* ข้ามไฟล์ที่โหลดไม่ได้ */ }
  }
  await cache.put(SHELL, res);
  const shellUrl = new URL(SHELL, self.location.origin).href;
  for (const k of await cache.keys()) if (k.url !== shellUrl && !assets.has(k.url)) await cache.delete(k);
}

let shellJob = null;
self.addEventListener("message", (e) => {
  const type = e.data && e.data.type;
  if (type === "krok-precache-shell" && !shellJob) {
    shellJob = precacheShell().catch(() => {}).finally(() => { shellJob = null; });
    if (e.waitUntil) e.waitUntil(shellJob);
  }
});
