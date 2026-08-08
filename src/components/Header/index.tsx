import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { getTheme, toggleTheme, type Theme } from '../../utils/theme';
import { SunIcon, MoonIcon, PulseIcon } from '../icons';
import { Button } from '@/components/ui/button';

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

  const themeLabel =
    theme === 'dark' ? t('header.themeToggleToLight') : t('header.themeToggleToDark');

  return (
    <header className="sticky top-0 z-[100] flex min-h-[var(--header-h)] items-center border-b border-hair bg-surface px-3 shadow-card sm:px-4">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-2.5 sm:gap-4">
        {/* 左側 Logo */}
        <div className="group flex shrink-0 items-center gap-2.5">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-[var(--primary-2)] text-white shadow-[0_4px_10px_-3px_rgba(14,147,132,0.5)] group-hover:animate-badge-wiggle"
            aria-hidden="true"
          >
            <PulseIcon width={16} height={16} className="origin-center animate-heartbeat" />
          </span>
          <h1
            className="m-0 cursor-pointer text-[1.15rem] font-extrabold tracking-[0.04em] text-ink sm:text-[1.3rem]"
            onClick={() => navigate('/')}
          >
            CARE
          </h1>
        </div>

        {/* 右側按鈕 */}
        <nav className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-ink active:scale-94 [&_svg]:transition-transform [&_svg]:hover:rotate-[24deg] [&_svg]:hover:scale-108"
            onClick={handleThemeToggle}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {theme === 'dark' ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
          </Button>
          <Button
            className="rounded-full font-bold shadow-[0_4px_12px_-4px_rgba(14,147,132,0.5)] hover:bg-[var(--primary-strong)] hover:shadow-[0_6px_16px_-5px_rgba(14,147,132,0.6)] active:scale-97"
            onClick={handleAuthClick}
          >
            {isLoggedIn ? t('header.logout') : t('header.login')}
          </Button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
