import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en.json';
import my from '../locales/my.json';

const DICTS = { en, my };
const STORAGE_KEY = 'lang';

const I18nContext = createContext(null);

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v in DICTS ? v : 'en';
  } catch {
    return 'en';
  }
}

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readStored);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      const str = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
      return typeof str === 'string' && vars ? str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '') : str;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, t, setLang: setLangState, toggleLang: () => setLangState((l) => (l === 'en' ? 'my' : 'en')) }),
    [lang, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
