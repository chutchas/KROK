"use client";
import { useEffect, useState } from "react";
import { Monitor, SunMedium, MoonStar } from "lucide-react";
import Icon, { type IconType } from "@/components/Icon";

type Theme = "system" | "light" | "dark";
const KEY = "krok_theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON: Record<Theme, IconType> = { system: Monitor, light: SunMedium, dark: MoonStar };
const TINT: Record<Theme, string> = { system: "text-slate-500", light: "text-amber-500", dark: "text-indigo-400" };

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
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm ${TINT[theme]}`}
      style={{ borderColor: "var(--line)", background: "var(--surface)", cursor: "pointer" }}
    >
      <Icon icon={ICON[theme]} className="h-4 w-4" />
    </button>
  );
}
