import type {
  CreateRemindersRequest,
  MedicationReminder,
  UpdateReminderRequest,
} from '../types/medication';
import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 輔助函式：解析錯誤訊息
 */
async function parseError(res: Response): Promise<Error> {
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
  return new Error(message);
}

/**
 * 1. 查詢某位使用者的用藥提醒列表
 * 後端一次只吃一個 target_user_id；省略則回傳本人的提醒。
 */
export async function fetchReminders(targetUserId?: string): Promise<MedicationReminder[]> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  const res = await fetch(`${BASE_URL}/api/medications/reminders${query}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 2. 建立用藥提醒（一次可勾多個時段，後端每個時段建一筆）
 * 時間由後端套用 DEFAULT_SLOT_TIMES，此 API 不接受 scheduled_time。
 */
export async function createReminders(
  req: CreateRemindersRequest,
): Promise<MedicationReminder[]> {
  const res = await fetch(`${BASE_URL}/api/medications/reminders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 3. 修改用藥提醒（時間、起訖日期、啟用狀態）
 */
export async function updateReminder(
  reminderId: string,
  req: UpdateReminderRequest,
): Promise<MedicationReminder> {
  const res = await fetch(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(req),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 4. 刪除用藥提醒
 */
export async function deleteReminder(reminderId: string): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}
