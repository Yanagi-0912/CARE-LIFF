/**
 * 個人健康紀錄的型別，對應後端 `app/models/health.py` 與
 * `app/routers/users/health.py`（`/api/health` 下的提醒範圍、血壓血糖量測、
 * 經期、計步四種資源）。
 *
 * 等級（`level`）由後端依當下的提醒範圍算好並隨紀錄回傳，前端一律照原樣
 * 呈現，不在前端重算範圍比對（task-8-11-dispatch-notes.md 的 Task 9 段落：
 * 「no value comparison on the frontend」）。
 */

/** 量測種類：血壓／血糖（對應後端 MeasurementKind） */
export type MeasurementKind = 'blood_pressure' | 'blood_glucose';

/** 血糖的量測情境（對應後端 MealContext） */
export type MealContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';

/**
 * 後端算好的等級（對應後端 HealthLevel）。呈現規則見
 * task-8-11-dispatch-notes.md 的 Task 9 段落：above_range／below_range 用
 * 警示樣式，within_range 用正常樣式，no_threshold 用中性樣式並提示設定範圍，
 * 三者 SHALL NOT 互相混用樣式。
 */
export type HealthLevel = 'within_range' | 'above_range' | 'below_range' | 'no_threshold';

/** 經期血量（對應後端 MenstrualFlow） */
export type MenstrualFlow = 'light' | 'medium' | 'heavy';

// ── 血壓／血糖量測 ──────────────────────────────────────────────────────

/** POST /api/health/measurements 的血壓 body（對應後端 CreateBloodPressureRequest） */
export interface CreateBloodPressureRequest {
  systolic: number;
  diastolic: number;
  pulse?: number;
  /** ISO datetime；省略時由後端補上送出當下時間，不得晚於送出時間 5 分鐘以上 */
  measured_at?: string;
}

/**
 * POST /api/health/measurements 的血糖 body（對應後端 CreateBloodGlucoseRequest）。
 * 單位固定 mg/dL，系統不接受 mmol/L。
 */
export interface CreateBloodGlucoseRequest {
  glucose_mg_dl: number;
  meal_context: MealContext;
  measured_at?: string;
}

/**
 * POST /api/health/measurements 的請求 body：血壓、血糖擇一送出，後端以
 * Pydantic smart union 依欄位判斷種類（兩者皆 `extra="forbid"`，混雜欄位
 * 一律 422，不會被悄悄吃下）。
 */
export type CreateMeasurementRequest = CreateBloodPressureRequest | CreateBloodGlucoseRequest;

/**
 * 一筆血壓或血糖紀錄（對應後端 HealthMeasurement）。血壓與血糖共用同一個
 * 形狀，`kind` 決定哪一組欄位有值，另一組固定為 null。
 */
export interface HealthMeasurement {
  id: string;
  user_id: string;
  kind: MeasurementKind;
  measured_at: string;
  recorded_by: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  glucose_mg_dl: number | null;
  meal_context: MealContext | null;
  level: HealthLevel;
  created_at: string;
}

// ── 提醒範圍 ────────────────────────────────────────────────────────────

/**
 * PUT /api/health/alert-thresholds 的 body（對應後端
 * UpdateHealthAlertThresholdRequest）。七項皆選填，省略或帶 null 視為清除
 * 該項；同一對上下限都設定時上限須大於下限——由後端 422 把關，前端表單
 * 只做友善的預先檢查。
 */
export interface UpdateHealthAlertThresholdRequest {
  systolic_high?: number | null;
  systolic_low?: number | null;
  diastolic_high?: number | null;
  diastolic_low?: number | null;
  glucose_fasting_high?: number | null;
  glucose_nonfasting_high?: number | null;
  glucose_low?: number | null;
}

/**
 * 提醒範圍（對應後端 HealthAlertThreshold）。GET 從未設定過時仍是 200，
 * 七項與 `updated_by`／`updated_at` 皆為 null，不是 404。
 */
export interface HealthAlertThreshold {
  user_id: string;
  systolic_high: number | null;
  systolic_low: number | null;
  diastolic_high: number | null;
  diastolic_low: number | null;
  glucose_fasting_high: number | null;
  glucose_nonfasting_high: number | null;
  glucose_low: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

// ── 經期 ────────────────────────────────────────────────────────────────
// 經期是 PERSONAL 分類：沒有代記，也沒有跨使用者查詢，一律限本人
// （app/routers/users/health.py 的 MENSTRUAL_CROSS_USER_DETAIL 說明）。

/**
 * POST /api/health/menstrual 的 body（對應後端 CreateMenstrualRecordRequest）。
 * 日期為台北時區的日曆日，格式固定 YYYY-MM-DD。
 */
export interface CreateMenstrualRecordRequest {
  start_date: string;
  end_date?: string;
  flow?: MenstrualFlow;
  note?: string;
}

/**
 * PATCH /api/health/menstrual/{id} 的 body（對應後端
 * UpdateMenstrualRecordRequest）。四個欄位皆選填，沒帶到的欄位維持既有值；
 * 明確帶 `end_date: null` 代表清除既有結束日期、把這筆紀錄重新打開為
 * 進行中。
 */
export interface UpdateMenstrualRecordRequest {
  start_date?: string;
  end_date?: string | null;
  flow?: MenstrualFlow | null;
  note?: string | null;
}

/**
 * 一筆經期紀錄（對應後端 MenstrualRecord）。`cycle_length_days`／
 * `period_length_days` 由後端計算後回填，不是使用者輸入的欄位。
 */
export interface MenstrualRecord {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  flow: MenstrualFlow | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  cycle_length_days: number | null;
  period_length_days: number | null;
}

// ── 計步 ────────────────────────────────────────────────────────────────

/**
 * PUT /api/health/steps/sessions/{session_id} 的 body（對應後端
 * StepSessionSyncRequest）。`steps` 是這個工作階段**目前的累計值**，不是
 * 增量；`started_at` 只在後端第一次收到這個工作階段時採用，之後同步即使
 * 帶不同值也會被忽略，一律沿用第一次的值。
 */
export interface StepSessionSyncRequest {
  steps: number;
  started_at: string;
}

/**
 * 某一天的步數彙總（對應後端 StepCount）；是計步唯一會出現在回應中的形狀
 * ——內部的 StepSession（session_id／started_at／last_synced_at）SHALL NOT
 * 出現在任何回應。
 */
export interface StepCount {
  user_id: string;
  date: string;
  steps: number;
}
