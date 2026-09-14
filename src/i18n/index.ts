import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { fallbackLanguage, messages, type SupportedLanguage } from './messages';

export type { SupportedLanguage } from './messages';
export { fallbackLanguage, messages } from './messages';

const supportedLanguages = Object.keys(messages) as SupportedLanguage[];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

/**
 * 台語只換語音：LINE 語音訊息改用台語辨識、語音回覆念台語，畫面文字維持繁體中文
 * （大多數長輩讀不慣台語漢字）。對應後端 CARE app/core/user_language.py 的 TAIWANESE_LANGUAGE。
 */
export const TAIWANESE_LANGUAGE = 'nan-TW' as const;

/** 使用者能選、會存進 settings.language 的值：介面語言再加上台語。 */
export type LanguageChoice = SupportedLanguage | typeof TAIWANESE_LANGUAGE;

export function isLanguageChoice(value: string): value is LanguageChoice {
  return value === TAIWANESE_LANGUAGE || isSupportedLanguage(value);
}

/** 使用者的選擇 → 介面語言（台語 → 繁體中文）。 */
export function textLanguageOf(choice: LanguageChoice): SupportedLanguage {
  return choice === TAIWANESE_LANGUAGE ? 'zh-TW' : choice;
}

export function getInitialLanguage(storageKey = 'care-settings'): SupportedLanguage {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallbackLanguage;
    const parsed = JSON.parse(raw) as { language?: string };
    if (parsed.language && isLanguageChoice(parsed.language)) {
      return textLanguageOf(parsed.language);
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
