const REDIRECT_URL_KEY = 'CARE_REDIRECT_URL';

/**
 * 是否指向登入頁本身。相對路徑、同站完整網址、liff.line.me 深連結都先換算成
 * App 路徑再比對——只比對字串擋得住 '/login'，擋不住 'https://…/login'。
 */
function isLoginPath(url: string): boolean {
  return resolveAppPath(url).split('?')[0] === '/login';
}

/**
 * 儲存登入前的網址，以便登入後跳轉回來。
 * 指向登入頁的一律忽略：回跳到登入頁沒有意義，還會蓋掉真正要回去的深連結。
 */
export function saveRedirectUrl(url: string) {
  const normalized = (url || '').trim();
  if (!normalized || isLoginPath(normalized)) {
    return;
  }
  sessionStorage.setItem(REDIRECT_URL_KEY, normalized);
}

/** 讀取但不清除（給 liff.login 組 redirectUri 用） */
export function peekRedirectUrl(): string | null {
  return sessionStorage.getItem(REDIRECT_URL_KEY);
}

/**
 * 取得並清除儲存的跳轉網址
 */
export function consumeRedirectUrl(): string | null {
  const url = sessionStorage.getItem(REDIRECT_URL_KEY);
  sessionStorage.removeItem(REDIRECT_URL_KEY);
  return url;
}

/** 從 /login?redirect= 讀取深連結（OAuth 後 sessionStorage 可能被清掉） */
export function redirectFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('redirect');
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
    if (isLoginPath(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * 將 redirect（相對路徑或完整 URL）轉成 React Router path。
 */
export function resolveAppPath(
  redirectUrl: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  try {
    const url = new URL(redirectUrl, origin);
    if (url.hostname === 'liff.line.me') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `/${parts.slice(1).join('/')}${url.search}`;
      }
      return '/';
    }
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return redirectUrl.startsWith('/') ? redirectUrl : '/';
  }
}
