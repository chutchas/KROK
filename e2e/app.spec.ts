import { test, expect } from "@playwright/test";
import { watchErrors } from "./helpers";

// เส้นทางหลักของผู้ใช้จริง: ล็อกอิน → แดชบอร์ด → กรอกฟอร์ม → ส่ง → เปิดเอกสาร + PDF
// ต้องตั้ง: E2E_BASE_URL (เช่น preview deploy), E2E_EMAIL, E2E_PASSWORD (บัญชีทดสอบที่ไม่เปิด 2FA)
//          E2E_FORM_ID = ฟอร์มทดสอบที่มีแค่ช่องข้อความบังคับ 1 ช่อง (ใช้ workspace ทดสอบแยก — ทุกรอบสร้างเอกสารจริง 1 ฉบับ)
const { E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_FORM_ID } = process.env;
test.skip(!E2E_BASE_URL || !E2E_EMAIL || !E2E_PASSWORD, "ต้องตั้ง E2E_BASE_URL / E2E_EMAIL / E2E_PASSWORD");

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="email"]').fill(E2E_EMAIL!);
  await dialog.locator('input[type="password"]').fill(E2E_PASSWORD!);
  await dialog.getByRole("button", { name: /^เข้าสู่ระบบ$/ }).click();
  await page.waitForURL(/\/dashboard/);
  // บัญชีใหม่/เอกสารฉบับใหม่ → กดยอมรับข้อกำหนดถ้ามี
  const accept = page.getByRole("button", { name: /ยอมรับและใช้งานต่อ/ });
  if (await accept.isVisible().catch(() => false)) await accept.click();
});

test("แดชบอร์ดและเมนูหลักเปิดได้โดยไม่มี error", async ({ page }) => {
  const errs = watchErrors(page);
  for (const path of ["/dashboard", "/forms", "/settings/profile"]) {
    await page.goto(path);
    await expect(page.locator("main, body").first()).toBeVisible();
  }
  expect(errs).toEqual([]);
});

test("กรอกฟอร์ม → ส่ง → ขึ้นแดชบอร์ด", async ({ page }) => {
  test.skip(!E2E_FORM_ID, "ต้องตั้ง E2E_FORM_ID");
  const errs = watchErrors(page);
  await page.goto(`/fill/${E2E_FORM_ID}`);
  const title = (await page.locator("h1").first().innerText()).trim();
  await page.locator('input[type="text"], textarea').first().fill(`e2e ${new Date().toISOString()}`);
  await page.getByRole("button", { name: /ส่งข้อมูล/ }).click();
  await expect(page.getByText(/ส่งแล้ว/).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/dashboard");
  await expect(page.getByText(title).first()).toBeVisible();
  expect(errs).toEqual([]);
});
