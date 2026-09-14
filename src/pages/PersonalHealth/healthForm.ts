/*個人健康表單的選項與驗證規則。
  從頁面抽出來的理由：這些都是不依賴 React 的純資料與純函式，放在這裡才測得到。
 */
import type { HealthProfile } from '../../api/profileApi';

// value對應後端nodes.py中定義的_CHRONIC_CODE_LABELS
export const GENDER_OPTIONS = [
    { value: 'male', labelKey: 'personalHealth.gender.male' },
    { value: 'female', labelKey: 'personalHealth.gender.female' },
] as const;

export const CHRONIC_OPTIONS = [
    { value: 'hypertension', labelKey: 'personalHealth.chronic.hypertension' },
    { value: 'diabetes', labelKey: 'personalHealth.chronic.diabetes' },
    { value: 'hyperlipidemia', labelKey: 'personalHealth.chronic.hyperlipidemia' },
    { value: 'heartDisease', labelKey: 'personalHealth.chronic.heartDisease' },
    { value: 'kidneyDisease', labelKey: 'personalHealth.chronic.kidneyDisease' },
    { value: 'asthma', labelKey: 'personalHealth.chronic.asthma' },
    { value: 'copd', labelKey: 'personalHealth.chronic.copd' },
    { value: 'cancer', labelKey: 'personalHealth.chronic.cancer' },
] as const;

export interface HealthData {
    name: string;
    gender: string;
    height: string;
    weight: string;
    age: string;
    /** 勾選的固定選項，存 code。對應後端的 chronic_diseases */
    chronicDisease: string[];
    /** 使用者自己打的病名，原文照存、永不翻譯。對應後端的 chronic_custom */
    customChronic: string[];
    majorIllness: string;
    surgeryHistory: string;
}

export const defaultData: HealthData = {
    name: '',
    gender: '',
    height: '',
    weight: '',
    age: '',
    chronicDisease: [],
    customChronic: [],
    majorIllness: '',
    surgeryHistory: '',
};

export const numericFieldMeta = {
    age: {
        // 下限 1 而不是 0：0 是舊的佔位值，讀進來會被當成沒填（見 PROFILE_PLACEHOLDER），
        // 允許輸入 0 等於讓使用者存了一個下次打開就消失的值。後端的驗證同為 1。
        min: 1,
        max: 130,
        labelKey: 'personalHealth.field.age',
        unitKey: 'personalHealth.unit.age',
    },
    height: {
        min: 30,
        max: 300,
        labelKey: 'personalHealth.field.height',
        unitKey: 'personalHealth.unit.height',
    },
    weight: {
        min: 1,
        max: 500,
        labelKey: 'personalHealth.field.weight',
        unitKey: 'personalHealth.unit.weight',
    },
} as const;

export type NumericFieldName = keyof typeof numericFieldMeta;

export type TranslateFn = (
    key: string,
    options?: Record<string, string | number>,
) => string;

export const validateNumericField = (
    value: string,
    field: NumericFieldName,
    t: TranslateFn,
) => {
    const meta = numericFieldMeta[field];
    const label = t(meta.labelKey);
    if (!value.trim()) {
        return t('personalHealth.validation.required', { label });
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < meta.min || parsedValue > meta.max) {
        return t('personalHealth.validation.range', {
            label,
            min: meta.min,
            max: meta.max,
            unit: t(meta.unitKey),
        });
    }
    return '';
};

export type AddChronicStatus =
    /** 空白，什麼也沒做 */
    | 'empty'
    /** 已經在清單裡（固定選項或自訂皆算） */
    | 'duplicate'
    /** 打的字剛好是固定選項，直接幫他勾起那張卡片而不是多開一筆自訂 */
    | 'matchedFixed'
    | 'added';

// 把輸入框的內容加進慢性病清單。

export function addCustomChronic(
    selected: string[],
    custom: string[],
    draft: string,
    t: TranslateFn,
): { selected: string[]; custom: string[]; status: AddChronicStatus } {
    const name = draft.trim();
    if (!name) return { selected, custom, status: 'empty' };

    /* 比對「當前語系的病名」而不是 code：使用者打的是「高血壓」或
     * ความดันโลหิตสูง，不會有人去打 hypertension。
     * 舊版只比對中文，泰文使用者打自己語言的病名會多出一筆重複的自訂標籤。 */
    const matched = CHRONIC_OPTIONS.find(
        (option) => t(option.labelKey).toLowerCase() === name.toLowerCase(),
    );
    if (matched) {
        if (selected.includes(matched.value)) return { selected, custom, status: 'duplicate' };
        return { selected: [...selected, matched.value], custom, status: 'matchedFixed' };
    }

    if (custom.includes(name)) return { selected, custom, status: 'duplicate' };
    return { selected, custom: [...custom, name], status: 'added' };
}

/**
 * 舊版後端建帳號時塞進去的佔位值。新版沒填就回 null，但既有資料還留著這些值，
 * 讀進來一律當成「沒填」。
 *
 * 數值欄位的 0 也算沒填：身高下限 30、體重下限 1（見 numericFieldMeta），
 * 0 不會是有效值；年齡的佔位值本身就是 0。
 */
export const PROFILE_PLACEHOLDER = {
    age: 0,
    height: 1,
    weight: 1,
    gender: 'unknown',
} as const;

const numericToField = (value: number | null | undefined, placeholder: number) =>
    value == null || value === 0 || value === placeholder ? '' : String(value);

/**
 * 後端的健康檔案 → 表單值（全部是字串，沒填就是空字串）。
 *
 * 「我自己」那一頁、代填對話框、家人卡片都走這一支，「什麼算沒填」只有這一份
 * 定義。以前各寫一份：家人卡片早就會濾掉 height 1，自己那一頁卻把 1 帶進輸入框，
 * 使用者得先把「身高 1」改掉才按得了下一步；年齡 0 則會被原樣存回去。
 *
 * `null`（404，還沒建檔）與 `undefined` 都回傳空白表單。
 */
export function profileToFormValues(profile: HealthProfile | null | undefined): HealthData {
    if (!profile) return { ...defaultData, chronicDisease: [], customChronic: [] };
    return {
        name: profile.name ?? '',
        gender:
            !profile.gender || profile.gender === PROFILE_PLACEHOLDER.gender ? '' : profile.gender,
        age: numericToField(profile.age, PROFILE_PLACEHOLDER.age),
        height: numericToField(profile.height, PROFILE_PLACEHOLDER.height),
        weight: numericToField(profile.weight, PROFILE_PLACEHOLDER.weight),
        chronicDisease: profile.chronic_diseases ?? [],
        customChronic: profile.chronic_custom ?? [],
        majorIllness: profile.major_illness_history ?? '',
        surgeryHistory: profile.surgery_history ?? '',
    };
}
