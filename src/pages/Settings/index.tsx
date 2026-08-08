import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

/* ────────── 樣式（原 index.css 遷移；區塊卡片等重複樣式抽成常數） ────────── */
const SECTION_CLASS =
  'animate-section-in mb-3 rounded-lg border border-hair bg-surface px-3 py-4 shadow-card min-[480px]:p-4';
const HEADING_CLASS = 'm-0 mb-1 text-[1.1rem] font-bold text-ink';
const DESC_CLASS = 'm-0 mb-4 text-[0.88rem] leading-normal text-muted-foreground';
const LABEL_CLASS = 'text-[0.95rem] font-semibold text-foreground min-[480px]:text-base';
const TOGGLE_ROW_CLASS =
  'flex min-h-[52px] items-center justify-between border-b border-hair py-3 last:border-b-0 last:pb-1';

/* 字級按鈕各自以「它代表的字級」顯示（16/20/24px）。
   完整字串查表，不可用 `font-size-btn-${size}` 拼接（Tailwind 掃描不到）。 */
const FONT_SIZE_BTN: Record<SettingsState['fontSize'], string> = {
  normal: 'text-[16px]',
  large: 'text-[20px]',
  xlarge: 'text-[24px]',
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

  // 變更即寫入後端；未登入或失敗時只記錄，不中斷畫面操作
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
    <div className="mx-auto w-full max-w-[720px] px-3 pt-3 pb-[116px] min-[480px]:p-4 min-[480px]:pb-[120px]">
      <h2 className="m-0 mb-3 pl-[2px] text-[1.35rem] font-extrabold text-ink min-[480px]:mb-4 min-[480px]:text-[1.6rem]">
        {t('settings.title')}
      </h2>

      {/* ── 字體大小 ── */}
      <section className={cn(SECTION_CLASS, '[animation-delay:40ms]')}>
        <h3 className={HEADING_CLASS}>{t('settings.fontSizeTitle')}</h3>
        <p className={DESC_CLASS}>{t('settings.fontSizeDesc')}</p>
        <div className="flex gap-2 min-[480px]:gap-2.5">
          {(['normal', 'large', 'xlarge'] as const).map((size) => (
            <button
              key={size}
              aria-pressed={settings.fontSize === size}
              className={cn(
                'min-h-12 flex-1 cursor-pointer rounded-md border-[1.5px] border-hair bg-surface-2 px-1 py-3 text-center font-bold text-foreground transition-[border-color,background-color,box-shadow] duration-140 hover:border-line active:scale-[0.96] min-[480px]:px-1.5',
                FONT_SIZE_BTN[size],
                settings.fontSize === size &&
                  'border-primary bg-[var(--primary-soft)] text-[var(--primary-strong)] shadow-[0_0_0_3px_var(--primary-softer)]',
              )}
              onClick={() => handleFontSize(size)}
            >
              {fontSizeLabelMap[size]}
            </button>
          ))}
        </div>
        {/* 預覽區跟著 --base-font-size 即時縮放 */}
        <div className="mt-3 rounded-md border-[1.5px] border-dashed border-line bg-surface-2 px-3 py-4 text-center text-[length:var(--base-font-size,20px)] font-semibold leading-relaxed text-foreground">
          <span>{t('settings.preview')}</span>
        </div>
      </section>

      {/* ── 語言設定 ── */}
      <section className={cn(SECTION_CLASS, '[animation-delay:100ms]')}>
        <h3 className={HEADING_CLASS}>{t('settings.languageTitle')}</h3>
        <p className={DESC_CLASS}>{t('settings.languageDesc')}</p>
        <div className="flex flex-col gap-2.5">
          <label htmlFor="language-select" className={LABEL_CLASS}>{t('settings.displayLanguage')}</label>
          <Select
            value={settings.language}
            onValueChange={(value) => handleLanguage(value as SettingsState['language'])}
          >
            <SelectTrigger
              id="language-select"
              className="min-h-12 w-full rounded-md border-[1.5px] border-hair bg-surface px-3 py-2.5 text-base font-semibold text-ink"
            >
              {/* SelectValue 預設顯示原始值（en），需以函式 child 對應回標籤 */}
              <SelectValue>
                {(value) =>
                  languageOptions.find((option) => option.value === value)?.label ?? String(value)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ── 高對比模式 ── */}
      <section className={cn(SECTION_CLASS, '[animation-delay:160ms]')}>
        <h3 className={HEADING_CLASS}>{t('settings.highContrastTitle')}</h3>
        <p className={DESC_CLASS}>{t('settings.highContrastDesc')}</p>
        <div className={TOGGLE_ROW_CLASS}>
          <span className={LABEL_CLASS}>{t('settings.highContrastToggle')}</span>
          {/* 原手刻 toggle 是普通 button，沒有 role="switch" 與 aria-checked，
              螢幕閱讀器只會唸「按鈕」；Base UI Switch 兩者皆備，鍵盤操作也內建 */}
          <Switch
            checked={settings.highContrast}
            onCheckedChange={() => toggle('highContrast')}
            aria-label="切換高對比模式"
          />
        </div>
      </section>

      {/* ── 通知設定 ── */}
      <section className={cn(SECTION_CLASS, '[animation-delay:220ms]')}>
        <h3 className={HEADING_CLASS}>{t('settings.notificationsTitle')}</h3>
        <p className={DESC_CLASS}>{t('settings.notificationsDesc')}</p>

        <div className={TOGGLE_ROW_CLASS}>
          <span className={LABEL_CLASS}>{t('settings.medicationReminder')}</span>
          <Switch
            checked={settings.notifyReminder}
            onCheckedChange={() => toggle('notifyReminder')}
            aria-label="切換用藥提醒"
          />
        </div>

        <div className={TOGGLE_ROW_CLASS}>
          <span className={LABEL_CLASS}>{t('settings.familyAlert')}</span>
          <Switch
            checked={settings.notifyFamily}
            onCheckedChange={() => toggle('notifyFamily')}
            aria-label="切換家人健康通知"
          />
        </div>
      </section>

      {/* ── 關於 ── */}
      <section className={cn(SECTION_CLASS, '[animation-delay:280ms]')}>
        <h3 className={HEADING_CLASS}>{t('settings.aboutTitle')}</h3>
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between py-1 text-[0.95rem] text-muted-foreground">
            <span>{t('settings.version')}</span>
            <strong className="num text-ink">1.0.0</strong>
          </div>
          <div className="flex justify-between py-1 text-[0.95rem] text-muted-foreground">
            <span>{t('settings.team')}</span>
            <strong className="num text-ink">CARE Team</strong>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;

/* 匯出工具函式，讓 App 啟動時也能載入設定 */
export { applyTheme, STORAGE_KEY, defaultSettings };
export type { SettingsState };
