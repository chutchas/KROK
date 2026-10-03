import { defineConfig, devices } from "@playwright/test";

// E2E: ทดสอบจากเบราว์เซอร์จริง
// - ไม่ตั้ง E2E_BASE_URL → build แล้วเปิด `next start` ในเครื่อง (ทดสอบหน้าสาธารณะ — ไม่ต้องมี Supabase จริง)
// - ตั้ง E2E_BASE_URL (เช่น preview deploy) + E2E_EMAIL/E2E_PASSWORD/E2E_FORM_ID → ทดสอบเส้นทางล็อกอิน→กรอก→ส่ง ด้วย
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3999";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL, trace: "retain-on-failure", locale: "th-TH",
    // ใช้ Chromium ที่ติดตั้งไว้แล้วในเครื่อง (ไม่ต้อง playwright install)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next start -p 3999", url: "http://localhost:3999/privacy", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
