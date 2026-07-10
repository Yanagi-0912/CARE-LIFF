import { useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import { useTranslation } from 'react-i18next';
import { HomeIcon, HealthIcon, FamilyIcon, SettingsIcon } from '../icons';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const isActive = (path: string) => (location.pathname === path ? 'active' : '');

  const items = [
    { path: '/', label: t('sidebar.home'), icon: <HomeIcon /> },
    { path: '/personalhealth', label: t('sidebar.health'), icon: <HealthIcon /> },
    { path: '/family', label: t('sidebar.family'), icon: <FamilyIcon /> },
    { path: '/settings', label: t('sidebar.settings'), icon: <SettingsIcon /> },
  ];

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.path}
            className={`side-item ${isActive(item.path)}`}
            onClick={() => navigate(item.path)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
