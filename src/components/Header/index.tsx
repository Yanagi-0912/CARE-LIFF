import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { getTheme, toggleTheme, type Theme } from '../../utils/theme';
import { SunIcon, MoonIcon } from '../icons';
import Heartbeat from '../Heartbeat/Heartbeat';

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
          <h1
            className="header-logo clickable"
            onClick={() => navigate('/')}
          >
            CARE
          </h1>
        </div>

        <Heartbeat tone="onLight" className="header-ekg" />

        {/* 右側按鈕 */}
        <nav className="header-nav">
          <button
            className="theme-toggle-btn"
            onClick={handleThemeToggle}
            aria-label={theme === 'dark' ? t('header.themeToggleToLight') : t('header.themeToggleToDark')}
            title={theme === 'dark' ? t('header.themeToggleToLight') : t('header.themeToggleToDark')}
          >
            {theme === 'dark' ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
          </button>
          <button className="login-btn" onClick={handleAuthClick}>
            {isLoggedIn ? t('header.logout') : t('header.login')}
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
