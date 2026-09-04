"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICT, type Lang, type MessageKey } from "./dictionaries";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<Ctx>({
  lang: "th",
  setLang: () => {},
  t: (k) => DICT.th[k] ?? k,
});

export function LanguageProvider({
  children,
  initial = "th",
}: {
  children: React.ReactNode;
  initial?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initial);

  // อ่านค่าที่จำไว้ในเครื่อง (ต่อ viewer) หลัง hydrate — sync ครั้งเดียวตอน mount
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("krok_lang");
    } catch {
      /* ignore */
    }
    if (saved === "th" || saved === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(saved);
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("krok_lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: MessageKey) => DICT[lang][key] ?? DICT.th[key] ?? key, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
