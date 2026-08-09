import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { SunIcon, MoonIcon, PulseIcon } from '../icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes 在首次掛載前無法得知主題（避免 SSR/localStorage 不一致），
  // 未 mounted 時先不渲染圖示，否則會閃一下錯誤的太陽／月亮。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';

  // 登出入口統一收在設定頁（Header 只出現在受保護頁面，等於永遠是登出鈕，
  // 放主畫面容易誤觸），這裡只留主題切換。
  const handleThemeToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const themeLabel = isDark ? t('header.themeToggleToLight') : t('header.themeToggleToDark');

  return (
    <header className="sticky top-0 z-[100] flex min-h-[var(--header-h)] items-center border-b bg-background px-3 sm:px-4">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-2.5 sm:gap-4">
        {/* 左側 Logo */}
        <div className="group flex shrink-0 items-center gap-2.5">
          <Avatar className="size-8 rounded-md">
            <AvatarFallback className="rounded-md bg-primary text-primary-foreground group-hover:animate-badge-wiggle">
              <PulseIcon width={16} height={16} className="origin-center animate-heartbeat" />
            </AvatarFallback>
          </Avatar>
          <Button
            variant="ghost"
            className="px-1 text-xl font-extrabold tracking-[0.04em]"
            onClick={() => navigate('/')}
          >
            CARE
          </Button>
        </div>

        {/* 右側按鈕 */}
        <nav className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            onClick={handleThemeToggle}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {mounted && (isDark ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />)}
          </Button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
