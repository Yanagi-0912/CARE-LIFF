import { fetchWithAuth, isAuthenticated } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/** 後端 UserSettings 的欄位形狀（snake_case，跟資料庫文件一致） */
export type ApiUserSettings = {
  language: string | null;
  font_size: 'normal' | 'large' | 'xlarge';
  high_contrast: boolean;
  notify_reminder: boolean;
  notify_family: boolean;
  voice_reply_enabled: boolean;
  voice_rate: 'slow' | 'normal' | 'fast';
  voice_gender: 'female' | 'male';
};

export type UpdateUserSettingsPayload = Partial<ApiUserSettings>;

/**
 * 取得目前登入使用者的介面偏好設定。
 *
 * 未登入（沒有 token）時直接回傳 null，
 * 讓呼叫端可以 fallback 回 localStorage，不會噴錯打斷畫面。
 */
export async function getUserSettings(): Promise<ApiUserSettings | null> {
  if (!isAuthenticated()) return null;

  const res = await fetchWithAuth(`${BASE_URL}/api/profiles/me/settings`, {
    method: 'GET',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`取得使用者設定失敗：${res.status}${text ? ` - ${text}` : ''}`);
  }

  const body = await res.json();
  return body.settings as ApiUserSettings;
}

/** 部分更新目前登入使用者的介面偏好設定，只會送出實際變更的欄位。 */
export async function updateUserSettings(
  payload: UpdateUserSettingsPayload,
): Promise<ApiUserSettings> {
  const res = await fetchWithAuth(`${BASE_URL}/api/profiles/me/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`更新使用者設定失敗：${res.status}${text ? ` - ${text}` : ''}`);
  }

  const body = await res.json();
  return body.settings as ApiUserSettings;
}

