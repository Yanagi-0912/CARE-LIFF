/**
 * 從 LIFF 開啟時的 `?liff.state=` 還原 SPA path。
 *
 * 當 LINE Developers 的 Endpoint URL 誤設成帶 path（例如 /login）時，
 * SDK 可能不會自動把 URL 改成 /settings、/family；此函式做保險還原。
 */
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

  const q = raw.indexOf('?');
  const h = raw.indexOf('#');
  let end = raw.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  const pathname = raw.slice(0, end) || '/';
  const search = q >= 0 ? raw.slice(q, h >= 0 ? h : undefined) : '';
  return `${pathname}${search}`;
}

/**
 * 若目前 URL 仍帶 liff.state，且還原後的 path 與現況不同，則 replaceState。
 * 回傳是否有改寫 URL。
 */
export function restorePathFromLiffStateSearch(
  search: string,
  currentPathname: string,
  replaceState: (url: string) => void = (url) => {
    window.history.replaceState({}, '', url);
  },
): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const restored = pathFromLiffState(params.get('liff.state'));
  if (!restored) return false;

  const targetPath = restored.split('?')[0] || '/';
  if (targetPath === currentPathname) {
    // 已在目標 path：清掉 liff.state 避免干擾
    params.delete('liff.state');
    params.delete('liff.referrer');
    const qs = params.toString();
    replaceState(`${currentPathname}${qs ? `?${qs}` : ''}`);
    return true;
  }

  replaceState(restored);
  return true;
}
