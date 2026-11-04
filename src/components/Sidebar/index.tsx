import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { activeNavigationPath, navigationItems } from '../navigation';

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const activePath = activeNavigationPath(pathname);
  return (
    <aside className="care-sidebar" aria-label={t('sidebar.mainNavAriaLabel')}>
      <div className="flex flex-col gap-2">
        {navigationItems.map(({ path, label, icon: Icon }) => (
          <button type="button" key={path} aria-current={activePath === path ? 'page' : undefined}
            onClick={() => navigate(path)}>
            <span className="care-sidebar-icon"><Icon className="size-6" aria-hidden="true" /></span>
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
