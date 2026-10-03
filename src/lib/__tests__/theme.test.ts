import { describe, it, expect, beforeAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cleanHex, cleanImageUrl, contrast, readableOn, resolveTheme, sanitizeFormTheme, themeCss, DEFAULT_PRIMARY, DEFAULT_HEADER } from "@/lib/theme";
import { sanitizeSchema } from "@/lib/form-schema";
import { removeBlock, orderedKeys } from "@/lib/editor-ops";
import { buildBlocks, resolveLayout, DEFAULT_IMAGE_BOX } from "@/lib/paper-layout";

const SB = "https://abc.supabase.co";
const LOGO = `${SB}/storage/v1/object/public/branding/t1/logo-1.png`;

beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = SB; });

describe("theme", () => {
  it("cleans hex colors", () => {
    expect(cleanHex("#ABC")).toBe("#aabbcc");
    expect(cleanHex(" #12ab9F ")).toBe("#12ab9f");
    expect(cleanHex("red")).toBeUndefined();
    expect(cleanHex("#12345")).toBeUndefined();
  });

  it("accepts only branding-bucket images on this Supabase project", () => {
    expect(cleanImageUrl(LOGO)).toBe(LOGO);
    expect(cleanImageUrl("http://abc.supabase.co/storage/v1/object/public/branding/x.png")).toBeUndefined();
    expect(cleanImageUrl("https://evil.example/storage/v1/object/public/branding/x.png")).toBeUndefined();
    expect(cleanImageUrl(`${SB}/storage/v1/object/public/submissions/x.png`)).toBeUndefined();
    expect(cleanImageUrl(`${LOGO}?track=1`)).toBeUndefined();
    expect(cleanImageUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("resolves app ← workspace ← form", () => {
    const none = resolveTheme(null, null);
    expect(none).toMatchObject({ primary: DEFAULT_PRIMARY, header: DEFAULT_HEADER, logo: null, custom: false, footer: "" });
    expect(themeCss(".x", none)).toBe("");

    const ws = { primary: "#ff0000", footer_text: "บริษัท ก", logo_url: LOGO };
    const a = resolveTheme(ws, null);
    expect(a).toMatchObject({ primary: "#ff0000", header: DEFAULT_HEADER, logo: LOGO, custom: true, footer: "บริษัท ก" });

    const b = resolveTheme(ws, { header: "#ffffff", logo: "none", footer_text: "FM-01" });
    expect(b).toMatchObject({ primary: "#ff0000", header: "#ffffff", headerInk: "#111111", logo: null, footer: "FM-01" });

    const c = resolveTheme(ws, { logo: "custom", logo_url: LOGO.replace("logo-1", "logo-2") });
    expect(c.logo).toContain("logo-2");
  });

  it("keeps theme text readable", () => {
    const fixed = readableOn("#ffeb3b", "#ffffff");
    expect(contrast(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(readableOn("#1d4ed8", "#ffffff")).toBe("#1d4ed8");
    expect(themeCss(".s", resolveTheme({ primary: "#ffeb3b" }, null))).toContain("--accent-ink:#111111");
  });

  it("sanitizes the form theme", () => {
    expect(sanitizeFormTheme(null)).toBeUndefined();
    expect(sanitizeFormTheme({ primary: "nope" })).toBeUndefined();
    expect(sanitizeFormTheme({ logo: "custom" })).toBeUndefined(); // custom ต้องมีไฟล์
    expect(sanitizeFormTheme({ logo: "none", footer_text: "  x  ", junk: 1 })).toEqual({ logo: "none", footer_text: "x" });
    expect(sanitizeFormTheme({ footer_text: "a".repeat(400) })!.footer_text!.length).toBe(300);
  });
});

describe("paper images", () => {
  const raw = {
    title: "t", icon: "x",
    steps: [{ id: "s1", title: "A", fields: [{ id: "a", type: "text", label: "a" }] }],
    theme: { primary: "#00aa00", logo: "custom", logo_url: LOGO },
    images: [
      { id: "logo", url: LOGO, h: 9999 },
      { id: "BAD ID", url: LOGO },
      { id: "ext", url: "https://evil.example/x.png" },
    ],
    layout: { "img:logo": { x: 10, y: 20, w: 120 }, "img:ext": { x: 0, y: 0, w: 100 } },
  };

  it("sanitizes images, theme and their layout keys", () => {
    const s = sanitizeSchema(raw);
    expect(s.theme).toEqual({ primary: "#00aa00", logo: "custom", logo_url: LOGO });
    expect(s.images).toEqual([{ id: "logo", url: LOGO, h: 600 }]);
    expect(s.layout?.["img:logo"]).toBeTruthy();
    expect(s.layout?.["img:ext"]).toBeUndefined();
  });

  it("lays out, orders and deletes image blocks", () => {
    const s = sanitizeSchema({ ...raw, layout: undefined });
    const blocks = buildBlocks(s);
    expect(blocks.some((b) => b.kind === "image" && b.key === "img:logo")).toBe(true);
    expect(resolveLayout(s, blocks)["img:logo"]).toEqual(DEFAULT_IMAGE_BOX);
    expect(orderedKeys(s)).toContain("img:logo");
    const r = removeBlock({ ...s, layout: { "img:logo": { x: 1, y: 2, w: 3 } } }, "img:logo")!;
    expect(r.images).toBeUndefined();
    expect(r.layout?.["img:logo"]).toBeUndefined();
    expect(removeBlock(s, "img:missing")).toBeNull();
  });
});

describe("brand library usage", async () => {
  const { pathFromUrl, brandAssetUses } = await import("@/lib/branding-library");
  const T = "11111111-1111-1111-1111-111111111111";
  const url = (n: string) => `${SB}/storage/v1/object/public/branding/${T}/${n}`;

  // query builder จำลอง: .select().eq()... แล้ว await / maybeSingle()
  function fakeDb(tables: Record<string, unknown>) {
    return {
      from(name: string) {
        const res = { data: tables[name] ?? null, error: null };
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) q[m] = () => q;
        q.maybeSingle = async () => res;
        q.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
        return q;
      },
    } as never;
  }

  it("maps URLs to this workspace's paths only", () => {
    expect(pathFromUrl(url("logo-a.png"), T)).toBe(`${T}/logo-a.png`);
    expect(pathFromUrl(`${SB}/storage/v1/object/public/branding/other/logo.png`, T)).toBeNull();
    expect(pathFromUrl("nope", T)).toBeNull();
  });

  it("counts workspace logo, forms (incl. trash & hidden logo) and open jobs", async () => {
    const uses = await brandAssetUses(fakeDb({
      tenant_branding: { logo_url: url("logo-ws.png") },
      forms: [
        { id: "f1", title: "A", deleted_at: null, theme: { logo: "custom", logo_url: url("logo-f1.png") }, images: [{ url: url("img-1.png") }] },
        { id: "f2", title: "B", deleted_at: "2026-01-01", theme: { logo: "none", logo_url: url("logo-old.png") }, images: null },
      ],
      form_cases: [{ id: "c1", form_id: "f1", title: "A", theme: null, images: [{ url: url("img-gone.png") }, { url: url("img-gone.png") }] }],
    }), T);
    expect(uses.get(`${T}/logo-ws.png`)).toEqual([{ kind: "workspace" }]);
    expect(uses.get(`${T}/logo-f1.png`)?.[0]).toMatchObject({ kind: "form", formId: "f1", as: "logo" });
    expect(uses.get(`${T}/img-1.png`)?.[0]).toMatchObject({ as: "image" });
    expect(uses.get(`${T}/logo-old.png`)?.[0]).toMatchObject({ deleted: true });
    expect(uses.get(`${T}/img-gone.png`)).toHaveLength(1);
    expect(uses.get(`${T}/unused.png`)).toBeUndefined();
  });
});
