import { LIFF_AVAILABLE, initLiff } from './lib/liffClient';
import { restorePathFromLiffStateSearch } from './utils/liffState';

/**
 * 在掛載 React Router 之前完成 liff.init()，並還原 Rich Menu 深連結 path。
 *
 * LINE 會先開到 Endpoint URL + ?liff.state=/settings，init 後再二次導向。
 * 若 Endpoint 誤設成 …/login，二次導向可能變成 /login/settings（無路由），
 * 或停在 /login?liff.state=… — restorePathFromLiffStateSearch 會矯正。
 *
 * 請把 LINE Console 的 Endpoint URL 設成 SPA 根網址（不要加 /login）。
 */
export async function bootstrapLiff(): Promise<void> {
  if (!LIFF_AVAILABLE) {
    console.warn('[LIFF] VITE_LIFF_ID 未設定，略過初始化');
    return;
  }

  try {
    await initLiff();
  } catch (error) {
    // 外部瀏覽器／本機開發仍可開 app；深連結還原可能失敗
    console.warn('[LIFF] init 失敗，繼續載入應用', error);
  }

  try {
    const changed = restorePathFromLiffStateSearch(
      window.location.search,
      window.location.pathname,
    );
    if (changed) {
      console.info(
        '[LIFF] 已從 liff.state 還原 path →',
        `${window.location.pathname}${window.location.search}`,
      );
    }
  } catch (error) {
    console.warn('[LIFF] liff.state 還原失敗', error);
  }
}
