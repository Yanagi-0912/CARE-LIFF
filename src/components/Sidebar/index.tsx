import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import LineSidebar from '../LineSidebar/LineSidebar';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';
import { queryKeys } from '@/lib/queryClient';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  // 與 AdminRoute 共用同一個查詢，兩者都只是要判斷管理員身分；
  // 分開抓會對同一支 API 打兩次。
  const { data: profile } = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: () => getPersonalHealthProfile(),
  });
  const isAdmin = isAdminRole(profile?.role);

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
    // 僅桌面版顯示（手機用底部導覽）；黏在 header 下方、自身可捲動
    <aside className="sticky top-[var(--header-h)] hidden h-[calc(100vh-var(--header-h))] w-[var(--sidebar-w)] shrink-0 self-start overflow-y-auto border-r border-hair bg-surface bg-[image:var(--sidebar-wash)] px-4 py-8 md:block">
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
        className="animate-sidebar-in"
        ariaLabel={t('sidebar.mainNavAriaLabel')}
      />
    </aside>
  );
}

export default Sidebar;
