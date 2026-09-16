import type {
  CreateMeasurementRequest,
  CreateMenstrualRecordRequest,
  HealthAlertThreshold,
  HealthMeasurement,
  MeasurementKind,
  MenstrualRecord,
  StepCount,
  StepSessionSyncRequest,
  UpdateHealthAlertThresholdRequest,
  UpdateMenstrualRecordRequest,
} from '../types/health';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 輔助函式：解析錯誤訊息（同 familyApi.ts 的慣例）。
 *
 * HTTP 狀態碼掛在錯誤上一起丟出去：422 是後端範圍與跨欄位驗證（收縮壓須
 * 大於舒張壓、上限須大於下限、經期天數上限等）的權威判定，前端表單只是
 * 友善的預先檢查，呼叫端要能分辨 422 並顯示對應訊息，不能只看到一句
 * 通用的「失敗」。
 */
async function parseError(res: Response): Promise<Error & { status: number }> {
  let message = `API 請求失敗：${res.status}`;
  try {
    const data = await res.json();
    if (data.detail) {
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // ignore parse error
  }
  return Object.assign(new Error(message), { status: res.status });
}

/** 204 No Content 的端點（刪除）不能呼叫 res.json()，body 是空的。 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function userIdQuery(userId?: string): string {
  return userId ? `?user_id=${encodeURIComponent(userId)}` : '';
}

// ── 提醒範圍 ────────────────────────────────────────────────────────────

/** 查看本人或指定使用者的血壓／血糖提醒範圍。省略 userId 為本人；從未設定過也回 200。 */
export function fetchAlertThresholds(userId?: string): Promise<HealthAlertThreshold> {
  return request(`/api/health/alert-thresholds${userIdQuery(userId)}`);
}

/**
 * 整份覆寫本人或指定使用者的提醒範圍；body 省略或帶 null 的欄位視為清除
 * 該項。代為設定需操作者對本人的 SENSITIVE 資料具寫入權
 * （`canRecordHealthFor`）。
 */
export function updateAlertThresholds(
  body: UpdateHealthAlertThresholdRequest,
  userId?: string,
): Promise<HealthAlertThreshold> {
  return request(`/api/health/alert-thresholds${userIdQuery(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ── 血壓／血糖量測 ──────────────────────────────────────────────────────

/**
 * 新增一筆血壓或血糖紀錄；省略 userId 為本人。代記需操作者對本人的
 * SENSITIVE 資料具寫入權（`canRecordHealthFor`）。
 */
export function createMeasurement(
  body: CreateMeasurementRequest,
  userId?: string,
): Promise<HealthMeasurement> {
  return request(`/api/health/measurements${userIdQuery(userId)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface ListMeasurementsOptions {
  /** 省略則血壓血糖皆回傳 */
  kind?: MeasurementKind;
  /** ISO datetime（含）；省略且 end 也省略時後端預設最近 30 天 */
  start?: string;
  /** ISO datetime（含）；省略且 start 也省略時預設查詢當下 */
  end?: string;
}

/**
 * 查詢本人或指定使用者的血壓血糖紀錄，依量測時間新到舊排序，單次回應
 * 至多 200 筆。他人查看需 SENSITIVE 讀取權（`canReadHealthRecords`）。
 */
export function fetchMeasurements(
  userId?: string,
  options: ListMeasurementsOptions = {},
): Promise<HealthMeasurement[]> {
  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (options.kind) params.set('kind', options.kind);
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  const query = params.toString();
  return request(`/api/health/measurements${query ? `?${query}` : ''}`);
}

/** 刪除一筆血壓或血糖紀錄。刪除不會撤回已經送出的通知。 */
export function deleteMeasurement(measurementId: string): Promise<void> {
  return request(`/api/health/measurements/${encodeURIComponent(measurementId)}`, {
    method: 'DELETE',
  });
}

// ── 經期 ────────────────────────────────────────────────────────────────
//
// 經期是 PERSONAL 分類，沒有代記也沒有跨使用者查詢——這裡刻意不提供
// userId 參數，一律是操作者本人（見 app/routers/users/health.py 的
// MENSTRUAL_CROSS_USER_DETAIL 說明）。沒有對應的家庭權限判斷函式：任何
// 角色或委任皆無權存取他人的經期資料。

/** 新增本人的一筆經期紀錄。建立限本人個人健康檔案性別為「女性」，否則 403。 */
export function createMenstrualRecord(
  body: CreateMenstrualRecordRequest,
): Promise<MenstrualRecord> {
  return request('/api/health/menstrual', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 查詢本人的經期紀錄，依開始日期新到舊排序，附後端計算的週期長度與經期天數。 */
export function fetchMenstrualRecords(): Promise<MenstrualRecord[]> {
  return request('/api/health/menstrual');
}

/**
 * 部分更新一筆經期紀錄；沒帶到的欄位維持原值，明確帶 `end_date: null`
 * 代表重新打開這筆紀錄。整筆的一致性由後端重新驗證，不合法回 422。
 */
export function updateMenstrualRecord(
  recordId: string,
  body: UpdateMenstrualRecordRequest,
): Promise<MenstrualRecord> {
  return request(`/api/health/menstrual/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 刪除一筆經期紀錄。 */
export function deleteMenstrualRecord(recordId: string): Promise<void> {
  return request(`/api/health/menstrual/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
  });
}

// ── 計步 ────────────────────────────────────────────────────────────────

/**
 * 同步一個計步工作階段目前的累計步數（不是增量）。`sessionId` 須為前端
 * 產生的 UUID v4；只能回報自己的步數，帶入他人 id 一律 403，不支援代記。
 *
 * `keepalive: true` 給頁面即將隱藏時（`visibilitychange` → hidden）用：
 * 瀏覽器允許 keepalive 的請求在頁面卸載／隱藏後仍完成送出，一般的 fetch
 * 這時可能被瀏覽器中斷而遺漏最後一次同步。使用同一組帶認證的 headers。
 */
export function syncStepSession(
  sessionId: string,
  body: StepSessionSyncRequest,
  options: { keepalive?: boolean } = {},
): Promise<StepCount> {
  return request(`/api/health/steps/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    keepalive: options.keepalive,
  });
}

export interface ListStepCountsOptions {
  /** YYYY-MM-DD（含），台北日曆日 */
  start?: string;
  end?: string;
}

/**
 * 查詢本人或指定使用者的每日步數，兩者皆省略時預設最近 7 天（含今天），
 * 區間長度不得超過 90 天。他人查看需 SENSITIVE 讀取權
 * （`canReadHealthRecords`）。
 */
export function fetchStepCounts(
  userId?: string,
  options: ListStepCountsOptions = {},
): Promise<StepCount[]> {
  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  const query = params.toString();
  return request(`/api/health/steps${query ? `?${query}` : ''}`);
}
