import React, { useState, useEffect } from 'react';
import './index.css';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../../i18n/messages';
import { isSupportedLanguage } from '../../i18n';
import { getUserSettings, updateUserSettings } from '../../api/settingsApi';
import type { UpdateUserSettingsPayload } from '../../api/settingsApi';
import { isAuthenticated } from '../../utils/auth';

/* ────────── 型別定義 ────────── */
interface SettingsState {
  fontSize: 'normal' | 'large' | 'xlarge';
  language: SupportedLanguage;
  highContrast: boolean;
  notifyReminder: boolean;
  notifyFamily: boolean;
}

const STORAGE_KEY = 'care-settings';

/* ────────── 預設值 ────────── */
const defaultSettings: SettingsState = {
  fontSize: 'large',       // 預設大字
  language: 'zh-TW',
  highContrast: true,       // 預設高對比
  notifyReminder: true,
  notifyFamily: true,
};

/* ────────── 字級對照 ────────── */
const fontSizeMap = {
  normal: '16px',
  large: '20px',
  xlarge: '24px',
};

/* ────────── 前端欄位（camelCase）對應後端欄位（snake_case） ────────── */
const toggleFieldMap: Record<'highContrast' | 'notifyReminder' | 'notifyFamily', keyof UpdateUserSettingsPayload> = {
  highContrast: 'high_contrast',
  notifyReminder: 'notify_reminder',
  notifyFamily: 'notify_family',
};

const languageOptions: Array<{ value: SettingsState['language']; label: string }> = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ไทย' },
  { value: 'ja', label: '日本語' },
];

/* ────────── 工具函式：套用主題到 :root ────────── */
function applyTheme(settings: SettingsState) {
  const root = document.documentElement;
  root.style.setProperty('--base-font-size', fontSizeMap[settings.fontSize]);

  if (settings.highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }
}

