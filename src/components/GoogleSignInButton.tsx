"use client";
import { useEffect, useRef, useState } from "react";

// ============================================================
// ปุ่ม "ดำเนินการต่อด้วย Google" แบบ Google Identity Services (ล็อกอินบนหน้าเว็บ KROK เอง)
// หน้าต่างของ Google จะขึ้น "ไปยัง krok-iota.vercel.app" แทนโดเมนของ Supabase
// ได้ ID token มา → supabase.auth.signInWithIdToken (ทำใน LoginForm)
// ไม่ได้ตั้ง NEXT_PUBLIC_GOOGLE_CLIENT_ID / โหลดสคริปต์ของ Google ไม่ได้ → onUnavailable (ใช้ปุ่มแบบเดิมแทน)
// ============================================================

type GsiCredential = { credential?: string };
type Gsi = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

const SRC = "https://accounts.google.com/gsi/client";
let loader: Promise<Gsi> | null = null;

function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  if (loader) return loader;
  loader = new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement("script"); // สร้างจากสคริปต์ที่มี nonce → ผ่าน CSP (strict-dynamic)
    s.src = SRC;
    s.async = true;
    s.onload = () => (w.google?.accounts?.id ? resolve(w.google) : reject(new Error("gsi")));
    s.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("timeout")), 8000);
  }).catch((e) => { loader = null; throw e; });
  return loader;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const googleClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

export default function GoogleSignInButton({ lang, onCredential, onUnavailable }: {
  lang: string;
  /** ID token + nonce ดิบ (ส่งต่อให้ Supabase ตรวจ) */
  onCredential: (token: string, nonce: string) => void;
  onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  useEffect(() => { cb.current = onCredential; }, [onCredential]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId) { onUnavailable(); return; }
    let alive = true;
    (async () => {
      try {
        const g = await loadGsi();
        // nonce กันนำ token เก่ามาใช้ซ้ำ: Google ใส่ค่า hash ใน token · Supabase ตรวจกับค่าดิบ
        const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
        const hashed = await sha256Hex(raw);
        if (!alive || !box.current) return;
        g.accounts.id.initialize({
          client_id: clientId,
          nonce: hashed,
          callback: (r: GsiCredential) => { if (r.credential) cb.current(r.credential, raw); },
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_button: true,
        });
        const width = Math.max(200, Math.min(400, Math.floor(box.current.getBoundingClientRect().width || 320)));
        g.accounts.id.renderButton(box.current, {
          type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
          logo_alignment: "center", width, locale: lang === "en" ? "en" : "th",
        });
        setReady(true);
      } catch {
        if (alive) onUnavailable();
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ความสูงคงที่ระหว่างโหลด กันหน้ากระตุก
  return <div ref={box} style={{ minHeight: 44, display: "flex", justifyContent: "center", opacity: ready ? 1 : 0.4 }} />;
}
