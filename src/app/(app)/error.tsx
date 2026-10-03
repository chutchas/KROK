"use client";
// Error boundary ระดับ (app) — จับ error ที่หลุดจาก page/loader ในโซนล็อกอิน
// self-contained (ไม่พึ่ง context) เผื่อ provider เองก็ error — useT ไม่มี provider ก็ไม่ throw (ได้ภาษาไทย)
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { useT } from "@/i18n/LanguageProvider";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, lang } = useT();
  useEffect(() => {
    // ส่งเข้า console ให้ตามรอยได้ (Vercel logs)
    console.error("[krok] app error boundary:", error);
    reportClientError(error, "boundary");
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          border: "1px solid var(--line)",
          borderRadius: 16,
          background: "var(--surface)",
          padding: "32px 28px",
          boxShadow: "0 6px 24px color-mix(in srgb, var(--ink) 6%, transparent)",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.6rem",
            background: "var(--accent-soft)",
          }}
          aria-hidden
        >
          ⚠️
        </div>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem", fontFamily: "var(--font-anuphan)" }}>
          {t("err.title")}
        </h2>
        <p style={{ margin: "0 0 20px", color: "var(--ink-2)", fontSize: ".9rem", lineHeight: 1.6 }}>
          {t("err.appBody")}
          {lang !== "en" && (
            <>
              <br />
              <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>Something went wrong. Please try again.</span>
            </>
          )}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: ".9rem",
              fontWeight: 600,
              color: "#fff",
              background: "var(--brand-gradient-50, var(--accent))",
            }}
          >
            {t("err.retry")}
          </button>
          <a
            href="/dashboard"
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              textDecoration: "none",
              fontSize: ".9rem",
              fontWeight: 600,
              color: "var(--ink)",
              background: "var(--surface)",
            }}
          >
            {t("err.home")}
          </a>
        </div>
        {error?.digest && (
          <p style={{ margin: "16px 0 0", color: "var(--ink-3)", fontSize: ".72rem", fontFamily: "monospace" }}>
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
