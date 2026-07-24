import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HomeIcon, HealthIcon, FamilyIcon, SettingsIcon } from '../icons';
import GlidingTabs from '../GlidingTabs/GlidingTabs';
import './index.css';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const tabs = [
    { key: '/', label: t('nav.home'), icon: <HomeIcon /> },
    { key: '/personalhealth', label: t('nav.health'), icon: <HealthIcon /> },
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
    <div className="bottom-nav">
      <GlidingTabs
        tabs={tabs}
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        aria-label={t('sidebar.mainNavAriaLabel')}
      />
    </div>
  );
}

export default BottomNav;
