import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 56, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
      <HomeClient />
    </Suspense>
  );
}
