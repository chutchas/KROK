"use client";
// Global error boundary — จับ error ที่หลุดจาก root layout เอง (ต้อง render html/body ของตัวเอง)
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
// อยู่นอก root layout → ไม่มี LanguageProvider: useT คืนค่า default (ภาษาไทย) ไม่ throw
import { useT } from "@/i18n/LanguageProvider";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, lang } = useT();
  useEffect(() => {
    console.error("[krok] global error boundary:", error);
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9", color: "#1a1a1a" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              textAlign: "center",
              border: "1px solid #e3e5e8",
              borderRadius: 16,
              background: "#fff",
              padding: "32px 28px",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: 12 }} aria-hidden>⚠️</div>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>{t("err.title")}</h2>
            <p style={{ margin: "0 0 20px", color: "#666", fontSize: ".9rem", lineHeight: 1.6 }}>
              {t("err.globalBody")}
              {lang !== "en" && (
                <>
                  <br />
                  <span style={{ color: "#999", fontSize: ".82rem" }}>Something went wrong.</span>
                </>
              )}
            </p>
            <button
              onClick={reset}
              style={{
                padding: "10px 22px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontSize: ".9rem",
                fontWeight: 600,
                color: "#fff",
                background: "#2563eb",
              }}
            >
              {t("err.retry")}
            </button>
            {error?.digest && (
              <p style={{ margin: "16px 0 0", color: "#999", fontSize: ".72rem", fontFamily: "monospace" }}>
                ref: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
