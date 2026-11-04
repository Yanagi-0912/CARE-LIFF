import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { SunIcon, MoonIcon, HeartPulseIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes 在首次掛載前無法得知主題（避免 SSR/localStorage 不一致），這時
  // resolvedTheme 就是 undefined。直接拿它判斷即可，不必另外開一個 mounted 狀態再用
  // effect 寫回去——那會多一輪 render，也是 react-hooks 的 set-state-in-effect。
  // 主題還沒定之前不渲染圖示，否則會閃一下錯誤的太陽／月亮。
  const themeResolved = resolvedTheme !== undefined;
  const isDark = resolvedTheme === 'dark';

  // 登出入口統一收在設定頁（Header 只出現在受保護頁面，等於永遠是登出鈕，
  // 放主畫面容易誤觸），這裡只留主題切換。
  const handleThemeToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const themeLabel = isDark ? t('header.themeToggleToLight') : t('header.themeToggleToDark');

  return (
    // z-40 必須低於浮層層級（dialog／alert-dialog／select／popover／sheet 都是 z-50）。
    // 之前是 z-[100]，這根 sticky bar 會畫在 modal 上面把 dialog 標題與關閉鈕蓋掉，
    // 遮罩也蓋不到它 —— 症狀一眼可辨：開 dialog 時背景變暗但 header 沒變暗。
    <header className="sticky top-0 z-40 flex min-h-[var(--header-h)] items-center border-b bg-card px-5 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-2.5 sm:gap-4">
        {/* 左側 Logo */}
        <div className="group flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <Avatar className="size-11 rounded-[.875rem] after:rounded-[.875rem]">
            <AvatarFallback className="rounded-[.875rem] bg-primary text-primary-foreground ">
              <HeartPulseIcon className="size-6" />
            </AvatarFallback>
          </Avatar>
          <Button
            variant="ghost"
            className="px-1 text-xl font-extrabold tracking-[0.04em]"
            onClick={() => navigate('/')}
          >
            {t('header.brand')}
          </Button>
          <span className="text-sm font-semibold text-muted-foreground max-[359px]:hidden">{t('header.tagline')}</span>
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
            {themeResolved &&
              (isDark ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />)}
          </Button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
