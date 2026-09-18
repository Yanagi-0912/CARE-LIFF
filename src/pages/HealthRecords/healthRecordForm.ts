/**
 * 健康紀錄表單的選項、驗證規則與資料轉換——不依賴 React 的純資料與純函式，
 * 抽出來才測得到（同 `pages/PersonalHealth/healthForm.ts` 的理由）。
 *
 * 範圍常數對應後端 `app/models/health.py`。這裡的檢查只是「友善的預先提示」，
 * 不是最終把關——後端的 422 才是權威判定（見 `api/healthApi.ts` 的
 * `parseError`），表單送出失敗時要顯示的是後端回來的訊息，不是這裡算出來的。
 */
import { z } from 'zod';
import type {
  HealthAlertThreshold,
  MealContext,
  MenstrualFlow,
  UpdateHealthAlertThresholdRequest,
} from '../../types/health';
import { todayTaipei } from '@/lib/taipeiCalendar';

export type TranslateFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

// 合理輸入範圍，對應後端 SYSTOLIC_MIN/MAX 等常數（app/models/health.py）。
export const SYSTOLIC_MIN = 50;
export const SYSTOLIC_MAX = 300;
export const DIASTOLIC_MIN = 30;
export const DIASTOLIC_MAX = 200;
export const PULSE_MIN = 30;
export const PULSE_MAX = 250;
export const GLUCOSE_MIN = 20;
export const GLUCOSE_MAX = 800;
export const MENSTRUAL_MAX_SPAN_DAYS = 15;
export const MENSTRUAL_NOTE_MAX_LENGTH = 200;

function numberField(
  t: TranslateFn,
  opts: { labelKey: string; min: number; max: number; required: boolean },
) {
  return z.string().superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (!trimmed) {
      if (opts.required) {
        ctx.addIssue({
          code: 'custom',
          message: t('health.validation.required', { label: t(opts.labelKey) }),
        });
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < opts.min || parsed > opts.max) {
      ctx.addIssue({
        code: 'custom',
        message: t('health.validation.range', {
          label: t(opts.labelKey),
          min: opts.min,
          max: opts.max,
        }),
      });
    }
  });
}

// ── 血壓 ────────────────────────────────────────────────────────────────

export interface BloodPressureFormValues {
  systolic: string;
  diastolic: string;
  pulse: string;
}

export const bloodPressureDefaults: BloodPressureFormValues = {
  systolic: '',
  diastolic: '',
  pulse: '',
};

export function bloodPressureSchema(t: TranslateFn) {
  return z
    .object({
      systolic: numberField(t, {
        labelKey: 'health.field.systolic',
        min: SYSTOLIC_MIN,
        max: SYSTOLIC_MAX,
        required: true,
      }),
      diastolic: numberField(t, {
        labelKey: 'health.field.diastolic',
        min: DIASTOLIC_MIN,
        max: DIASTOLIC_MAX,
        required: true,
      }),
      pulse: numberField(t, {
        labelKey: 'health.field.pulse',
        min: PULSE_MIN,
        max: PULSE_MAX,
        required: false,
      }),
    })
    .superRefine((values, ctx) => {
      const systolic = Number(values.systolic.trim());
      const diastolic = Number(values.diastolic.trim());
      if (
        values.systolic.trim() &&
        values.diastolic.trim() &&
        Number.isFinite(systolic) &&
        Number.isFinite(diastolic) &&
        systolic <= diastolic
      ) {
        ctx.addIssue({
          code: 'custom',
          message: t('health.validation.systolicGreater'),
          path: ['systolic'],
        });
      }
    });
}

// ── 血糖 ────────────────────────────────────────────────────────────────

export interface BloodGlucoseFormValues {
  glucose: string;
  /** 存的是 MealContext 的值或空字串（尚未選擇）；zod 只驗證「非空」，
   *  不narrow 成聯集型別——同 PersonalHealth/healthForm.ts 的 gender 欄位，
   *  避免 RHF 的 Resolver 型別與這裡的表單型別對不上。 */
  mealContext: string;
}

export const bloodGlucoseDefaults: BloodGlucoseFormValues = {
  glucose: '',
  mealContext: '',
};

export function bloodGlucoseSchema(t: TranslateFn) {
  return z.object({
    glucose: numberField(t, {
      labelKey: 'health.field.glucose',
      min: GLUCOSE_MIN,
      max: GLUCOSE_MAX,
      required: true,
    }),
    mealContext: z.string().min(1, t('health.validation.mealContextRequired')),
  });
}

