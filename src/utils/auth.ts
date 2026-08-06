import { saveRedirectUrl } from './redirect';

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
    'ngrok-skip-browser-warning': 'true',
    Authorization: `Bearer ${(localStorage.getItem(TOKEN_KEY) || '').trim()}`,
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

/** 處理 401 Unauthorized 情況：自動清除 token、保存目前路徑，並導向登入頁 */
export function handleUnauthorized(): void {
  clearAuth();
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath && !currentPath.startsWith('/login')) {
      saveRedirectUrl(currentPath);
    }
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }
}

/**
 * 統一帶驗證頭的 HTTP 請求封裝（具備 401 全域救援機制）
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = {
    ...authHeaders(),
    ...(init?.headers || {}),
  };

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('登入憑證已失效，正在重新登入…');
  }

  return res;
}
