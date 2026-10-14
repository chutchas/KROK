import "server-only";
import { existsSync } from "fs";
import { cookies } from "next/headers";
import type { Browser } from "puppeteer-core";
import { CANVAS_W } from "@/lib/paper-layout";
import { PAGE_H } from "@/lib/paper-paginate";
import { THUMB_PX } from "@/lib/pdf/pdf-thumb";

// ============================================================
// KROK · เอกสาร A4 → PDF / ภาพย่อ ด้วยเบราว์เซอร์ Chromium ฝั่ง server
// เปิดหน้าพิมพ์ /print/submission/[id] (หน้าเดียวกับปุ่ม "พิมพ์") ด้วยคุกกี้ของผู้ขอ แล้วพิมพ์เป็น PDF
// → PDF ที่ดาวน์โหลด = กระดาษที่พิมพ์เอง = กระดาษที่เห็นตอนกรอก (สิทธิ์ดูตาม RLS ของผู้ขอเหมือนเปิดหน้าเอง)
//
// หา Chromium จาก: CHROMIUM_PATH → Vercel/Lambda: @sparticuz/chromium-min ดาวน์โหลดชุด Chromium (~60MB) ครั้งแรกของแต่ละเครื่อง
//   (เก็บใน /tmp ใช้ซ้ำจนเครื่องถูกปิด · ไม่ฝังในฟังก์ชันเพราะเกินขนาดที่ Vercel รับ) → ที่ติดตั้งในเครื่อง (Docker / dev)
// ไม่มี/เปิดไม่ได้ = throw → route ถอยไปใช้ PDF แบบรายการเดิม (pdfkit) ผู้ใช้ยังได้ไฟล์เสมอ
// ============================================================

/** ชุด Chromium สำหรับ Vercel/Lambda — ต้องตรงกับเวอร์ชันของ @sparticuz/chromium-min ใน package.json (เปลี่ยนที่ CHROMIUM_PACK_URL ได้) */
const DEFAULT_PACK = "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";
const LOCAL_CANDIDATES = ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
const BASE_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"];

let browserP: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const fixed = process.env.CHROMIUM_PATH?.trim();
  if (fixed) return puppeteer.launch({ executablePath: fixed, args: BASE_ARGS, headless: true });
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    // ตัด --single-process: โหมดโปรเซสเดียวเปิดหน้าต่างแยก (createBrowserContext) แล้วเปิดแท็บไม่ได้ → "Target.createTarget: Target closed" ทุกครั้ง
    const args = chromium.args.filter((a: string) => a !== "--single-process");
    return puppeteer.launch({ executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL?.trim() || DEFAULT_PACK), args: [...args, "--font-render-hinting=none"], headless: true });
  }
  const local = LOCAL_CANDIDATES.find((p) => existsSync(p));
  if (!local) throw new Error("chromium not found (set CHROMIUM_PATH)");
  return puppeteer.launch({ executablePath: local, args: BASE_ARGS, headless: true });
}

/** ใช้เบราว์เซอร์ตัวเดิมซ้ำระหว่างคำขอ (เปิดใหม่ทุกครั้งช้า 1–3 วินาที) — หลุดเมื่อไรเปิดใหม่ */
async function getBrowser(): Promise<Browser> {
  if (browserP) {
    const b = await browserP.catch(() => null);
    if (b?.connected) return b;
    browserP = null;
  }
  const p = launch();
  browserP = p;
  p.then((b) => b.on("disconnected", () => { if (browserP === p) browserP = null; })).catch(() => { if (browserP === p) browserP = null; });
  return p;
}

/**
 * origin ที่ Chromium ใช้เปิดหน้าพิมพ์ — ห้ามใช้ Host ของคำขอ (ปลอมได้ → ส่งคุกกี้ผู้ใช้ไปเว็บอื่น)
 * DOC_RENDER_ORIGIN → Vercel production domain / deployment URL → server ตัวเอง (Docker / next start)
 */
