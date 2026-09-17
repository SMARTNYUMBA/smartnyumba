import { createContext, useContext, useState, useEffect } from 'react';
import { t as translate } from '../i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('snp_lang') || 'en');

  const toggle = () => {
    const next = lang === 'en' ? 'sw' : 'en';
    setLang(next);
    localStorage.setItem('snp_lang', next);
  };

  const t = (key) => translate(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
