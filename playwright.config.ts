import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 *
 * 專案（projects）刻意只留手機：CARE 是 LIFF app，使用者一律在 LINE 內建
 * WebView 裡開啟——Android 是 Chromium 核心、iOS 是 WKWebView（Safari 核心）。
 * 桌面版 Firefox／Safari 沒有任何真實使用者，測它們只是讓 CI 慢三倍。
 *
 * 需要桌面版面的測試（例如只在 md 以上顯示的 Sidebar）在 spec 內用
 * test.use({ viewport }) 撐開視窗即可，不必為此多養一個 project。
 *
 * 註：mobile-safari 用 WebKit，本機第一次跑要先裝系統相依套件：
 *   sudo npx playwright install-deps webkit && npx playwright install webkit
 * CI 已用 `playwright install --with-deps` 涵蓋。
 */

/**
 * 刻意不用 dev server 的 5173，改用 5174 起一台專屬的。
 *
 * 因為 e2e 需要把 VITE_LIFF_ID 清空（見下方 webServer.env），而 reuse 既有的
 * 5173 會拿到你 .env 裡的真實 LIFF ID，於是未登入的測試會被 liff.login()
 * 直接踹到 access.line.me 的 OAuth 頁——測試變成在測 LINE 的伺服器。
 * 分開一台就能一邊開著 npm run dev 一邊跑 e2e，兩邊互不影響。
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5174';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* CI 上不允許殘留 test.only */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  /* 本機看 list 就夠；html 一律不自動開啟，否則 CLI 會被瀏覽器卡住 */
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    /* 有了 baseURL，spec 裡就只寫 page.goto('/settings')；
       要測 staging 時改 PLAYWRIGHT_BASE_URL 環境變數即可，不用改測試碼。 */
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    /* 高齡使用者的主要語系；同時避免瀏覽器語系影響 Intl 格式化結果 */
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  },

  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      /**
       * 清空 LIFF ID：bootstrapLiff() 會直接略過 liff.init()，LiffAuthProvider
       * 退回讀 localStorage 的 token（見該檔的 `if (!LIFF_ID)` 分支）。
       *
       * 這同時是 LINE 官方的要求——不得為了測試而大量呼叫 LIFF API。
       * 之後 Phase 2 要測 LIFF 分支時，用官方的 @line/liff-mock 在瀏覽器內
       * 假造，仍然不會連到 LINE 的伺服器。
       */
      VITE_LIFF_ID: '',
    },
  },
});
