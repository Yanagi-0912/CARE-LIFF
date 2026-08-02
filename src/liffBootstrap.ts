import liff from '@line/liff';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

/**
 * 在掛載 React Router 之前完成 liff.init()。
 * Rich Menu 深連結（如 /settings）會先落在 ?liff.state=...，
 * 必須 init 後 LINE 才會 redirect 還原成真正的 pathname。
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
}
