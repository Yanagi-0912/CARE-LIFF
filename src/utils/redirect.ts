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
