import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Sidebar from './components/Sidebar';
import AdminRoute from './components/AdminRoute';
import {
  applyTheme,
  defaultSettings,
  STORAGE_KEY,
  type SettingsState,
} from '@/lib/settings';

// 各頁改為動態載入：原本 12 個頁面全部打包進單一 JS，使用者只想看首頁
// 也得先下載並解析全部內容。這對跑在 LINE webview、裝置偏舊的長輩使用者
// 影響最大——切開後首屏只需載入實際用到的那一頁。
const Home = lazy(() => import('./pages/Home'));
const PersonalHealth = lazy(() => import('./pages/PersonalHealth'));
const Family = lazy(() => import('./pages/Family'));
const JoinPage = lazy(() => import('./pages/Join'));
const ConsultRecordsPage = lazy(() => import('./pages/PersonalHealth/ConsultRecords'));
const KnowledgeReportsPage = lazy(() => import('./pages/KnowledgeReports'));
const AdminKnowledgeReportsPage = lazy(() => import('./pages/AdminKnowledgeReports'));
const MedicationsPage = lazy(() => import('./pages/Medications'));
const NearbyHospitalsPage = lazy(() => import('./pages/NearbyHospitals'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Loginpage'));
import { saveRedirectUrl } from './utils/redirect';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/sonner';
import { LiffAuthProvider, useLiffAuth } from './context/LiffAuthProvider';

// 1. ProtectedRoute 元件：整合全域 LIFF 驗證狀態與深連結（Rich Menu）跳轉前路徑保存
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useLiffAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    // 保留深連結（如 Rich Menu → /settings），登入後再跳回
    // 同時寫入 URL ?redirect=，避免 LIFF OAuth 清掉 sessionStorage
    const redirect = `${location.pathname}${location.search}`;
    if (redirect && redirect !== '/login') {
      saveRedirectUrl(redirect);
    }
    const loginTo =
      redirect && redirect !== '/login'
        ? `/login?redirect=${encodeURIComponent(redirect)}`
        : '/login';
    return <Navigate to={loginTo} replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  // 2. 取得當前路徑，用來判斷是否要顯示導覽列
  const location = useLocation();
  const { t } = useTranslation();
  const isStandalonePage = location.pathname === '/login' || location.pathname === '/join';

  useEffect(() => {
    let settings: SettingsState = defaultSettings;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) settings = { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    // 字級與高對比仍由設定頁管理；深淺色主題交給 next-themes（見下方 ThemeProvider）
    applyTheme(settings);
  }, []);

  return (
    <div className="app-layout">
      {/* 3. 如果不是獨立頁面，才顯示 Header */}
      {!isStandalonePage && <Header />}

      <div className="main-wrapper">
        {/* 3. 如果不是獨立頁面，才顯示 Sidebar */}
        {!isStandalonePage && <Sidebar />}

        {/* key 綁定路徑：切頁時重新掛載，觸發進場動畫 */}
        {/* key 讓路由切換時重新掛載，進場動畫才會重播（原本動畫寫在
            index.css 的 .content-area，已改用 tw-animate-css 的 utility）*/}
        <main
          className="content-area animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
          key={location.pathname}
        >
          {/* 頁面切分後首次進入某頁需短暫載入。fallback 用與頁面同高的空白區塊
              而非轉圈動畫：切頁本身很快，閃一下 spinner 反而比留白更晃眼。
              role="status" 讓螢幕閱讀器知道正在載入。 */}
          <Suspense
            fallback={<div className="min-h-[50vh]" role="status" aria-label={t('common.loading')} />}
          >
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/join" element={<JoinPage />} />

            {/* 4. 套用 ProtectedRoute */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/personalhealth" element={<ProtectedRoute><PersonalHealth /></ProtectedRoute>} />
            <Route path="/personalhealth/consult" element={<ProtectedRoute><ConsultRecordsPage /></ProtectedRoute>} />
            <Route path="/medications" element={<ProtectedRoute><MedicationsPage /></ProtectedRoute>} />
            <Route path="/knowledge-reports" element={<ProtectedRoute><KnowledgeReportsPage /></ProtectedRoute>} />
            <Route
              path="/admin/knowledge-reports"
              element={(
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminKnowledgeReportsPage />
                  </AdminRoute>
                </ProtectedRoute>
              )}
            />
            <Route path="/nearby-hospitals" element={<ProtectedRoute><NearbyHospitalsPage /></ProtectedRoute>} />
            <Route path="/family" element={<ProtectedRoute><Family /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* 3. 如果不是獨立頁面，才顯示 BottomNav */}
      {!isStandalonePage && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    // next-themes 標準設定（shadcn 建議）：切換 html 的 .dark class。
    // storageKey 沿用 care-theme，舊使用者的偏好不會被重置。
    // enableSystem 讓「跟隨系統」成為可選項——原本自刻的機制沒有這個。
    // disableTransitionOnChange 避免切換瞬間全站元素一起做色彩過場而閃爍。
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      storageKey="care-theme"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <Router>
          <LiffAuthProvider>
            <AppContent />
          </LiffAuthProvider>
        </Router>
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;
