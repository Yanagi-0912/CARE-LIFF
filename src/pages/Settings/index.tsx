import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SupportedLanguage } from '../../i18n/messages';
import { isSupportedLanguage } from '../../i18n';
import { getUserSettings, updateUserSettings } from '../../api/settingsApi';
import type { UpdateUserSettingsPayload } from '../../api/settingsApi';
import { isAuthenticated } from '../../utils/auth';
import { useLiffAuth } from '../../context/LiffAuthProvider';
import { Button } from '@/components/ui/button';
import {
  applyTheme,
  defaultSettings,
  STORAGE_KEY,
  type SettingsState,
} from '@/lib/settings';


/* ────────── 前端欄位（camelCase）對應後端欄位（snake_case） ────────── */
const toggleFieldMap: Record<
  'highContrast' | 'notifyReminder' | 'notifyFamily' | 'voiceReplyEnabled',
  keyof UpdateUserSettingsPayload
> = {
  highContrast: 'high_contrast',
  notifyReminder: 'notify_reminder',
  notifyFamily: 'notify_family',
  voiceReplyEnabled: 'voice_reply_enabled',
};

/* 字級按鈕各自以「它代表的字級」顯示（16/20/24px）。
   完整字串查表，不可用 `font-size-btn-${size}` 拼接（Tailwind 掃描不到）。 */
const FONT_SIZE_BTN: Record<SettingsState['fontSize'], string> = {
  normal: 'text-[16px]',
  large: 'text-[20px]',
  xlarge: 'text-[24px]',
};

/* ToggleGroup 群組上方的小標題。真正的無障礙名稱掛在 ToggleGroup 的 aria-label，
   這行只是視覺提示，所以用 span 而非 label（沒有可綁定的單一控制項）。 */
const GROUP_LABEL = 'text-[0.95rem] font-semibold text-foreground min-[480px]:text-base';

/* 互斥切換鈕（字級、語速、音色）的共用尺寸。選中態由 Toggle 的 primary
   變體負責（原本是這裡自己抄一串 aria-pressed:），這裡只剩版面。 */
const SEGMENT_ITEM = 'h-12 flex-1 font-bold';

/** 設定區塊：標題 + 說明 + 內容 */
function SettingSection({
  title,
  description,
  delayMs,
  children,
}: {
  title: string;
  description?: string;
  delayMs: number;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-300 mb-3"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardHeader>
        {/* 用 h3 而非 CardTitle：CardTitle 渲染的是 div，這裡需要真的標題語意 */}
        <h3 className="text-lg font-bold">{title}</h3>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** 一列開關（標籤在左、Switch 在右） */
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Item className="px-0 py-3">
      <ItemContent>
        <ItemTitle className="text-base font-semibold">{label}</ItemTitle>
      </ItemContent>
      <ItemActions>{children}</ItemActions>
    </Item>
  );
}

const languageOptions: Array<{ value: SettingsState['language']; label: string }> = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ไทย' },
  { value: 'ja', label: '日本語' },
];


