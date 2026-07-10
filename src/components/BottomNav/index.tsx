import { useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import { useTranslation } from 'react-i18next';
import { HomeIcon, HealthIcon, FamilyIcon, SettingsIcon } from '../icons';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // 判斷目前網址是否與按鈕對應，來決定要不要加上 active class
  const isActive = (path: string) => (location.pathname === path ? 'active' : '');

  const items = [
    { path: '/', label: t('nav.home'), icon: <HomeIcon /> },
    { path: '/personalhealth', label: t('nav.health'), icon: <HealthIcon /> },
    { path: '/family', label: t('nav.family'), icon: <FamilyIcon /> },
    { path: '/settings', label: t('nav.settings'), icon: <SettingsIcon /> },
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${isActive(item.path)}`}
          onClick={() => navigate(item.path)}
        >
          <span className="icon">{item.icon}</span>
          <span className="label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
