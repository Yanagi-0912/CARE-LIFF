const REDIRECT_URL_KEY = 'CARE_REDIRECT_URL';

/**
 * 儲存登入前的網址，以便登入後跳轉回來
 */
export function saveRedirectUrl(url: string) {
  sessionStorage.setItem(REDIRECT_URL_KEY, url);
}

/**
 * 取得並清除儲存的跳轉網址
 */
export function consumeRedirectUrl(): string | null {
  const url = sessionStorage.getItem(REDIRECT_URL_KEY);
  sessionStorage.removeItem(REDIRECT_URL_KEY);
  return url;
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
