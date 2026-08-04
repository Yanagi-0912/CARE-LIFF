import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import PersonalHealth from './pages/PersonalHealth';
import Family from './pages/Family';
import JoinPage from './pages/Join';
import ConsultRecordsPage from './pages/PersonalHealth/ConsultRecords';
import KnowledgeReportsPage from './pages/KnowledgeReports';
import MedicationsPage from './pages/Medications';
import NearbyHospitalsPage from './pages/NearbyHospitals';
import SettingsPage, { applyTheme, STORAGE_KEY, defaultSettings } from './pages/Settings';
import type { SettingsState } from './pages/Settings';
import './App.css';
import Login from './pages/Loginpage';
import { isAuthenticated } from './utils/auth';
import { saveRedirectUrl } from './utils/redirect';
import { getTheme, applyThemeAttribute } from './utils/theme';

// 1. 新增 ProtectedRoute 元件
function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isAuthenticated()) {
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
  return children;
}

function AppContent() {
  // 2. 取得當前路徑，用來判斷是否要顯示導覽列
  const location = useLocation();
  const isStandalonePage = location.pathname === '/login' || location.pathname === '/join';

  useEffect(() => {
    let settings: SettingsState = defaultSettings;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) settings = { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    applyTheme(settings);
    // 套用已儲存的深色/淺色主題（index.html 的早期腳本已先設定，這裡確保一致）
    applyThemeAttribute(getTheme());
  }, []);

  return (
    <div className="app-layout">
      {/* 3. 如果不是登入頁，才顯示 Header */}
      {!isStandalonePage && <Header />}
      
      <div className="main-wrapper">
        {/* 3. 如果不是登入頁，才顯示 Sidebar */}
        {!isStandalonePage && <Sidebar />}
        
        {/* key 綁定路徑：切頁時重新掛載，觸發進場動畫 */}
        <main className="content-area" key={location.pathname}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/join" element={<JoinPage />} />
            
            {/* 4. 套用 ProtectedRoute */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/personalhealth" element={<ProtectedRoute><PersonalHealth /></ProtectedRoute>} />
            <Route path="/personalhealth/consult" element={<ProtectedRoute><ConsultRecordsPage /></ProtectedRoute>} />
            <Route path="/medications" element={<ProtectedRoute><MedicationsPage /></ProtectedRoute>} />
            <Route path="/knowledge-reports" element={<ProtectedRoute><KnowledgeReportsPage /></ProtectedRoute>} />
            <Route path="/nearby-hospitals" element={<ProtectedRoute><NearbyHospitalsPage /></ProtectedRoute>} />
            <Route path="/family" element={<ProtectedRoute><Family /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          </Routes>
        </main>
      </div>
      
      {/* 3. 如果不是登入頁，才顯示 BottomNav */}
      {!isStandalonePage && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
