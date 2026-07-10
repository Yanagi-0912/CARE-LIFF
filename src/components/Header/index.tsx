import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { getTheme, toggleTheme, type Theme } from '../../utils/theme';
import { SearchIcon, SunIcon, MoonIcon, PulseIcon } from '../icons';

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const isLoggedIn = isAuthenticated();

  const handleAuthClick = () => {
    if (isLoggedIn) {
      // 如果已登入，執行登出並清除 Token
      clearAuth();
    }
    navigate('/login');
  };

  const handleThemeToggle = () => {
    setThemeState(toggleTheme());
  };

  return (
    <header className="app-header">
      <div className="header-container">
        {/* 左側 Logo */}
        <div className="header-brand">
          <span className="brand-badge" aria-hidden="true">
            <PulseIcon width={16} height={16} />
          </span>
          <h1
            className="header-logo clickable"
            onClick={() => navigate('/')}
          >
            CARE
          </h1>
        </div>

        {/* 中間搜尋框 */}
        <div className="search-box">
          <input
            type="text"
            placeholder={t('header.searchPlaceholder')}
            className="search-input"
          />
          <button className="search-btn" aria-label={t('header.searchAriaLabel')}>
            <SearchIcon width={16} height={16} />
          </button>
        </div>

        {/* 右側按鈕 */}
        <nav className="header-nav">
          <button
            className="theme-toggle-btn"
            onClick={handleThemeToggle}
            aria-label={theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'}
            title={theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'}
          >
            {theme === 'dark' ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
          </button>
          <button className="login-btn" onClick={handleAuthClick}>
            {isLoggedIn ? (t('header.logout') || '登出') : t('header.login')}
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
