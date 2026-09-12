// 用 vitest 專用的入口：它對 vitest 的 expect 註冊 matcher，型別也掛在 vitest 的
// Assertion 上。原本的 '@testing-library/jest-dom' 型別是給 Jest 的，編輯器因此
// 認不得 toBeInTheDocument 之類的 matcher（見 tsconfig.test.json）。
import '@testing-library/jest-dom/vitest';

// jsdom 沒有實作 window.matchMedia，但 Sonner 與 next-themes 都會呼叫它
// （偵測減少動態偏好、系統深淺色）。缺了它整個元件樹會在掛載時拋錯，
// 補一個永遠回報「不符合」的最小 stub 即可。
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
