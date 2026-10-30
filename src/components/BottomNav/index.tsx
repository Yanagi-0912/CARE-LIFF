import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { activeNavigationPath, navigationItems } from '../navigation';

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const activePath = activeNavigationPath(pathname);
  return (
    <footer className="care-bottom-nav md:hidden">
      <nav aria-label={t('sidebar.mainNavAriaLabel')}>
        {navigationItems.map(({ path, label, icon: Icon }) => (
          <button type="button" key={path} aria-current={activePath === path ? 'page' : undefined}
            onClick={() => navigate(path)}>
            <span className={path === '/' ? 'care-nav-icon care-home-nav' : 'care-nav-icon'}>
              <Icon className="size-6" strokeWidth={activePath === path ? 2.2 : 1.8} aria-hidden="true" />
            </span>
            <span>{t(label)}</span>
          </button>
        ))}
      </nav>
    </footer>
  );
}
