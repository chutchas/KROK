// KROK service worker — app-shell caching + offline fallback
// (การส่งฟอร์มออฟไลน์จัดการด้วย IndexedDB queue ในแอป ไม่ใช่ที่นี่)
// หน้าออฟไลน์ (/offline) = หน้ากรอกฟอร์มที่อ่านชุดฟอร์มจาก IndexedDB — แอปสั่งให้เก็บไว้ล่วงหน้า (krok-precache-shell)
const CACHE = "krok-v2";
const SHELL = "/offline";
const SHELL_PATHS = /^\/(forms|fill)(\/|$)/;
const OFFLINE_HTML =
  '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ออฟไลน์</title>' +
  '<style>body{font-family:system-ui,"Sarabun",sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px}' +
  '.b{max-width:360px}h1{font-size:1.2rem;margin:0 0 8px}p{color:#475569;font-size:.92rem;line-height:1.5}</style></head>' +
  '<body><div class="b"><h1>ออฟไลน์อยู่</h1><p>ยังไม่มีการเชื่อมต่ออินเทอร์เน็ต — หน้าที่เคยเปิดไว้ยังใช้กรอกฟอร์มได้ และระบบจะ sync ให้อัตโนมัติเมื่อกลับมาออนไลน์</p></div></body></html>';

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ข้าม supabase/api ภายนอก
  if (url.pathname.startsWith("/api/")) return; // API ต้องสด

  // นำทางหน้า → network-first, ล้มเหลวใช้ cache หรือหน้า offline
  // หน้ากรอก/รายการฟอร์ม: ใช้หน้าออฟไลน์ก่อน (อ่านชุดฟอร์มล่าสุดจากเครื่อง + มีแบบร่างในเครื่อง)
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok && !fresh.redirected) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const shell = await caches.match(SHELL);
          const cached = await caches.match(req);
          const first = SHELL_PATHS.test(url.pathname) ? shell || cached : cached || shell;
          return first || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  // static assets → stale-while-revalidate
  if (url.pathname.startsWith("/_next/static/") || /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

// แอปสั่ง: เก็บหน้าออฟไลน์ + ไฟล์ JS/CSS ที่หน้านั้นใช้ (ทำซ้ำได้ — ไฟล์ที่มีแล้วข้าม)
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch(SHELL, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const assets = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) assets.add(m[0]);
  for (const a of assets) {
    if (await cache.match(a)) continue;
    try {
      const r = await fetch(a);
      if (r.ok) await cache.put(a, r);
    } catch { /* ข้ามไฟล์ที่โหลดไม่ได้ */ }
  }
  await cache.put(SHELL, res);
}

let shellJob = null;
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "krok-precache-shell" && !shellJob) {
    shellJob = precacheShell().catch(() => {}).finally(() => { shellJob = null; });
    if (e.waitUntil) e.waitUntil(shellJob);
  }
});
