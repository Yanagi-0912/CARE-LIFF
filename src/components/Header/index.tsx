import { useNavigate } from 'react-router-dom';
import './index.css';
import { useI18n } from '../../i18n';
import { isAuthenticated, clearAuth } from '../../utils/auth';

function Header() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const isLoggedIn = isAuthenticated();

  const handleAuthClick = () => {
    if (isLoggedIn) {
      // 如果已登入，執行登出並清除 Token
      clearAuth();
    }
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div className="header-container">
        {/* 左側 Logo */}
        <h1 
          className="header-logo clickable"
          onClick={() => navigate('/')}
        >
          CARE
        </h1>
        
        {/* 中間搜尋框 */}
        <div className="search-box">
          <input 
            type="text" 
            placeholder={t('header.searchPlaceholder')}
            className="search-input"
          />
          <button className="search-btn" aria-label={t('header.searchAriaLabel')}>🔍</button>
        </div>

        {/* 右側按鈕 */}
        <nav className="header-nav">
          <button 
            className="login-btn" 
            onClick={handleAuthClick}
          >
            {/* 根據登入狀態顯示文字，這裡假設你的 i18n 有 header.logout，若無則顯示純文字 '登出' */}
            {isLoggedIn ? (t('header.logout') || '登出') : t('header.login')}
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;