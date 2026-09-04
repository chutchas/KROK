"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "krok_theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON: Record<Theme, string> = { system: "🖥️", light: "☀️", dark: "🌙" };

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Theme | null;
      if (saved && ORDER.includes(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTheme(saved);
        apply(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }

  const label = theme === "system" ? "อัตโนมัติ" : theme === "light" ? "สว่าง" : "มืด";

  return (
    <button
      onClick={cycle}
      title={`ธีม: ${label}`}
      aria-label={`ธีม: ${label}`}
      style={{
        fontSize: ".9rem",
        color: "var(--ink-2)",
        border: "1px solid var(--line)",
        borderRadius: 20,
        padding: "5px 10px",
        background: "var(--surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        lineHeight: 1,
      }}
    >
      <span aria-hidden>{ICON[theme]}</span>
    </button>
  );
}
