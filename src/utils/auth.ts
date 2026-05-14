/** localStorage keys */
const TOKEN_KEY = 'CARE_AUTH_TOKEN';
const USER_ID_KEY = 'CARE_LINE_USER_ID';

/** 取得 access token，無則拋錯 */
export function getAccessToken(): string {
  const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
  if (!token) throw new Error('缺少登入憑證，請先重新登入');
  return token;
}

/** 取得 LINE user ID，無則拋錯 */
export function getLineUserId(): string {
  const uid = (localStorage.getItem(USER_ID_KEY) || '').trim();
  if (!uid) throw new Error('尚未登入，找不到 LINE 使用者 ID');
  return uid;
}

/** 建立帶 JWT 的 headers */
export function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

/** 清除登入狀態 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

/** 檢查是否已登入 */
export function isAuthenticated(): boolean {
  return !!(localStorage.getItem(TOKEN_KEY) || '').trim();
}
