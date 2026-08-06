import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import liff from '@line/liff';
import { loginWithLiffIdToken } from '../api/authApi';
import { clearAuth, isAuthenticated } from '../utils/auth';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

interface LiffAuthContextType {
  authInitialized: boolean;
  isLoggedIn: boolean;
  liffError: string | null;
  refreshAuth: () => Promise<void>;
  logout: () => void;
}

const LiffAuthContext = createContext<LiffAuthContextType>({
  authInitialized: false,
  isLoggedIn: false,
  liffError: null,
  refreshAuth: async () => {},
  logout: () => {},
});

export function LiffAuthProvider({ children }: { children: ReactNode }) {
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [liffError, setLiffError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
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

  const logout = useCallback(() => {
    clearAuth();
    if (liff.isLoggedIn?.()) {
      liff.logout();
    }
    setIsLoggedIn(false);
  }, []);

  return (
    <LiffAuthContext.Provider
      value={{
        authInitialized,
        isLoggedIn,
        liffError,
        refreshAuth: initAuth,
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
            background: 'var(--bg, #f8fafc)',
            color: 'var(--ink, #0f172a)',
            fontFamily: 'sans-serif',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--primary-soft, #e2e8f0)',
              borderTopColor: 'var(--primary, #16a34a)',
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
