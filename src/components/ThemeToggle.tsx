"use client";
import { useEffect, useState } from "react";
import { SunMedium, MoonStar } from "lucide-react";
import Icon from "@/components/Icon";

type Theme = "light" | "dark";
const KEY = "krok_theme";

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let initial: Theme = "light";
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") initial = saved;
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) initial = "dark";
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    apply(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "โหมดมืด (แตะเพื่อเป็นสว่าง)" : "โหมดสว่าง (แตะเพื่อเป็นมืด)"}
      aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm ${isDark ? "text-indigo-400" : "text-amber-500"}`}
      style={{ borderColor: "var(--line)", background: "var(--surface)", cursor: "pointer" }}
    >
      <Icon icon={isDark ? MoonStar : SunMedium} className="h-4 w-4" />
    </button>
  );
}
