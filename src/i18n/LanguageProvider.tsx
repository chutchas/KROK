"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { interpolate, type Dict, type Lang, type MessageKey } from "./dictionaries";
import { th } from "./th";

// ภาษาไทยมากับ bundle เสมอ (ภาษาหลัก + ใช้แทนระหว่างรอคำแปล)
// ภาษาอังกฤษโหลดแยกเป็น chunk เมื่อผู้ใช้เลือก EN ครั้งแรก แล้วเก็บไว้ในหน่วยความจำ
let enCache: Dict | null = null;
let enLoading: Promise<Dict> | null = null;
function loadEn(): Promise<Dict> {
  if (enCache) return Promise.resolve(enCache);
  enLoading ??= import("./en").then((m) => (enCache = m.en)).catch((e) => { enLoading = null; throw e; });
  return enLoading;
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey) => string;
  tt: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<Ctx>({
  lang: "th",
  setLang: () => {},
  t: (k) => th[k] ?? k,
  tt: (k, vars) => interpolate(th[k] ?? k, vars),
});

export function LanguageProvider({
  children,
  initial = "th",
}: {
  children: React.ReactNode;
  initial?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initial);
  const [en, setEn] = useState<Dict | null>(enCache);

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

  // เลือก EN → โหลดคำแปล (ระหว่างรอแสดงภาษาไทยไปก่อน)
  useEffect(() => {
    if (lang !== "en" || en) return;
    let alive = true;
    loadEn().then((d) => { if (alive) setEn(d); }, () => {});
    return () => { alive = false; };
  }, [lang, en]);

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

  const dict: Dict | null = lang === "en" ? en : null;
  const t = useCallback((key: MessageKey) => dict?.[key] ?? th[key] ?? key, [dict]);
  const tt = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => interpolate(dict?.[key] ?? th[key] ?? key, vars),
    [dict]
  );

  return <LanguageContext.Provider value={{ lang, setLang, t, tt }}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
