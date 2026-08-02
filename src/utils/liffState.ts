/**
 * 從 LIFF 開啟時的 `?liff.state=` 還原 SPA path。
 *
 * 當 LINE Developers 的 Endpoint URL 誤設成帶 path（例如 /login）時：
 * - 次要導向可能變成 /login/settings（React 無此路由）
 * - 或停在 /login?liff.state=/settings，SDK 未必改 pathname
 * 此模組做保險還原。
 */

const APP_PATHS = new Set([
  '/',
  '/family',
  '/settings',
  '/personalhealth',
  '/personalhealth/consult',
  '/knowledge-reports',
  '/nearby-hospitals',
  '/join',
]);

/**
 * 若 pathname 是 `/login/settings` 這類「Endpoint=/login + 深連結」誤拼接，剝成 `/settings`。
 */
export function stripLoginPrefixPath(pathname: string): string | null {
  const raw = (pathname || '').trim() || '/';
  if (raw === '/login' || raw === '/login/') return null;
  if (!raw.startsWith('/login/')) return null;
  const stripped = raw.slice('/login'.length) || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

export function pathFromLiffState(liffState: string | null | undefined): string | null {
  if (!liffState) return null;
  let raw = liffState.trim();
  if (!raw) return null;

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw
  }

  // LINE 有時會帶前導反斜線轉義：\/settings
  raw = raw.replace(/^\\+\//, '/');
  if (!raw.startsWith('/')) {
    raw = `/${raw}`;
  }

  // 拒絕 protocol-relative / 外站
  if (raw.startsWith('//')) return null;

  // liff.state 偶爾是 login/settings
  const stripped = stripLoginPrefixPath(raw);
  if (stripped) raw = stripped;

  const q = raw.indexOf('?');
  const h = raw.indexOf('#');
  let end = raw.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  const pathname = raw.slice(0, end) || '/';
  const search = q >= 0 ? raw.slice(q, h >= 0 ? h : undefined) : '';
  return `${pathname}${search}`;
}

function cleanLiffQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('liff.state');
  params.delete('liff.referrer');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 在掛載 Router 前正規化 URL：剝 /login 前綴、還原 liff.state。
 * 回傳是否有改寫。
 */
export function restorePathFromLiffStateSearch(
  search: string,
  currentPathname: string,
  replaceState: (url: string) => void = (url) => {
    window.history.replaceState({}, '', url);
  },
): boolean {
  const cleanedSearch = cleanLiffQuery(search);

  // 1) /login/settings → /settings
  const stripped = stripLoginPrefixPath(currentPathname);
  if (stripped) {
    const fromState = pathFromLiffState(
      new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
        'liff.state',
      ),
    );
    const target = fromState || `${stripped}${cleanedSearch}`;
    replaceState(target);
    return true;
  }

  // 2) /login?liff.state=/settings → /settings
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const restored = pathFromLiffState(params.get('liff.state'));
  if (!restored) return false;

  const targetPath = restored.split('?')[0] || '/';
  if (targetPath === currentPathname) {
    replaceState(`${currentPathname}${cleanedSearch}`);
    return true;
  }

  // 保留 restored 自身 query，並併入非 liff 的其他參數
  if (restored.includes('?')) {
    replaceState(restored);
  } else {
    replaceState(`${restored}${cleanedSearch}`);
  }
  return true;
}

/** 供測試／除錯：是否為已知 app path */
export function isKnownAppPath(pathname: string): boolean {
  if (APP_PATHS.has(pathname)) return true;
  return pathname.startsWith('/personalhealth/');
}
