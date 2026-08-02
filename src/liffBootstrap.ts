import liff from '@line/liff';
import { restorePathFromLiffStateSearch } from './utils/liffState';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

/**
 * 在掛載 React Router 之前完成 liff.init()，並還原 Rich Menu 深連結 path。
 *
 * LINE 會先開到 Endpoint URL + ?liff.state=/settings；
 * 若 Endpoint 誤設成 /login，SDK 可能不會自動改 pathname，需手動還原。
 */
export async function bootstrapLiff(): Promise<void> {
  if (!LIFF_ID) {
    console.warn('[LIFF] VITE_LIFF_ID 未設定，略過初始化');
    return;
  }

  try {
    await liff.init({ liffId: LIFF_ID });
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