export const MEAL_CONTEXT_OPTIONS: { value: MealContext; labelKey: string }[] = [
  { value: 'fasting', labelKey: 'health.mealContext.fasting' },
  { value: 'before_meal', labelKey: 'health.mealContext.before_meal' },
  { value: 'after_meal', labelKey: 'health.mealContext.after_meal' },
  { value: 'bedtime', labelKey: 'health.mealContext.bedtime' },
  { value: 'random', labelKey: 'health.mealContext.random' },
];

export const FLOW_OPTIONS: { value: MenstrualFlow; labelKey: string }[] = [
  { value: 'light', labelKey: 'health.flow.light' },
  { value: 'medium', labelKey: 'health.flow.medium' },
  { value: 'heavy', labelKey: 'health.flow.heavy' },
];

// ── 提醒範圍 ────────────────────────────────────────────────────────────
//
// PUT /alert-thresholds 是整份覆寫——省略的欄位會被後端當成清除。表單因此
// 一律讀出全部七項的目前值再整份送出，不會只送使用者這次打開的那個分頁
// 相關的欄位，否則從血糖分頁開啟就會把血壓的範圍一併清空。

export interface ThresholdFormValues {
  systolicHigh: string;
  systolicLow: string;
  diastolicHigh: string;
  diastolicLow: string;
  glucoseFastingHigh: string;
  glucoseNonfastingHigh: string;
  glucoseLow: string;
}

export const thresholdDefaults: ThresholdFormValues = {
  systolicHigh: '',
  systolicLow: '',
  diastolicHigh: '',
  diastolicLow: '',
  glucoseFastingHigh: '',
  glucoseNonfastingHigh: '',
  glucoseLow: '',
};

export function thresholdSchema(t: TranslateFn) {
  return z
    .object({
      systolicHigh: numberField(t, {
        labelKey: 'health.threshold.systolicHigh',
        min: SYSTOLIC_MIN,
        max: SYSTOLIC_MAX,
        required: false,
      }),
      systolicLow: numberField(t, {
        labelKey: 'health.threshold.systolicLow',
        min: SYSTOLIC_MIN,
        max: SYSTOLIC_MAX,
        required: false,
      }),
      diastolicHigh: numberField(t, {
        labelKey: 'health.threshold.diastolicHigh',
        min: DIASTOLIC_MIN,
        max: DIASTOLIC_MAX,
        required: false,
      }),
      diastolicLow: numberField(t, {
        labelKey: 'health.threshold.diastolicLow',
        min: DIASTOLIC_MIN,
        max: DIASTOLIC_MAX,
        required: false,
      }),
      glucoseFastingHigh: numberField(t, {
        labelKey: 'health.threshold.glucoseFastingHigh',
        min: GLUCOSE_MIN,
        max: GLUCOSE_MAX,
        required: false,
      }),
      glucoseNonfastingHigh: numberField(t, {
        labelKey: 'health.threshold.glucoseNonfastingHigh',
        min: GLUCOSE_MIN,
        max: GLUCOSE_MAX,
        required: false,
      }),
      glucoseLow: numberField(t, {
        labelKey: 'health.threshold.glucoseLow',
        min: GLUCOSE_MIN,
        max: GLUCOSE_MAX,
        required: false,
      }),
    })
    .superRefine((values, ctx) => {
      const pairs: [keyof ThresholdFormValues, keyof ThresholdFormValues][] = [
        ['systolicHigh', 'systolicLow'],
        ['diastolicHigh', 'diastolicLow'],
        ['glucoseFastingHigh', 'glucoseLow'],
        ['glucoseNonfastingHigh', 'glucoseLow'],
      ];
      for (const [upperKey, lowerKey] of pairs) {
        const upperRaw = values[upperKey].trim();
        const lowerRaw = values[lowerKey].trim();
        if (!upperRaw || !lowerRaw) continue;
        const upper = Number(upperRaw);
        const lower = Number(lowerRaw);
        if (Number.isFinite(upper) && Number.isFinite(lower) && upper <= lower) {
          ctx.addIssue({
            code: 'custom',
            message: t('health.validation.upperGreaterThanLower'),
            path: [upperKey],
          });
        }
      }
    });
}

/** 後端的提醒範圍 → 表單值（全部字串，沒設定就是空字串） */
export function thresholdToFormValues(
  threshold: HealthAlertThreshold | null | undefined,
): ThresholdFormValues {
  if (!threshold) return { ...thresholdDefaults };
  const toField = (value: number | null | undefined) => (value == null ? '' : String(value));
  return {
    systolicHigh: toField(threshold.systolic_high),
    systolicLow: toField(threshold.systolic_low),
    diastolicHigh: toField(threshold.diastolic_high),
    diastolicLow: toField(threshold.diastolic_low),
    glucoseFastingHigh: toField(threshold.glucose_fasting_high),
    glucoseNonfastingHigh: toField(threshold.glucose_nonfasting_high),
    glucoseLow: toField(threshold.glucose_low),
  };
}

