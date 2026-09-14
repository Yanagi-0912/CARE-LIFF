import { describe, expect, it } from 'vitest';

import i18n from '../i18n';
import {
  CHRONIC_OPTIONS,
  GENDER_OPTIONS,
  addCustomChronic,
  defaultData,
  profileToFormValues,
} from '../pages/PersonalHealth/healthForm';

const t = (key: string) => i18n.t(key);

describe('選項的 value 必須等於 i18n key 的最後一段', () => {
  // 這是整個設計的支點：值與 key 同名，「拿值拼出翻譯 key」才不可能查不到。
  // 家庭頁曾因為值是中文、key 是英文，把「男」原樣顯示給泰文使用者看了很久。
  it.each([...GENDER_OPTIONS, ...CHRONIC_OPTIONS])('$value', ({ value, labelKey }) => {
    expect(labelKey.split('.').pop()).toBe(value);
  });

  it('每個 value 在六個語系都翻得出東西（不會退回 key 原文）', () => {
    for (const language of ['zh-TW', 'en', 'id', 'vi', 'th', 'ja']) {
      for (const { labelKey } of [...GENDER_OPTIONS, ...CHRONIC_OPTIONS]) {
        const translated = i18n.getFixedT(language)(labelKey);
        expect(translated).not.toBe(labelKey);
        expect(translated).not.toBe('');
      }
    }
  });
});

describe('addCustomChronic', () => {
  it('空白或只有空格 → 什麼都不做', () => {
    expect(addCustomChronic([], [], '   ', t)).toEqual({
      selected: [],
      custom: [],
      status: 'empty',
    });
  });

  it('一般病名 → 加進自訂清單', () => {
    expect(addCustomChronic(['asthma'], [], '腦溢血', t)).toEqual({
      selected: ['asthma'],
      custom: ['腦溢血'],
      status: 'added',
    });
  });

  it('前後空白會被去掉', () => {
    expect(addCustomChronic([], [], '  腦溢血  ', t).custom).toEqual(['腦溢血']);
  });

  it('已經在自訂清單裡 → 不重複新增', () => {
    expect(addCustomChronic([], ['腦溢血'], '腦溢血', t)).toEqual({
      selected: [],
      custom: ['腦溢血'],
      status: 'duplicate',
    });
  });

  it('打到固定選項 → 幫他勾起那張卡片，存的是 code 而不是他打的字', () => {
    expect(addCustomChronic([], [], '高血壓', t)).toEqual({
      selected: ['hypertension'],
      custom: [],
      status: 'matchedFixed',
    });
  });

  it('打到已經勾起來的固定選項 → 視為重複', () => {
    expect(addCustomChronic(['hypertension'], [], '高血壓', t)).toEqual({
      selected: ['hypertension'],
      custom: [],
      status: 'duplicate',
    });
  });

  it('比對的是當前語系的病名，不是 code', async () => {
    // 舊版只比對中文，泰文使用者打自己語言的病名會多出一筆重複的自訂標籤
    await i18n.changeLanguage('th');
    expect(addCustomChronic([], [], 'ความดันโลหิตสูง', t)).toEqual({
      selected: ['hypertension'],
      custom: [],
      status: 'matchedFixed',
    });

    // 同一個語系下，中文的「高血壓」就只是一筆普通的自訂病名
    expect(addCustomChronic([], [], '高血壓', t).status).toBe('added');
    await i18n.changeLanguage('zh-TW');
  });

  it('英文大小寫不影響比對', async () => {
    await i18n.changeLanguage('en');
    expect(addCustomChronic([], [], 'hypertension', t).selected).toEqual(['hypertension']);
    expect(addCustomChronic([], [], 'Diabetes', t).selected).toEqual(['diabetes']);
    await i18n.changeLanguage('zh-TW');
  });

  it('不會就地修改傳進來的陣列', () => {
    const selected: string[] = [];
    const custom: string[] = [];
    addCustomChronic(selected, custom, '腦溢血', t);
    expect(selected).toEqual([]);
    expect(custom).toEqual([]);
  });
});

describe('profileToFormValues', () => {
  it('null（404，還沒建檔）與 undefined → 空白表單', () => {
    expect(profileToFormValues(null)).toEqual(defaultData);
    expect(profileToFormValues(undefined)).toEqual(defaultData);
  });

  it('空白表單的陣列是新的，改它不會汙染 defaultData', () => {
    const values = profileToFormValues(null);
    values.chronicDisease.push('asthma');
    expect(defaultData.chronicDisease).toEqual([]);
  });

  it('舊資料的佔位值（age 0、height 1、weight 1、gender unknown）→ 空字串', () => {
    expect(
      profileToFormValues({ name: '王大明', gender: 'unknown', age: 0, height: 1, weight: 1 }),
    ).toMatchObject({ name: '王大明', gender: '', age: '', height: '', weight: '' });
  });

  it('新版後端的 null → 空字串', () => {
    expect(
      profileToFormValues({ gender: 'female', age: null, height: null, weight: null }),
    ).toMatchObject({ gender: 'female', age: '', height: '', weight: '' });
  });

  it('身高體重是 0 也當成沒填（下限分別是 30 與 1，0 不會是有效值）', () => {
    expect(profileToFormValues({ height: 0, weight: 0 })).toMatchObject({
      height: '',
      weight: '',
    });
  });

  it('真的數值轉成字串，小數保留', () => {
    expect(
      profileToFormValues({ gender: 'male', age: 72, height: 168.5, weight: 60.2 }),
    ).toMatchObject({ gender: 'male', age: '72', height: '168.5', weight: '60.2' });
  });

  it('慢性病與病史照搬，缺欄位時是空的', () => {
    expect(
      profileToFormValues({
        chronic_diseases: ['hypertension'],
        chronic_custom: ['痛風'],
        major_illness_history: '心導管手術',
      }),
    ).toMatchObject({
      chronicDisease: ['hypertension'],
      customChronic: ['痛風'],
      majorIllness: '心導管手術',
      surgeryHistory: '',
    });
  });
});
