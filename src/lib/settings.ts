import type { SupportedLanguage } from '../i18n/messages';

/**
 * 設定的型別、預設值與套用邏輯。
 *
 * 從 pages/Settings 抽出來的原因：App 啟動時就要讀取並套用這些設定，
 * 若仍由設定頁匯出，App 的靜態 import 會把整個設定頁一起拉進主包，
 * 該頁就無法被 code splitting 切出去。
 */
export interface SettingsState {
  fontSize: 'normal' | 'large' | 'xlarge';
  language: SupportedLanguage;
  highContrast: boolean;
  notifyReminder: boolean;
  notifyFamily: boolean;
  voiceReplyEnabled: boolean;
  voiceRate: 'slow' | 'normal' | 'fast';
}

export const STORAGE_KEY = 'care-settings';

export const defaultSettings: SettingsState = {
  fontSize: 'large', // 預設大字
  language: 'zh-TW',
  highContrast: true, // 預設高對比
  notifyReminder: true,
  notifyFamily: true,
  voiceReplyEnabled: false, // 對齊後端預設值
  voiceRate: 'normal', // 對齊後端預設值
};

/** 字級對照：設定頁的三段選項對應的實際 px 值 */
export const fontSizeMap = {
  normal: '16px',
  large: '20px',
  xlarge: '24px',
};

/** 把字級與高對比套用到 :root */
export function applyTheme(settings: SettingsState) {
  const root = document.documentElement;
  root.style.setProperty('--base-font-size', fontSizeMap[settings.fontSize]);

  if (settings.highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }
}
