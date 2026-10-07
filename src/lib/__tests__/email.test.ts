import { describe, it, expect, vi, afterEach } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport: (...a: unknown[]) => (createTransport as (...x: unknown[]) => unknown)(...a) } }));

import { sendEmail, inviteEmail, emailProvider } from "@/lib/email";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("sendEmail (Resend)", () => {
  it("ไม่ตั้ง RESEND_API_KEY = ไม่ยิง และบอกว่ายังไม่ตั้งค่า", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r).toMatchObject({ ok: false, notConfigured: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("ยิง API ของ Resend ด้วย key, ผู้ส่ง และผู้รับที่ถูกต้อง", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "KROK <no-reply@example.com>");
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await sendEmail({ to: "a@b.com", subject: "สวัสดี", html: "<b>h</b>", text: "t" });
    expect(r).toEqual({ ok: true, id: "em_1" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "KROK <no-reply@example.com>", to: ["a@b.com"], subject: "สวัสดี" });
  });

  it("ไม่ตั้ง EMAIL_FROM = ใช้ onboarding@resend.dev", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "");
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(JSON.parse(f.mock.calls[0][1].body).from).toContain("onboarding@resend.dev");
  });

  it("Resend ตอบ error (เช่น โดเมนยังไม่ยืนยัน) → คืนข้อความจาก Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "The example.com domain is not verified." }), { status: 403 })));
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r).toEqual({ ok: false, error: "The example.com domain is not verified." });
  });

  it("เครือข่ายล่ม → ไม่ throw", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, error: "network down" });
  });
});

describe("sendEmail (SMTP เช่น Gmail)", () => {
  const smtp = () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
    vi.stubEnv("SMTP_PORT", "");
    vi.stubEnv("EMAIL_FROM", "");
  };
  it("ไม่มี Resend แต่มี SMTP → ส่งผ่าน SMTP (465 SSL, ตัดช่องว่างใน App Password)", async () => {
    smtp();
    sendMail.mockResolvedValueOnce({ messageId: "<m1>" });
    expect(emailProvider()).toBe("smtp");
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r).toEqual({ ok: true, id: "<m1>" });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: "me@gmail.com", pass: "abcdefghijklmnop" } }));
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ from: "KROK <me@gmail.com>", to: "a@b.com" }));
  });
  it("ล็อกอินไม่ผ่าน → บอกให้ใช้ App Password", async () => {
    smtp();
    sendMail.mockRejectedValueOnce(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"));
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("App Password");
  });
  it("EMAIL_FROM ใส่แค่ชื่อ → ชื่อ + SMTP_USER", async () => {
    smtp();
    vi.stubEnv("EMAIL_FROM", "KROK");
    sendMail.mockResolvedValueOnce({ messageId: "<m2>" });
    await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ from: "KROK <me@gmail.com>" }));
  });
  it("มี Resend ด้วย → ใช้ Resend ก่อน", () => {
    smtp();
    vi.stubEnv("RESEND_API_KEY", "re_x");
    expect(emailProvider()).toBe("resend");
  });
});

describe("inviteEmail", () => {
  it("escape ชื่อที่ผู้ใช้ตั้งเอง (กัน HTML แทรก) และมีลิงก์/ทีม", () => {
    const m = inviteEmail({ workspace: "<script>x</script>", inviter: "Tum & Co", role: "Admin", teams: ["Sale", "Ops"], link: "https://k.app/login?invite=a%40b.com" });
    expect(m.html).not.toContain("<script>x</script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("Tum &amp; Co");
    expect(m.html).toContain("https://k.app/login?invite=a%40b.com");
    expect(m.text).toContain("Sale, Ops");
    expect(m.subject).toContain("Tum & Co");
  });
});
