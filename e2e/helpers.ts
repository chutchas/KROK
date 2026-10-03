import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const AXE = readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

/** ปัญหา accessibility ระดับ serious/critical (axe-core) — คืนรายการ id ที่พบ */
export async function axeSerious(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (d: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } };
    const r = await w.axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  });
}

/** เก็บ error ใน console ที่เกี่ยวกับ CSP / สคริปต์พัง */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}