/* ────────── 元件 ────────── */
const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useLiffAuth();
  const fontSizeLabelMap = {
    normal: t('settings.fontSizeNormal'),
    large: t('settings.fontSizeLarge'),
    xlarge: t('settings.fontSizeXLarge'),
  };
  const voiceRateLabelMap = {
    slow: t('settings.voiceRateSlow'),
    normal: t('settings.voiceRateNormal'),
    fast: t('settings.voiceRateFast'),
  };
  const voiceGenderLabelMap = {
    female: t('settings.voiceGenderFemale'),
    male: t('settings.voiceGenderMale'),
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
          voiceReplyEnabled: apiSettings.voice_reply_enabled,
          voiceRate: apiSettings.voice_rate,
          voiceGender: apiSettings.voice_gender,
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

  const handleVoiceRate = (rate: SettingsState['voiceRate']) => {
    setSettings((prev) => ({ ...prev, voiceRate: rate }));
    persistSettings({ voice_rate: rate });
  };

  const handleVoiceGender = (gender: SettingsState['voiceGender']) => {
    setSettings((prev) => ({ ...prev, voiceGender: gender }));
    persistSettings({ voice_gender: gender });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
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
      <h2 className="mb-3 text-2xl font-extrabold min-[480px]:mb-4">{t('settings.title')}</h2>

      {/* ── 字體大小 ── */}
      <SettingSection
        title={t('settings.fontSizeTitle')}
        description={t('settings.fontSizeDesc')}
        delayMs={40}
      >
        {/* ToggleGroup 取代原本三顆各自帶 aria-pressed 的獨立按鈕：
            三者互斥，應為一個群組而非三個彼此無關的切換鈕，
            方向鍵在群組內移動焦點也由元件提供。
            multiple 預設 false（單選），value 為陣列語意。 */}
        <ToggleGroup
          variant="primary"
          className="w-full"
          value={[settings.fontSize]}
          onValueChange={(groupValue) => {
            const next = groupValue[0] as SettingsState['fontSize'] | undefined;
            if (next) handleFontSize(next);
          }}
          aria-label={t('settings.fontSizeTitle')}
        >
          {(['normal', 'large', 'xlarge'] as const).map((size) => (
            <ToggleGroupItem
              key={size}
              value={size}
              className={cn(SEGMENT_ITEM, FONT_SIZE_BTN[size])}
            >
              {fontSizeLabelMap[size]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* 預覽區跟著 --base-font-size 即時縮放 */}
        <Empty className="mt-3 border border-dashed p-4">
          <span className="text-[length:var(--base-font-size,20px)] font-semibold">
            {t('settings.preview')}
          </span>
        </Empty>
      </SettingSection>

      {/* ── 語言設定 ── */}
      <SettingSection
        title={t('settings.languageTitle')}
        description={t('settings.languageDesc')}
        delayMs={100}
      >
        <Field>
          <FieldLabel htmlFor="language-select" className="text-base">
            {t('settings.displayLanguage')}
          </FieldLabel>
          <Select
            value={settings.language}
            onValueChange={(value) => handleLanguage(value as SettingsState['language'])}
          >
            <SelectTrigger id="language-select" className="w-full font-semibold">
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
        </Field>
      </SettingSection>

      {/* ── 高對比模式 ── */}
      <SettingSection
        title={t('settings.highContrastTitle')}
        description={t('settings.highContrastDesc')}
        delayMs={160}
      >
        <SettingRow label={t('settings.highContrastToggle')}>
          {/* 原手刻 toggle 是普通 button，沒有 role="switch" 與 aria-checked，
              螢幕閱讀器只會唸「按鈕」；Base UI Switch 兩者皆備，鍵盤操作也內建 */}
          <Switch
            checked={settings.highContrast}
            onCheckedChange={() => toggle('highContrast')}
            aria-label="切換高對比模式"
          />
        </SettingRow>
      </SettingSection>

      {/* ── 通知設定 ── */}
      <SettingSection
        title={t('settings.notificationsTitle')}
        description={t('settings.notificationsDesc')}
        delayMs={220}
      >
        <ItemGroup>
          <SettingRow label={t('settings.medicationReminder')}>
            <Switch
              checked={settings.notifyReminder}
              onCheckedChange={() => toggle('notifyReminder')}
              aria-label="切換用藥提醒"
            />
          </SettingRow>
          <ItemSeparator />
          <SettingRow label={t('settings.familyAlert')}>
            <Switch
              checked={settings.notifyFamily}
              onCheckedChange={() => toggle('notifyFamily')}
              aria-label="切換家人健康通知"
            />
          </SettingRow>
        </ItemGroup>
      </SettingSection>

      {/* ── 語音回覆 ── */}
      <SettingSection
        title={t('settings.voiceTitle')}
        description={t('settings.voiceDesc')}
        delayMs={280}
      >
        <SettingRow label={t('settings.voiceReplyToggle')}>
          <Switch
            checked={settings.voiceReplyEnabled}
            onCheckedChange={() => toggle('voiceReplyEnabled')}
            aria-label="切換語音回覆"
          />
        </SettingRow>

        {/* 語速三檔互斥，沿用字體大小區塊的 ToggleGroup 模式；
            aria-label 用專屬的「語速」文字（而非區塊標題），避免與下方音色群組同名，
            否則螢幕閱讀器使用者無法分辨兩組各是什麼 */}
        <div className="mt-3 flex flex-col gap-2.5">
          <span className={GROUP_LABEL}>{t('settings.voiceRateLabel')}</span>
          <ToggleGroup
            variant="primary"
            className="w-full"
            value={[settings.voiceRate]}
            onValueChange={(groupValue) => {
              const next = groupValue[0] as SettingsState['voiceRate'] | undefined;
              if (next) handleVoiceRate(next);
            }}
            aria-label={t('settings.voiceRateLabel')}
          >
            {(['slow', 'normal', 'fast'] as const).map((rate) => (
              <ToggleGroupItem key={rate} value={rate} className={SEGMENT_ITEM}>
                {voiceRateLabelMap[rate]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* 音色兩檔（女聲／男聲）互斥，同語速群組的 ToggleGroup 模式；
            送出給後端的值必須是 female/male，顯示標籤與送出值分離（voiceGenderLabelMap） */}
        <div className="mt-3 flex flex-col gap-2.5">
          <span className={GROUP_LABEL}>{t('settings.voiceGenderLabel')}</span>
          <ToggleGroup
            variant="primary"
            className="w-full"
            value={[settings.voiceGender]}
            onValueChange={(groupValue) => {
              const next = groupValue[0] as SettingsState['voiceGender'] | undefined;
              if (next) handleVoiceGender(next);
            }}
            aria-label={t('settings.voiceGenderLabel')}
          >
            {(['female', 'male'] as const).map((gender) => (
              <ToggleGroupItem key={gender} value={gender} className={SEGMENT_ITEM}>
                {voiceGenderLabelMap[gender]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </SettingSection>

      {/* ── 關於 ── */}
      <SettingSection title={t('settings.aboutTitle')} delayMs={340}>
        <ItemGroup>
          <SettingRow label={t('settings.version')}>
            <span className="num font-bold">1.0.0</span>
          </SettingRow>
          <ItemSeparator />
          <SettingRow label={t('settings.team')}>
            <span className="num font-bold">CARE Team</span>
          </SettingRow>
        </ItemGroup>
      </SettingSection>

      {/* ── 帳號（登出入口統一收在這裡，不放首頁／Header 以免誤觸） ── */}
      <SettingSection
        title={t('settings.accountTitle')}
        description={t('settings.accountDesc')}
        delayMs={400}
      >
        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          {t('settings.logout')}
        </Button>
      </SettingSection>
    </div>
  );
};

export default SettingsPage;

/* 設定的型別／預設值／套用邏輯已移至 lib/settings，
   讓本頁能被 code splitting 切出主包（App 啟動時需要那些值）。 */
