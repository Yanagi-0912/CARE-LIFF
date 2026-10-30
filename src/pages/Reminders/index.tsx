import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, CalendarClockIcon, PillIcon } from 'lucide-react';
import { EntryLink, FeaturePage } from '@/components/FeaturePage';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const TABS = [
  { path: '/reminders/medications', labelKey: 'reminders.tab.medications', Icon: PillIcon },
  { path: '/reminders/appointments', labelKey: 'reminders.tab.appointments', Icon: CalendarClockIcon },
] as const;

/**
 * 新版先顯示兩個服務入口；既有子頁與 LINE 深連結沿用原路徑。
 *
 * 子頁是兩條真實路由而不是同一頁裡的 Tabs：LINE 推播點進來要能直接落在掛號
 * 那頁，Rich Menu 也可能直接指過去，單一路由的 Tabs 做不到深連結。
 * 所以切換鈕是連結（aria-current），不是 role="tab"——理由同 GlidingTabs。
 */
export default function RemindersLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeTab = TABS.find((tab) => pathname.startsWith(tab.path));

  if (pathname === '/reminders' || pathname === '/reminders/') return (
    <FeaturePage title={t('nav.reminders')} description={t('featureNav.remindersDesc')}>
      <div className="flex flex-col gap-3">
        <EntryLink to="/reminders/medications" title={t('home.medications')} description={t('featureNav.medicationsDesc')} icon={PillIcon} />
        <EntryLink to="/reminders/appointments" title={t('home.appointments')} description={t('featureNav.appointmentsDesc')} icon={CalendarClockIcon} />
      </div>
    </FeaturePage>
  );
  if (!activeTab) return <Navigate to="/reminders" replace />;

  return (
    <div className="mx-auto w-full max-w-[48rem]">
      <Link to="/reminders" aria-label={t('personalHealth.return')} className={buttonVariants({ variant: 'outline', size: 'icon', className: 'mb-4 rounded-full' })}>
        <ArrowLeftIcon aria-hidden="true" />
      </Link>
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
