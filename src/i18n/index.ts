import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { fallbackLanguage, messages, type SupportedLanguage } from './messages';

export type { SupportedLanguage } from './messages';
export { fallbackLanguage, messages } from './messages';

const supportedLanguages = Object.keys(messages) as SupportedLanguage[];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

export function getInitialLanguage(storageKey = 'care-settings'): SupportedLanguage {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallbackLanguage;
    const parsed = JSON.parse(raw) as { language?: string };
    if (parsed.language && isSupportedLanguage(parsed.language)) {
      return parsed.language;
    }
    return fallbackLanguage;
  } catch {
    return fallbackLanguage;
  }
}

const resources = Object.fromEntries(
  Object.entries(messages).map(([language, translation]) => [
    language,
    { translation },
  ]),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: fallbackLanguage,
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
