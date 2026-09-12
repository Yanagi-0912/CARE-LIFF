import type { TFunction } from 'i18next';
import type {
  AppointmentListScope, AppointmentPage, AppointmentReminder, CreateAppointmentRequest,
  UpdateAppointmentRequest,
} from '../types/appointment';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 掛號提醒 API 的失敗。
 *
 * 保留 status 與原始 detail 兩者：後端的 detail 只有繁中（API 路由沒有語言
 * 中介層），非繁中語系要改依狀態碼顯示前端自己的譯文，所以呼叫端需要知道
 * 狀態碼，不能只拿到一串中文訊息。見 `appointmentErrorMessage`。
 */
export class AppointmentApiError extends Error {
  status: number;
  detail: string | null;

  constructor(status: number, detail: string | null) {
    super(detail ?? `API 請求失敗：${status}`);
    this.name = 'AppointmentApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 掛號 API 錯誤 → 給使用者看的一句話。
 *
 * 後端的 detail 是完整的繁中句子，而且每種 400／409 各有一句，比前端能給的任何
 * 通用文案都精確，所以繁中直接顯示。但 API 路由沒有語言中介層，其他五種語言拿到
 * 的也是中文——這時改依狀態碼顯示前端自己的譯文。翻譯函式由呼叫端傳入，這個檔
 * 不直接依賴 i18n。
 *
 * 刻意不去比對 detail 的字串來細分 409：那等於把後端文案當成 API 契約，後端改
 * 一個標點前端就默默退回通用訊息。會撞到 409 的幾乎都是「別人剛按過／當天剛結束」
 * 這種畫面過期的情況，重抓一次列表就是正確的下一步。
 */
export function appointmentErrorMessage(
  t: TFunction,
  language: string,
  err: unknown,
  /**
   * 409 的意思隨呼叫的地方而定：回報出發／到診撞到的是「狀態已經變了」，
   * 新增與編輯表單撞到的是「重複的掛號」。由呼叫端指定，不去比對 detail 字串。
   */
  options: { conflictKey?: string } = {},
): string {
  if (err instanceof AppointmentApiError) {
    if (language === 'zh-TW' && err.detail) return err.detail;
    switch (err.status) {
      case 403:
        return t('appt.error.forbidden');
      case 404:
        return t('appt.error.notFound');
      case 409:
        return t(options.conflictKey ?? 'appt.error.conflict');
      default:
        return t('appt.error.generic');
    }
  }
  return t('appt.error.generic');
}

/** 404／409 代表手上的資料已經過期（被刪了、被別人按過、當天結束了），要重抓列表 */
export function isStaleStateError(err: unknown): boolean {
  return err instanceof AppointmentApiError && (err.status === 404 || err.status === 409);
}

/**
 * 422 的 detail 是 FastAPI 預設的英文陣列，不是給使用者看的句子，
 * 這裡只收字串形式的 detail，陣列一律視為沒有可顯示的訊息。
 */
async function parseError(res: Response): Promise<AppointmentApiError> {
  let detail: string | null = null;
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') detail = data.detail;
  } catch {
    // ignore parse error
  }
  return new AppointmentApiError(res.status, detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

const reminderPath = (id: string) => `/api/appointments/reminders/${encodeURIComponent(id)}`;

/** 「過去的門診」一次載入幾筆 */
const PAST_PAGE_SIZE = 20;

/**
 * 查某人「即將到來」或「過去」的掛號提醒（定義見 AppointmentListScope）。
 *
 * - upcoming：由早到晚，不分頁，一次回全部。
 * - past：由新到舊，一頁 `PAST_PAGE_SIZE` 筆；`cursor` 是上一頁的 `next_cursor`。
 */
export function fetchAppointmentList(
  targetUserId: string | undefined,
  scope: AppointmentListScope,
  options: { cursor?: string | null } = {},
): Promise<AppointmentPage> {
  const params = new URLSearchParams({ scope });
  if (targetUserId) params.set('target_user_id', targetUserId);
  if (scope === 'past') {
    params.set('limit', String(PAST_PAGE_SIZE));
    if (options.cursor) params.set('cursor', options.cursor);
  }
  return request(`/api/appointments/reminders?${params.toString()}`);
}

export function createAppointment(req: CreateAppointmentRequest): Promise<AppointmentReminder> {
  return request('/api/appointments/reminders', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** 部分更新。改了 appointment_at 時後端會把狀態重置成 scheduled 並重排推播。 */
export function updateAppointment(
  id: string,
  patch: UpdateAppointmentRequest,
): Promise<AppointmentReminder> {
  return request(reminderPath(id), {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteAppointment(id: string): Promise<{ ok: boolean }> {
  return request(reminderPath(id), { method: 'DELETE' });
}

/**
 * 刪除**本人**全部「過去」的掛號紀錄，回傳實際刪除的筆數。
 *
 * 只有本人能按，所以刻意不帶 `target_user_id`（省略＝本人）：帶了別人的 id 後端
 * 回 403，不會退回去刪呼叫者自己的。即將到來的門診一筆都不會動。
 *
 * 後端是單一 delete_many 而不是交易，5xx 時可能刪到一半；條件只挑得到過去的
 * 紀錄，所以重送同一個請求是安全的。
 */
export function deletePastAppointments(): Promise<{ deleted: number }> {
  return request('/api/appointments/reminders?scope=past', { method: 'DELETE' });
}

/**
 * 取消這次門診：保留紀錄、停止所有推播、不發任何通知。權限與出發／到診相同；
 * 已經取消的再按一次是冪等的 200，保留第一位取消者。
 */
export function cancelAppointment(id: string): Promise<AppointmentReminder> {
  return request(`${reminderPath(id)}/cancel`, { method: 'POST' });
}

/**
 * 回報已出發／已到診。與 LINE 卡片上的按鈕打的是同一個後端方法：
 * 本人或有 GENERAL WRITE 的家屬都能按；重複按同一顆是冪等的 200，
 * 保留第一位回報者。
 */
export function departAppointment(id: string): Promise<AppointmentReminder> {
  return request(`${reminderPath(id)}/depart`, { method: 'POST' });
}

export function attendAppointment(id: string): Promise<AppointmentReminder> {
  return request(`${reminderPath(id)}/attend`, { method: 'POST' });
}
