import liff from '@line/liff';
import type { ExtendedInit, LiffMockApi } from '@line/liff-mock';

/**
 * 全 App 唯一的 liff.init() 入口。
 *
 * 原本 bootstrapLiff / LiffAuthProvider / useLiff / LoginPage 各自呼叫
 * liff.init()，也各自寫一次 `if (!LIFF_ID)`。要讓自動化測試能走到 LIFF 分支，
 * 這四處都得認得 mock 模式，所以統一收在這裡。
 *
 * mock 模式用 LINE 官方的 @line/liff-mock：liff.init() 完全不連 LINE 伺服器，
 * 所有 API 回傳預設或測試指定的假資料。這同時符合官方規範——
 * 不得為了測試而對 LINE Platform 發出大量請求。
 */

export const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

/** 只在 e2e／本機除錯時開啟。正式建置沒有這個變數，整段 mock 會被搖掉。 */
export const LIFF_MOCK_ENABLED = import.meta.env.VITE_LIFF_MOCK === 'true';

/**
 * LIFF 是否可用（真的或 mock）。
 * 取代散落各處的 `if (!LIFF_ID)`，否則開了 mock 還是會被那些判斷擋掉。
 */
export const LIFF_AVAILABLE = Boolean(LIFF_ID) || LIFF_MOCK_ENABLED;

/** mock 模式下沒有真 LIFF ID 時的替代值。mock 不會驗證它。 */
const MOCK_LIFF_ID = 'liff-0000000000-mock';

/**
 * 測試用來指定假資料的 localStorage key，值是 liff.$mock.set() 的物件。
 * 例如 {"isLoggedIn":true,"getProfile":{"displayName":"王大明","userId":"U123"}}
 *
 * 走 localStorage 而不是掛 window 全域：Playwright 的 addInitScript 能在
 * 頁面任何腳本執行前寫入，保證 init 時假資料已經就位，沒有競爭條件。
 */
const MOCK_SEED_KEY = 'CARE_LIFF_MOCK';

type MockableLiff = typeof liff & { $mock: LiffMockApi };

let mockPluginInstalled = false;

async function installMockPlugin() {
  if (mockPluginInstalled) return;
  // 動態 import：正式建置時 LIFF_MOCK_ENABLED 是編譯期常數 false，
  // 這整個分支連同 @line/liff-mock 都不會進到 bundle
  const { LiffMockPlugin } = await import('@line/liff-mock');
  liff.use(new LiffMockPlugin());
  mockPluginInstalled = true;
}

function applyMockSeed() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MOCK_SEED_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    const seed = JSON.parse(raw) as Record<string, unknown>;
    (liff as MockableLiff).$mock.set((prev) => ({ ...prev, ...seed }));

    // liff-mock 的 getProfile() 另外擋一道「這個 session 呼叫過 liff.login() 沒」
    // 的內部旗標，跟 isLoggedIn 假資料無關；沒開就丟
    // 'You need to call liff.login first.'。
    // 假資料既然宣告已登入，就把那道旗標補開，否則模擬不出「已登入的 LIFF session」。
    // mock 的 login() 只是把旗標加一，不會有任何導向或連線。
    if (seed.isLoggedIn === true) {
      liff.login();
    }
  } catch (error) {
    console.warn('[LIFF] mock 假資料解析失敗，改用預設值', error);
  }
}

/** 初始化 LIFF。mock 模式下不會有任何對外連線。 */
export async function initLiff(): Promise<void> {
  if (LIFF_MOCK_ENABLED) {
    await installMockPlugin();
    // mock:true 不在 LIFF 的公開型別裡，由 liff-mock 的 ExtendedInit 補上
    await (liff.init as unknown as ExtendedInit)({
      liffId: LIFF_ID || MOCK_LIFF_ID,
      mock: true,
    });
    applyMockSeed();
    return;
  }

  await liff.init({ liffId: LIFF_ID });
}

export default liff;
