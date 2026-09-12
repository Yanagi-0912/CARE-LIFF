import { test as base, expect, type Page } from '@playwright/test';

import { messages } from '../src/i18n/messages';

/**
 * e2e 共用地基。
 *
 * 三件事在這裡一次做完，避免每個 spec 各自抄一份 beforeEach：
 * 1. 假登入（LIFF 不存在時 App 會退回讀 localStorage 的 token，見 LiffAuthProvider）
 * 2. 鎖語系為 zh-TW，讓文案斷言可預期
 * 3. 攔截所有 /api/**，測試絕不打到真後端
 *
 * 文案一律從 src/i18n/messages 取值，不在測試裡寫死中文字串——
 * 前端規範要求「使用者可見字串零硬編碼」，e2e 沒有理由是例外。
 * 改文案不會弄壞測試；少了 key 反而會立刻被抓到。
 */

export const LOCALE = 'zh-TW' as const;

/** 假 token。App 只檢查「有沒有值」，不驗簽章（驗簽是後端的事）。 */
export const AUTH_TOKEN = 'e2e-mock-access-token';
export const LINE_USER_ID = 'Ue2e0000000000000000000000000000';

/** 語系設定的 localStorage key，對應 i18n/index.ts 的 getInitialLanguage() */
const SETTINGS_KEY = 'care-settings';

/**
 * 取 zh-TW 文案。`{{name}}` 這類佔位符用第二個參數帶入。
 * 找不到 key 就直接丟錯——測試引用了不存在的翻譯是 bug，不該靜默通過。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = messages[LOCALE][key];
  if (raw === undefined) {
    throw new Error(`[e2e] i18n key 不存在：${key}`);
  }
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * 後端在 K8s／ngrok 後面，瀏覽器會先送 preflight。
 * 攔截後自己 fulfill 時要把 CORS header 補回去，否則 fetch 會被瀏覽器擋下，
 * 症狀是「明明 stub 了卻還是進到錯誤分支」。
 */
export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,ngrok-skip-browser-warning',
};

export function jsonResponse(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * 用 pathname 比對後端 API，不要用比對整條 URL 的萬用字元 glob。
 *
 * 「任意層級 + api + 任意層級」那種 glob 會連 Vite dev server 自己的模組網址一起吃掉
 * （http://localhost:5173/src/api/profileApi.ts 也含有 `api` 這一段），
 * 於是 App 的原始碼被換成 404 JSON，React 整個掛不起來、#root 是空的。
 * 症狀很有迷惑性：所有測試都「找不到元素」，看起來像選取器全錯。
 */
function onApiPath(predicate: (pathname: string) => boolean) {
  return (url: URL) => predicate(url.pathname);
}

/** 統一處理 CORS preflight，回傳 true 表示這個請求已經處理完了 */
async function handlePreflight(route: import('@playwright/test').Route) {
  if (route.request().method() !== 'OPTIONS') return false;
  await route.fulfill({ status: 204, headers: CORS_HEADERS });
  return true;
}

/**
 * 兜底攔截：任何沒被個別 spec 明確 stub 的 API 一律回 404。
 *
 * 刻意不放行到真後端。CI 上沒有後端，放行只會得到「有時紅有時綠」；
 * 回 404 至少是穩定且明確的，缺 stub 的測試會固定失敗而不是偶爾失敗。
 *
 * Playwright 的 route 以「後註冊者優先」比對，所以 spec 之後再註冊的
 * 精確 stub 會蓋過這個兜底規則。
 */
export async function stubBackend(page: Page) {
  await page.route(
    onApiPath((pathname) => pathname.startsWith('/api/')),
    async (route) => {
      if (await handlePreflight(route)) return;
      await route.fulfill(
        jsonResponse(404, { detail: `[e2e] 未 stub 的 API：${route.request().url()}` }),
      );
    },
  );
}

/** 個人健康 profile。傳 null 代表「尚未建檔」（後端回 404）。 */
export async function stubProfileApi(page: Page, profile: unknown = null) {
  await page.route(
    onApiPath((pathname) => pathname === '/api/profiles/me'),
    async (route) => {
      if (await handlePreflight(route)) return;
      await route.fulfill(
        profile ? jsonResponse(200, profile) : jsonResponse(404, { detail: 'Not found' }),
      );
    },
  );

  await page.route(
    onApiPath((pathname) => pathname === '/api/profiles/me/update'),
    async (route) => {
      if (await handlePreflight(route)) return;
      await route.fulfill(jsonResponse(200, { ok: true }));
    },
  );
}

/** 後端用 LINE ID token 換發 CARE 存取憑證的端點 */
export async function stubLiffLogin(
  page: Page,
  response: { access_token: string; line_user_id: string } | { status: number },
) {
  const received: string[] = [];

  await page.route(
    onApiPath((pathname) => pathname === '/api/auth/liff/login'),
    async (route) => {
      if (await handlePreflight(route)) return;

      const body = route.request().postDataJSON() as { id_token?: string } | null;
      if (body?.id_token) received.push(body.id_token);

      if ('status' in response) {
        await route.fulfill(jsonResponse(response.status, { detail: 'e2e: 換發失敗' }));
        return;
      }
      await route.fulfill(
        jsonResponse(200, { token_type: 'bearer', expires_in: 3600, ...response }),
      );
    },
  );

  /** 後端實際收到的 id_token，用來確認真的走了 LIFF 那條路 */
  return received;
}

/**
 * 指定 LIFF mock 的假資料，鍵名就是 LIFF API 名稱。
 *   seedLiffMock(page, { isLoggedIn: true, getProfile: { displayName: '林阿嬤' } })
 *
 * 必須在 page.goto() 之前呼叫：資料是寫進 localStorage，由 lib/liffClient 的
 * initLiff() 在 liff.init() 之後、React 掛載之前套用（見該檔的 applyMockSeed）。
 *
 * 未指定的 API 用 @line/liff-mock 的預設值，其中 isLoggedIn 與 isInClient
 * 預設都是 false。
 */
export async function seedLiffMock(page: Page, data: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, json }) => localStorage.setItem(key, json),
    { key: 'CARE_LIFF_MOCK', json: JSON.stringify(data) },
  );
}

