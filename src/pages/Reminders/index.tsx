import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClockIcon, PillIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const TABS = [
  { path: '/reminders/medications', labelKey: 'reminders.tab.medications', Icon: PillIcon },
  { path: '/reminders/appointments', labelKey: 'reminders.tab.appointments', Icon: CalendarClockIcon },
] as const;

/**
 * 記住上次看的是哪個子頁。底部導覽的「提醒」格導向 /reminders，如果每次都
 * 落在用藥，常看掛號的人每次都得多點一下。用 sessionStorage：只在這次開啟
 * LIFF 期間有效，重開就回到預設的用藥。
 */
const LAST_TAB_KEY = 'care-reminders-last-tab';

function readLastTab(): string {
  try {
    const saved = sessionStorage.getItem(LAST_TAB_KEY);
    if (saved && TABS.some((tab) => tab.path === saved)) return saved;
  } catch {
    // 儲存空間不可用時（隱私模式、webview 限制）退回預設
  }
  return TABS[0].path;
}

/**
 * 「提醒」分頁的外殼：上方切換用藥／掛號，下方是子頁。
 *
 * 子頁是兩條真實路由而不是同一頁裡的 Tabs：LINE 推播點進來要能直接落在掛號
 * 那頁，Rich Menu 也可能直接指過去，單一路由的 Tabs 做不到深連結。
 * 所以切換鈕是連結（aria-current），不是 role="tab"——理由同 GlidingTabs。
 */
export default function RemindersLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeTab = TABS.find((tab) => pathname.startsWith(tab.path));

  useEffect(() => {
    if (!activeTab) return;
    try {
      sessionStorage.setItem(LAST_TAB_KEY, activeTab.path);
    } catch {
      // ignore
    }
  }, [activeTab]);

  if (!activeTab) return <Navigate to={readLastTab()} replace />;

  return (
    <div className="mx-auto max-w-[760px]">
      <nav
        aria-label={t('reminders.subNavLabel')}
        className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-hair bg-surface-2 p-1"
      >
        {TABS.map(({ path, labelKey, Icon }) => {
          const active = path === activeTab.path;
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: active ? 'default' : 'ghost' }),
                'h-auto min-h-11 rounded-full text-base whitespace-normal',
              )}
            >
              <Icon data-icon="inline-start" aria-hidden />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