function renderOrigin(): string {
  const env = process.env.DOC_RENDER_ORIGIN?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (process.env.VERCEL) {
    const prod = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
    const host = prod || process.env.VERCEL_URL;
    if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/** เบราว์เซอร์ที่เก็บไว้ใช้ซ้ำตายไปแล้ว (function ถูกพัก/แช่แข็งระหว่างคำขอ) แต่ยังดูเหมือนต่ออยู่ → "Target closed" */
const DEAD_BROWSER = /Target closed|Session closed|Connection closed|Protocol error|detached|crashed/i;

/** แบบ shared ใช้หน้าต่างหลักร่วมกัน → ต้องทำทีละคำขอ (คุกกี้ของคนหนึ่งต้องไม่ถูกใช้เปิดเอกสารของอีกคน) */
let sharedQueue: Promise<unknown> = Promise.resolve();
let isolatedBroken = false;
function inSharedQueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = sharedQueue.then(fn, fn);
  sharedQueue = run.catch(() => {});
  return run;
}

export async function renderDocWithChromium(id: string, kind: "pdf" | "png"): Promise<Buffer> {
  const origin = renderOrigin();
  const jar = await cookies();
  // เคยเปิดหน้าต่างแยกไม่ได้ในเครื่องนี้แล้ว → ไม่ต้องลองซ้ำ (ลองแต่ละครั้งต้องปิด/เปิดเบราว์เซอร์ใหม่ ช้า 1–3 วิ)
  if (isolatedBroken) return inSharedQueue(async () => renderOnce(await getBrowser(), id, kind, origin, jar, "shared"));
  const browser = await getBrowser();
  try {
    // ปกติ: หน้าต่างแยกต่อคำขอ (คุกกี้ไม่ปนกัน ทำพร้อมกันได้)
    return await renderOnce(browser, id, kind, origin, jar, "isolated");
  } catch (e) {
    if (!(e instanceof Error) || !DEAD_BROWSER.test(e.message)) throw e;
    // เปิดหน้าต่างแยกไม่ได้ / เบราว์เซอร์ตาย → ทิ้งตัวเดิม เปิดใหม่ แล้วใช้หน้าต่างหลักแบบเข้าคิวทีละคำขอ
    console.warn("[krok] chromium isolated context failed — retrying in shared mode:", e.message);
    browserP = null;
    await browser.close().catch(() => {});
    const out = await inSharedQueue(async () => renderOnce(await getBrowser(), id, kind, origin, jar, "shared"));
    isolatedBroken = true;
    return out;
  }
}

async function renderOnce(browser: Browser, id: string, kind: "pdf" | "png", origin: string, jar: Awaited<ReturnType<typeof cookies>>, mode: "isolated" | "shared"): Promise<Buffer> {
  // isolated: context แยกต่อคำขอ — คุกกี้ของผู้ใช้คนนี้ไม่ปนกับคำขอของคนอื่นที่ทำพร้อมกันในเบราว์เซอร์ตัวเดียวกัน
  // shared: หน้าต่างหลัก (เรียกผ่าน inSharedQueue เท่านั้น) — ล้างคุกกี้ทั้งก่อนและหลังใช้
  const ctx = mode === "isolated" ? await browser.createBrowserContext() : browser.defaultBrowserContext();
  if (mode === "shared") await clearCookies(ctx);
  let page: Awaited<ReturnType<typeof ctx.newPage>> | null = null;
  try {
    page = await ctx.newPage();
    await page.setViewport({ width: CANVAS_W, height: PAGE_H, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": bypass });
    const o = new URL(origin);
    const list = jar.getAll().map((c) => ({ name: c.name, value: c.value, domain: o.hostname, path: "/", secure: o.protocol === "https:", httpOnly: false, sameSite: "Lax" as const }));
    if (list.length) await ctx.setCookie(...list);
    const target = `${origin}/print/submission/${encodeURIComponent(id)}`;
    const res = await page.goto(target, { waitUntil: "networkidle0", timeout: 25_000 });
    if (!res || !res.ok()) throw new Error(`print page ${res?.status() ?? "no response"}`);
    // ถูกพาไปหน้า login/welcome = คุกกี้ใช้ไม่ได้ → ไม่ทำ PDF ของหน้าอื่น
    if (!new URL(page.url()).pathname.startsWith("/print/submission/")) throw new Error(`redirected to ${new URL(page.url()).pathname}`);
    // รูป lazy → โหลดทันที · รอฟอนต์ + รูป + แบ่งหน้า (ResizeObserver วัดความสูงจริงหลังฟอนต์/รูปมา)
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      for (const i of imgs) i.loading = "eager";
      await document.fonts.ready;
      await Promise.race([
        Promise.all(imgs.filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
      await new Promise((r) => setTimeout(r, 300));
    });
    if (kind === "pdf") {
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, timeout: 25_000 });
      return Buffer.from(pdf);
    }
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: CANVAS_W, height: PAGE_H, scale: THUMB_PX / CANVAS_W } });
    return Buffer.from(png);
  } finally {
    if (mode === "isolated") await ctx.close().catch(() => {});
    else {
      await clearCookies(ctx);
      await page?.close().catch(() => {});
    }
  }
}

async function clearCookies(ctx: Awaited<ReturnType<Browser["createBrowserContext"]>>) {
  try {
    const all = await ctx.cookies();
    if (all.length) await ctx.deleteCookie(...all);
  } catch { /* ไม่มีคุกกี้/ปิดไปแล้ว */ }
}
