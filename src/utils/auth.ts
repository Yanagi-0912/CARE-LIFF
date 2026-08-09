import { saveRedirectUrl } from './redirect';

/** localStorage keys */
const TOKEN_KEY = 'CARE_AUTH_TOKEN';
const USER_ID_KEY = 'CARE_LINE_USER_ID';
/**
 * 「使用者主動登出」旗標。用 sessionStorage：只在這個分頁／webview 存活，
 * 重開就當作全新工作階段，恢復 LIFF 自動登入。
 *
 * 沒有這個旗標的話，登出後 LIFF/LINE 那側的 session 仍可能是有效的，
 * 登入頁與 LiffAuthProvider 一掛載就會自動換發 token 把人登回去，
 * 使用者看到的就是「按了登出完全沒反應」。
 */
const LOGGED_OUT_KEY = 'CARE_LOGGED_OUT';

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

/** 標記為「使用者主動登出」，阻擋自動重新登入 */
export function markLoggedOut(): void {
  sessionStorage.setItem(LOGGED_OUT_KEY, '1');
}

/** 解除登出旗標（使用者明確表示要再次登入時呼叫） */
export function clearLoggedOutFlag(): void {
  sessionStorage.removeItem(LOGGED_OUT_KEY);
}

/** 是否處於「使用者主動登出」狀態 */
export function hasLoggedOut(): boolean {
  return sessionStorage.getItem(LOGGED_OUT_KEY) === '1';
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
