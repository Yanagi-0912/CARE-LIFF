import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import { useTranslation } from 'react-i18next';
import LineSidebar from '../LineSidebar/LineSidebar';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const profile = await getPersonalHealthProfile();
        if (!cancelled) {
          setIsAdmin(isAdminRole(profile?.role));
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    { path: '/', label: t('sidebar.home') },
    { path: '/nearby-hospitals', label: t('sidebar.nearbyHospitals') },
    { path: '/personalhealth', label: t('sidebar.health') },
    { path: '/medications', label: t('sidebar.medications') },
    { path: '/knowledge-reports', label: t('sidebar.knowledgeReports') },
    ...(isAdmin
      ? [{ path: '/admin/knowledge-reports', label: t('sidebar.adminKnowledgeReports') }]
      : []),
    { path: '/family', label: t('sidebar.family') },
    { path: '/settings', label: t('sidebar.settings') },
  ];

  const activeIndex = items.findIndex((item) => (
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  ));

  return (
    <aside className="sidebar">
      <LineSidebar
        key={`${location.pathname}-${isAdmin ? 'admin' : 'user'}`}
        items={items.map((item) => item.label)}
        accentColor="var(--primary)"
        textColor="var(--muted)"
        markerColor="var(--line)"
        proximityRadius={84}
        maxShift={12}
        markerLength={34}
        markerGap={10}
        tickScale={0.42}
        itemGap={22}
        fontSize={0.95}
        smoothing={90}
        defaultActive={activeIndex >= 0 ? activeIndex : null}
        onItemClick={(index) => navigate(items[index].path)}
        className="careLineSidebar"
        ariaLabel={t('sidebar.mainNavAriaLabel')}
      />
    </aside>
  );
}

export default Sidebar;
