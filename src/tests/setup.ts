import '@testing-library/jest-dom';

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
