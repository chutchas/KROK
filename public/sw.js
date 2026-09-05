// KROK service worker — app-shell caching + offline fallback
// (การส่งฟอร์มออฟไลน์จัดการด้วย IndexedDB queue ในแอป ไม่ใช่ที่นี่)
const CACHE = "krok-v1";
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
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