/** 表單值 → PUT 的 body。空字串一律轉成明確的 null（清除該項），不省略欄位。 */
export function formValuesToThresholdPayload(
  values: ThresholdFormValues,
): UpdateHealthAlertThresholdRequest {
  const toValue = (value: string) => (value.trim() ? Number(value.trim()) : null);
  return {
    systolic_high: toValue(values.systolicHigh),
    systolic_low: toValue(values.systolicLow),
    diastolic_high: toValue(values.diastolicHigh),
    diastolic_low: toValue(values.diastolicLow),
    glucose_fasting_high: toValue(values.glucoseFastingHigh),
    glucose_nonfasting_high: toValue(values.glucoseNonfastingHigh),
    glucose_low: toValue(values.glucoseLow),
  };
}

// ── 經期 ────────────────────────────────────────────────────────────────

export interface MenstrualFormValues {
  startDate: string;
  endDate: string;
  /** 存的是 MenstrualFlow 的值或空字串（尚未選擇），理由同 BloodGlucoseFormValues.mealContext。 */
  flow: string;
  note: string;
}

export const menstrualDefaults: MenstrualFormValues = {
  startDate: '',
  endDate: '',
  flow: '',
  note: '',
};

/** 兩個 YYYY-MM-DD 之間的天數是否超過經期天數上限；呼叫端已先確認 end >= start。 */
function spanExceedsMax(startDate: string, endDate: string): boolean {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000);
  return days > MENSTRUAL_MAX_SPAN_DAYS;
}

export function menstrualSchema(t: TranslateFn) {
  return z
    .object({
      startDate: z
        .string()
        .min(1, t('health.validation.required', { label: t('health.menstrual.startDate') })),
      endDate: z.string(),
      flow: z.string(),
      note: z.string().max(
        MENSTRUAL_NOTE_MAX_LENGTH,
        t('health.validation.tooLong', { max: MENSTRUAL_NOTE_MAX_LENGTH }),
      ),
    })
    .superRefine((values, ctx) => {
      if (values.startDate && values.startDate > todayTaipei()) {
        ctx.addIssue({
          code: 'custom',
          message: t('health.menstrual.startNotFuture'),
          path: ['startDate'],
        });
      }
      if (values.startDate && values.endDate) {
        if (values.endDate < values.startDate) {
          ctx.addIssue({
            code: 'custom',
            message: t('health.menstrual.endBeforeStart'),
            path: ['endDate'],
          });
        } else if (spanExceedsMax(values.startDate, values.endDate)) {
          ctx.addIssue({
            code: 'custom',
            message: t('health.menstrual.spanTooLong', { max: MENSTRUAL_MAX_SPAN_DAYS }),
            path: ['endDate'],
          });
        }
      }
    });
}

// 事後補上／修改一筆既有紀錄的結束日期（menstrual-cycle-log 規格「事後補上結束
// 日期」）；與 menstrualSchema 分開，因為這裡的 startDate 是既有紀錄的值、不是
// 使用者輸入，不需要再驗證一次「不得晚於今天」。驗證規則同新增表單的結束日期：
// 不得早於開始日期、天數不得超過上限，後端 422 是最終判定。

export interface MenstrualEndDateFormValues {
  endDate: string;
}

export const menstrualEndDateDefaults: MenstrualEndDateFormValues = {
  endDate: '',
};

export function menstrualEndDateSchema(t: TranslateFn, startDate: string) {
  return z
    .object({
      endDate: z
        .string()
        .min(1, t('health.validation.required', { label: t('health.menstrual.endDate') })),
    })
    .superRefine((values, ctx) => {
      // 空字串已經被上面的 required 檔住，這裡不用再疊加一次比較日期字串
      // 大小的錯誤（空字串在字典序上必然「早於」任何實際日期）。
      if (!values.endDate) return;
      if (values.endDate < startDate) {
        ctx.addIssue({
          code: 'custom',
          message: t('health.menstrual.endBeforeStart'),
          path: ['endDate'],
        });
      } else if (spanExceedsMax(startDate, values.endDate)) {
        ctx.addIssue({
          code: 'custom',
          message: t('health.menstrual.spanTooLong', { max: MENSTRUAL_MAX_SPAN_DAYS }),
          path: ['endDate'],
        });
      }
    });
}
