import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type TranslationKey } from "./en";
import { de } from "./de";
import { fr } from "./fr";

export type Lang = "en" | "de" | "fr";

const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { en, de, fr };
const LANG_KEY = "hcs.lang";

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  available: Lang[];
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_KEY) : null;
  if (stored === "en" || stored === "de" || stored === "fr") return stored;
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return nav === "de" || nav === "fr" ? nav : "en";
}

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage may be blocked; language still applies for this session */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
      );
    },
    [lang],
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t, available: ["en", "de", "fr"] }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export type { TranslationKey };
