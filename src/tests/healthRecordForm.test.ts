import { describe, expect, it } from 'vitest';

import i18n from '../i18n';
import { healthRecordFeatureMessages } from '../i18n/healthRecordMessages';
import {
  bloodGlucoseSchema,
  bloodPressureSchema,
  formValuesToThresholdPayload,
  menstrualDefaults,
  menstrualSchema,
  thresholdDefaults,
  thresholdSchema,
  thresholdToFormValues,
  todayTaipei,
} from '../pages/HealthRecords/healthRecordForm';

const t = (key: string, options?: Record<string, string | number>) => i18n.t(key, options);

describe('健康紀錄頁 i18n：六語系 key 完全一致（9.5）', () => {
  const languages = ['zh-TW', 'en', 'id', 'vi', 'th', 'ja'] as const;
  const zhKeys = Object.keys(healthRecordFeatureMessages['zh-TW']).sort();

  it.each(languages)('%s 的 key 集合與 zh-TW 完全相同', (lang) => {
    const keys = Object.keys(healthRecordFeatureMessages[lang]).sort();
    expect(keys).toEqual(zhKeys);
  });

  it('每個 key 在六語系都翻得出非空字串（不會退回 key 原文）', async () => {
    for (const lang of languages) {
      await i18n.changeLanguage(lang);
      for (const key of zhKeys) {
        const value = i18n.t(key);
        expect(value, `${lang} / ${key} 未翻譯`).not.toBe(key);
        expect(value, `${lang} / ${key} 是空字串`).not.toBe('');
      }
    }
    await i18n.changeLanguage('zh-TW');
  });

  it('非中文語系（日文除外，日文與中文共用漢字）不會退回中文原文', async () => {
    await i18n.changeLanguage('zh-TW');
    const zhValues = new Map(zhKeys.map((key) => [key, i18n.t(key)]));

    for (const lang of ['en', 'id', 'vi', 'th'] as const) {
      await i18n.changeLanguage(lang);
      for (const key of zhKeys) {
        expect(i18n.t(key), `${lang} / ${key} 退回了 zh-TW`).not.toBe(zhValues.get(key));
      }
    }
    await i18n.changeLanguage('zh-TW');
  });
});

describe('bloodPressureSchema', () => {
  it('收縮壓、舒張壓為必填', () => {
    const result = bloodPressureSchema(t).safeParse({ systolic: '', diastolic: '', pulse: '', measuredAt: '' });
    expect(result.success).toBe(false);
  });

  it('超出範圍（收縮壓 50–300）時回報錯誤', () => {
    const result = bloodPressureSchema(t).safeParse({ systolic: '301', diastolic: '80', pulse: '', measuredAt: '' });
    expect(result.success).toBe(false);
  });

  it('收縮壓必須大於舒張壓，相等也不合法', () => {
    const result = bloodPressureSchema(t).safeParse({ systolic: '90', diastolic: '90', pulse: '', measuredAt: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('收縮壓必須大於舒張壓');
    }
  });

  it('脈搏選填，留空時合法', () => {
    const result = bloodPressureSchema(t).safeParse({ systolic: '120', diastolic: '80', pulse: '', measuredAt: '' });
    expect(result.success).toBe(true);
  });

  it('合法輸入通過驗證', () => {
    const result = bloodPressureSchema(t).safeParse({ systolic: '120', diastolic: '80', pulse: '70', measuredAt: '' });
    expect(result.success).toBe(true);
  });
});

describe('bloodGlucoseSchema', () => {
  it('血糖必填且需在 20–800 之間', () => {
    expect(bloodGlucoseSchema(t).safeParse({ glucose: '', mealContext: 'fasting', measuredAt: '' }).success).toBe(false);
    expect(bloodGlucoseSchema(t).safeParse({ glucose: '801', mealContext: 'fasting', measuredAt: '' }).success).toBe(false);
    expect(bloodGlucoseSchema(t).safeParse({ glucose: '100', mealContext: 'fasting', measuredAt: '' }).success).toBe(true);
  });

  it('量測情境必填', () => {
    const result = bloodGlucoseSchema(t).safeParse({ glucose: '100', mealContext: '', measuredAt: '' });
    expect(result.success).toBe(false);
  });
});

describe('thresholdSchema：上限必須大於下限（9.3）', () => {
  it('四組上下限相等或反過來都不合法', () => {
    const pairs = [
      { systolicHigh: '90', systolicLow: '90' },
      { diastolicHigh: '60', diastolicLow: '70' },
      { glucoseFastingHigh: '100', glucoseLow: '100' },
      { glucoseNonfastingHigh: '90', glucoseLow: '110' },
    ];
    for (const overrides of pairs) {
      const result = thresholdSchema(t).safeParse({ ...thresholdDefaults, ...overrides });
      expect(result.success, JSON.stringify(overrides)).toBe(false);
    }
  });

  it('全部留空是合法的（代表清除全部設定）', () => {
    expect(thresholdSchema(t).safeParse(thresholdDefaults).success).toBe(true);
  });

  it('上限大於下限時合法', () => {
    const result = thresholdSchema(t).safeParse({
      ...thresholdDefaults,
      systolicHigh: '140',
      systolicLow: '90',
    });
    expect(result.success).toBe(true);
  });
});

describe('threshold 表單 <-> API 轉換', () => {
  it('thresholdToFormValues 把 null 轉成空字串', () => {
    expect(
      thresholdToFormValues({
        user_id: 'U-1',
        systolic_high: 140,
        systolic_low: null,
        diastolic_high: null,
        diastolic_low: null,
        glucose_fasting_high: null,
        glucose_nonfasting_high: null,
        glucose_low: null,
        updated_by: 'U-1',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ).toMatchObject({ systolicHigh: '140', systolicLow: '' });
  });

  it('formValuesToThresholdPayload 把空字串轉成明確的 null（清除該項），不省略欄位', () => {
    const payload = formValuesToThresholdPayload({ ...thresholdDefaults, systolicHigh: '140' });
    expect(payload).toEqual({
      systolic_high: 140,
      systolic_low: null,
      diastolic_high: null,
      diastolic_low: null,
      glucose_fasting_high: null,
      glucose_nonfasting_high: null,
      glucose_low: null,
    });
  });
});

describe('menstrualSchema', () => {
  it('開始日期必填', () => {
    expect(menstrualSchema(t).safeParse(menstrualDefaults).success).toBe(false);
  });

  it('開始日期不得晚於今天', () => {
    const result = menstrualSchema(t).safeParse({ ...menstrualDefaults, startDate: '2999-01-01' });
    expect(result.success).toBe(false);
  });

  it('結束日期不得早於開始日期', () => {
    const result = menstrualSchema(t).safeParse({
      ...menstrualDefaults,
      startDate: '2026-01-10',
      endDate: '2026-01-05',
    });
    expect(result.success).toBe(false);
  });

  it('經期天數不得超過 15 天', () => {
    const result = menstrualSchema(t).safeParse({
      ...menstrualDefaults,
      startDate: '2026-01-01',
      endDate: '2026-01-20',
    });
    expect(result.success).toBe(false);
  });

  it('合法區間通過驗證', () => {
    const result = menstrualSchema(t).safeParse({
      ...menstrualDefaults,
      startDate: '2026-01-01',
      endDate: '2026-01-05',
    });
    expect(result.success).toBe(true);
  });

  it('todayTaipei 回傳 YYYY-MM-DD 格式', () => {
    expect(todayTaipei()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
