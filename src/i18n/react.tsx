"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Lang, type Translator } from "./index";

const Ctx = createContext<Translator & { setLang: (l: Lang) => void }>({ ...translator("en"), setLang: () => {} });

export function I18nProvider({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: ReactNode }) {
  const value = useMemo(() => ({ ...translator(lang), setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
