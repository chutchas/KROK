"use client";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { Terminal, Database, Webhook, Code2, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface PlatformStats {
  tenants: number;
  users: number;
  forms: number;
  submissions: number;
  webhooks: number;
}

const API_ROUTES: { method: string; path: string; note: string }[] = [
  { method: "GET", path: "/api/health", note: "health check (public)" },
  { method: "POST", path: "/api/ai/generate", note: "สร้าง schema ฟอร์มจาก prompt (auth, ใช้เครดิต AI)" },
  { method: "POST", path: "/api/ai/from-image", note: "อ่านฟอร์มจากรูป/PDF→รูป (auth, ใช้เครดิต AI)" },
  { method: "POST", path: "/api/ai/check-photo", note: "ให้ AI ตรวจรูปหน้างาน (auth)" },
  { method: "GET", path: "/api/export/submissions?from=&to=", note: "ส่งออก submissions เป็น CSV (auth)" },
];

const WEBHOOK_EVENTS = ["submission.created", "submission.approved", "submission.rejected", "test"];

export default function DeveloperClient({ stats, isPlatformAdmin }: { stats: PlatformStats | null; isPlatformAdmin: boolean }) {
  const { t } = useT();

  const codeBox: React.CSSProperties = {
    background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 10,
    padding: 14, fontSize: ".8rem", fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre", color: "var(--ink-2)",
  };

  const payloadSample = `POST <your-webhook-url>
Content-Type: application/json
X-KROK-Event: submission.created
X-KROK-Signature: sha256=<hmac ของ body ด้วย secret>

{
  "event": "submission.created",
  "sent_at": "2026-01-01T08:30:00.000Z",
  "data": {
    "id": "…", "form_id": "…", "form_title": "…",
    "result": "pass" | "fail", "fails": [ … ],
    "user_name": "…", "submitted_at": "…"
  }
}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Terminal} className="h-6 w-6" /> {t("dev.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("dev.sub")}</p>
      </div>

      {stats && (
        <Card>
          <h2 style={{ fontSize: "1.05rem", marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon icon={Database} className="h-5 w-5" /> {t("dev.stats")}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
            {[
              { k: t("dev.tenants"), v: stats.tenants },
              { k: t("dev.users"), v: stats.users },
              { k: t("dev.forms"), v: stats.forms },
              { k: t("dev.submissions"), v: stats.submissions },
              { k: t("dev.webhooks"), v: stats.webhooks },
            ].map((s) => (
              <div key={s.k} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", background: "var(--surface)" }}>
                <div className="tabnum" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{s.v.toLocaleString()}</div>
                <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{s.k}</div>
              </div>
            ))}
          </div>
          {!isPlatformAdmin && <p style={{ color: "var(--ink-3)", fontSize: ".76rem", marginTop: 10 }}>{t("dev.readonlyNote")}</p>}
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Code2} className="h-5 w-5" /> {t("dev.apiRef")}
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".84rem" }}>
            <tbody>
              {API_ROUTES.map((r) => (
                <tr key={r.path} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px", width: 56 }}>
                    <span style={{ fontSize: ".7rem", fontWeight: 700, color: r.method === "GET" ? "var(--pass)" : "var(--accent)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px" }}>{r.method}</span>
                  </td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: ".8rem" }}>{r.path}</td>
                  <td style={{ padding: "8px", color: "var(--ink-3)" }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: ".78rem", marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon icon={ShieldAlert} className="h-4 w-4" /> {t("dev.authNote")}
        </p>
      </Card>

      <Card>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Webhook} className="h-5 w-5" /> {t("dev.webhookRef")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>{t("dev.webhookEvents")}: {WEBHOOK_EVENTS.map((e) => <code key={e} style={{ background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px", fontSize: ".76rem", marginRight: 6 }}>{e}</code>)}</p>
        <div style={{ ...codeBox, marginTop: 10 }}>{payloadSample}</div>
      </Card>
    </div>
  );
}
