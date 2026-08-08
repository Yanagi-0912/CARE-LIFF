import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HomeIcon, HealthIcon, PillIcon, FamilyIcon, SettingsIcon } from '../icons';
import GlidingTabs from '../GlidingTabs/GlidingTabs';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const tabs = [
    { key: '/', label: t('nav.home'), icon: <HomeIcon /> },
    { key: '/personalhealth', label: t('nav.health'), icon: <HealthIcon /> },
    { key: '/medications', label: t('nav.meds'), icon: <PillIcon /> },
    { key: '/family', label: t('nav.family'), icon: <FamilyIcon /> },
    { key: '/settings', label: t('nav.settings'), icon: <SettingsIcon /> },
  ];

  const activeKey =
    tabs.find((tab) =>
      tab.key === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(tab.key),
    )?.key ?? '/';

  return (
    // 容器不吃點擊（讓出內容捲動區），只有導覽列本身可點；電腦版改用側欄，故隱藏。
    <div className="pointer-events-none sticky bottom-0 left-0 right-0 z-[100] flex justify-center bg-transparent md:hidden">
      <GlidingTabs
        className="pointer-events-auto"
        tabs={tabs}
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        aria-label={t('sidebar.mainNavAriaLabel')}
      />
    </div>
  );
}

export default BottomNav;
