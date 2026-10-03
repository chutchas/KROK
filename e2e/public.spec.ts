import { test, expect } from "@playwright/test";
import { axeSerious, watchErrors } from "./helpers";

// หน้าที่เปิดได้โดยไม่ล็อกอิน — ไม่ต้องมีฐานข้อมูลจริง

test("หน้าแรก + หน้าต่างเข้าสู่ระบบ/สมัคร", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/login");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText(/ยังไม่มีบัญชี/).click();
  // สมัครต้องติ๊กยอมรับข้อกำหนดก่อน
  await expect(dialog.getByRole("checkbox")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "ข้อกำหนดการใช้งาน" })).toHaveAttribute("href", "/terms");
  expect(errs).toEqual([]);
});

test("ส่ง Content-Security-Policy แบบ nonce (ไม่มี script unsafe-inline)", async ({ request }) => {
  const res = await request.get("/privacy");
  const csp = res.headers()["content-security-policy"] || "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});

test("นโยบายความเป็นส่วนตัว / ข้อกำหนด สลับภาษาได้", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("นโยบายความเป็นส่วนตัว");
  await page.evaluate(() => localStorage.setItem("krok_lang", "en"));
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of Service");
  await page.evaluate(() => localStorage.removeItem("krok_lang"));
  expect(errs).toEqual([]);
});

test("ลิงก์ฟอร์มสาธารณะที่ไม่มีอยู่ → แจ้งว่าเปิดไม่ได้", async ({ page }) => {
  await page.goto("/f/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
});

test("หน้าในแอปต้องล็อกอินก่อน", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("accessibility: ไม่มีปัญหาระดับร้ายแรงในหน้าสาธารณะ", async ({ page }) => {
  for (const path of ["/privacy", "/terms", "/f/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    expect(await axeSerious(page), path).toEqual([]);
  }
});
