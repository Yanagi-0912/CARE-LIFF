import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import liff from '@line/liff';
import { loginWithLiffIdToken } from '../api/authApi';
import { clearAuth, hasLoggedOut, isAuthenticated, markLoggedOut } from '../utils/auth';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

interface LiffAuthContextType {
  authInitialized: boolean;
  isLoggedIn: boolean;
  liffError: string | null;
  refreshAuth: () => Promise<void>;
  /** 登入頁換發 token 成功後呼叫，讓全域狀態立刻同步（不必等整頁重載） */
  markAuthenticated: () => void;
  logout: () => void;
}

const LiffAuthContext = createContext<LiffAuthContextType>({
  authInitialized: false,
  isLoggedIn: false,
  liffError: null,
  refreshAuth: async () => {},
  markAuthenticated: () => {},
  logout: () => {},
});

export function LiffAuthProvider({ children }: { children: ReactNode }) {
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [liffError, setLiffError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
    // 使用者主動登出後就不要再自動換發 token，否則等於沒登出
    if (hasLoggedOut()) {
      clearAuth();
      setIsLoggedIn(false);
      setAuthInitialized(true);
      return;
    }

    if (!LIFF_ID) {
      // 本地開發無 LIFF ID 時，視原本 localStorage token 狀況決定
      setIsLoggedIn(isAuthenticated());
      setAuthInitialized(true);
      return;
    }

    try {
      await liff.init({ liffId: LIFF_ID });

      if (liff.isLoggedIn()) {
        const idToken = liff.getIDToken();
        if (idToken) {
          try {
            // 利用 LINE ID Token 換發/更新最新存取憑證
            const authResult = await loginWithLiffIdToken(idToken);
            localStorage.setItem('CARE_AUTH_TOKEN', authResult.access_token);
            localStorage.setItem('CARE_LINE_USER_ID', authResult.line_user_id);
            setIsLoggedIn(true);
          } catch {
            // 換發失敗時，改以本地現有 token 嘗試
            setIsLoggedIn(isAuthenticated());
          }
        } else {
          setIsLoggedIn(isAuthenticated());
        }
      } else {
        // 在 LINE 內建瀏覽器環境且未登入時，自動觸發登入
        if (liff.isInClient()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        setIsLoggedIn(isAuthenticated());
      }
    } catch (err) {
      // LIFF 初始化失敗時 fallback 到 localStorage
      setLiffError(err instanceof Error ? err.message : 'LIFF 初始化失敗');
      setIsLoggedIn(isAuthenticated());
    } finally {
      setAuthInitialized(true);
    }
  }, []);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const markAuthenticated = useCallback(() => {
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    // 先落地本地狀態，就算下面 LIFF 那段拋錯也已經是登出的
    clearAuth();
    markLoggedOut();
    setIsLoggedIn(false);
    try {
      // liff.init() 沒跑過時（例如未設定 VITE_LIFF_ID）這裡會丟例外，
      // optional chaining 擋不住，要真的 try/catch
      if (liff.isLoggedIn()) {
        liff.logout();
      }
    } catch {
      // LIFF 尚未初始化：本地憑證已清乾淨，忽略即可
    }
  }, []);

  return (
    <LiffAuthContext.Provider
      value={{
        authInitialized,
        isLoggedIn,
        liffError,
        refreshAuth: initAuth,
        markAuthenticated,
        logout,
      }}
    >
      {!authInitialized ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'var(--bg, #faf8f3)',
            color: 'var(--ink, #1c1a15)',
            fontFamily: 'sans-serif',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--primary-soft, #e4efd6)',
              borderTopColor: 'var(--primary, #2f6b1c)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: '16px',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>正在驗證 LINE 身份資訊…</p>
        </div>
      ) : (
        children
      )}
    </LiffAuthContext.Provider>
  );
}

export function useLiffAuth() {
  return useContext(LiffAuthContext);
}