/**
 * 在頁面任何腳本執行「之前」寫入 localStorage。
 *
 * 舊寫法是 goto('/login') → evaluate(setItem) → goto('/')，等於每個測試都
 * 先跑一次登入頁再跳走：慢，而且中間那一瞬間 App 是未登入狀態，
 * ProtectedRoute 有機會先把人導走造成偶發失敗。addInitScript 沒有這個空窗。
 */
async function seedAuthState(page: Page) {
  await page.addInitScript(
    ({ token, userId, settingsKey, locale }) => {
      localStorage.setItem('CARE_AUTH_TOKEN', token);
      localStorage.setItem('CARE_LINE_USER_ID', userId);
      localStorage.setItem(settingsKey, JSON.stringify({ language: locale }));
      // 「使用者主動登出」旗標若殘留會擋掉自動登入，每個測試都從乾淨狀態開始
      sessionStorage.removeItem('CARE_LOGGED_OUT');
    },
    { token: AUTH_TOKEN, userId: LINE_USER_ID, settingsKey: SETTINGS_KEY, locale: LOCALE },
  );
}

/** 只鎖語系、不假登入。給「未登入應該被導到登入頁」這類測試用。 */
async function seedLocaleOnly(page: Page) {
  await page.addInitScript(
    ({ settingsKey, locale }) => {
      localStorage.setItem(settingsKey, JSON.stringify({ language: locale }));
      sessionStorage.removeItem('CARE_LOGGED_OUT');
    },
    { settingsKey: SETTINGS_KEY, locale: LOCALE },
  );
}

type Fixtures = {
  /** 已假登入 + 已擋掉後端的 page。絕大多數測試用這個。 */
  authedPage: Page;
  /** 未登入但已擋掉後端的 page。 */
  anonymousPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await stubBackend(page);
    await stubProfileApi(page);
    await seedAuthState(page);
    await use(page);
  },

  anonymousPage: async ({ page }, use) => {
    await stubBackend(page);
    await seedLocaleOnly(page);
    await use(page);
  },
});

export { expect };