/* ────────── 元件 ────────── */
const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fontSizeLabelMap = {
    normal: t('settings.fontSizeNormal'),
    large: t('settings.fontSizeLarge'),
    xlarge: t('settings.fontSizeXLarge'),
  };
  const [settings, setSettings] = useState<SettingsState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaultSettings;
  });

  const [saved, setSaved] = useState(false);

  // 每次 settings 變動都即時套用
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  // 每次設定變動都同步到 localStorage，避免語言切換後重載回舊值
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // 登入狀態下，掛載時以資料庫的值為準覆蓋本機設定（其他裝置登入過就能同步過來）；
  // 未登入或 API 失敗則靜默 fallback，繼續使用 localStorage 目前的值
  useEffect(() => {
    if (!isAuthenticated()) return;

    getUserSettings()
      .then((apiSettings) => {
        if (!apiSettings) return;
        setSettings((prev) => ({
          ...prev,
          fontSize: apiSettings.font_size,
          highContrast: apiSettings.high_contrast,
          notifyReminder: apiSettings.notify_reminder,
          notifyFamily: apiSettings.notify_family,
        }));

        // language 存在資料庫的 settings.language 裡，用它來實際切換介面語言，
        // 而不只是更新 select 的顯示值，確保多裝置登入後語言也會同步
        if (apiSettings.language && isSupportedLanguage(apiSettings.language)) {
          void i18n.changeLanguage(apiSettings.language);
        }
      })
      .catch((err) => {
        console.error('讀取伺服器設定失敗，改用本機設定', err);
      });
  }, [i18n]);

  // 同步變更到後端資料庫，未登入或發生錯誤時只記錄，不中斷畫面操作
  const persistSettings = (partial: UpdateUserSettingsPayload) => {
    if (!isAuthenticated()) return;
    updateUserSettings(partial).catch((err) => {
      console.error('同步設定到伺服器失敗', err);
    });
  };

  // 以 i18n 全域語言為準，確保下拉顯示與頁面語言一致
  useEffect(() => {
    setSettings((prev) => (
      prev.language === i18n.language ? prev : { ...prev, language: i18n.language as SupportedLanguage }
    ));
  }, [i18n.language]);

  // 顯示儲存成功提示
  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFontSize = (size: SettingsState['fontSize']) => {
    setSettings((prev) => ({ ...prev, fontSize: size }));
    persistSettings({ font_size: size });
  };

  const handleLanguage = (language: SettingsState['language']) => {
    setSettings((prev) => ({ ...prev, language }));
    void i18n.changeLanguage(language);
    persistSettings({ language });
  };

  const toggle = (key: keyof typeof toggleFieldMap) => {
    setSettings((prev) => {
      const nextValue = !prev[key];
      persistSettings({ [toggleFieldMap[key]]: nextValue });
      return { ...prev, [key]: nextValue };
    });
  };

  return (
    <div className="settings-page">
      <h2 className="settings-title">{t('settings.title')}</h2>

      {/* ── 字體大小 ── */}
      <section className="settings-section">
        <h3 className="section-heading">{t('settings.fontSizeTitle')}</h3>
        <p className="section-desc">{t('settings.fontSizeDesc')}</p>
        <div className="font-size-options">
          {(['normal', 'large', 'xlarge'] as const).map((size) => (
            <button
              key={size}
              className={`font-size-btn font-size-btn-${size} ${settings.fontSize === size ? 'active' : ''}`}
              onClick={() => handleFontSize(size)}
            >
              {fontSizeLabelMap[size]}
            </button>
          ))}
        </div>
        <div className="font-preview">
          <span>{t('settings.preview')}</span>
        </div>
      </section>

      {/* ── 語言設定 ── */}
      <section className="settings-section">
        <h3 className="section-heading">{t('settings.languageTitle')}</h3>
        <p className="section-desc">{t('settings.languageDesc')}</p>
        <div className="select-row">
          <label htmlFor="language-select" className="toggle-label">{t('settings.displayLanguage')}</label>
          <select
            id="language-select"
            className="settings-select"
            value={settings.language}
            onChange={(e) => handleLanguage(e.target.value as SettingsState['language'])}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── 高對比模式 ── */}
      <section className="settings-section">
        <h3 className="section-heading">{t('settings.highContrastTitle')}</h3>
        <p className="section-desc">{t('settings.highContrastDesc')}</p>
        <div className="toggle-row">
          <span className="toggle-label">{t('settings.highContrastToggle')}</span>
          <button
            className={`toggle-switch ${settings.highContrast ? 'on' : ''}`}
            onClick={() => toggle('highContrast')}
            aria-label="切換高對比模式"
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </section>

      {/* ── 通知設定 ── */}
      <section className="settings-section">
        <h3 className="section-heading">{t('settings.notificationsTitle')}</h3>
        <p className="section-desc">{t('settings.notificationsDesc')}</p>

        <div className="toggle-row">
          <span className="toggle-label">{t('settings.medicationReminder')}</span>
          <button
            className={`toggle-switch ${settings.notifyReminder ? 'on' : ''}`}
            onClick={() => toggle('notifyReminder')}
            aria-label="切換用藥提醒"
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">{t('settings.familyAlert')}</span>
          <button
            className={`toggle-switch ${settings.notifyFamily ? 'on' : ''}`}
            onClick={() => toggle('notifyFamily')}
            aria-label="切換家人健康通知"
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </section>

      {/* ── 關於 ── */}
      <section className="settings-section about-section">
        <h3 className="section-heading">{t('settings.aboutTitle')}</h3>
        <div className="about-info">
          <div className="about-row"><span>{t('settings.version')}</span><strong>1.0.0</strong></div>
          <div className="about-row"><span>{t('settings.team')}</span><strong>CARE Team</strong></div>
        </div>
      </section>

      {/* ── 儲存按鈕 ── */}
      <button className="save-btn" onClick={handleSave}>
        {saved ? t('settings.saved') : t('settings.save')}
      </button>
    </div>
  );
};

export default SettingsPage;

/* 匯出工具函式，讓 App 啟動時也能載入設定 */
export { applyTheme, STORAGE_KEY, defaultSettings };
export type { SettingsState };
