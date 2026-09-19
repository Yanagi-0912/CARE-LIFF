import { createContext, useContext } from 'react';

/**
 * LiffAuthProvider 的 context 與讀取它的 hook。
 *
 * 跟元件分開放，是因為 react-refresh/only-export-components：一個檔案同時匯出
 * 元件與非元件時，改動會讓 Fast Refresh 整頁重載，開發時打到一半的狀態會不見。
 * context 與 hook 沒有畫面，放在這裡剛好。
 */
export interface LiffAuthContextType {
  authInitialized: boolean;
  isLoggedIn: boolean;
  liffError: string | null;
  refreshAuth: () => Promise<void>;
  /** 登入頁換發 token 成功後呼叫，讓全域狀態立刻同步（不必等整頁重載） */
  markAuthenticated: () => void;
  logout: () => void;
}

export const LiffAuthContext = createContext<LiffAuthContextType>({
  authInitialized: false,
  isLoggedIn: false,
  liffError: null,
  refreshAuth: async () => {},
  markAuthenticated: () => {},
  logout: () => {},
});

export function useLiffAuth() {
  return useContext(LiffAuthContext);
}
