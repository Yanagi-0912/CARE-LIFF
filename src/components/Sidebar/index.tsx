import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';

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

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    // 僅桌面版顯示（手機用底部導覽）；黏在 header 下方、自身可捲動
    <aside className="sticky top-[var(--header-h)] hidden h-[calc(100vh-var(--header-h))] w-[var(--sidebar-w)] shrink-0 self-start overflow-y-auto border-r px-4 py-8 md:block">
      <ItemGroup
        className="animate-in fade-in slide-in-from-left-2 fill-mode-both duration-300 gap-1"
        aria-label={t('sidebar.mainNavAriaLabel')}
      >
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <Item
              key={item.path}
              size="sm"
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted',
                active && 'bg-primary/10 text-primary hover:bg-primary/10',
              )}
              render={
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(item.path)}
                />
              }
            >
              <ItemContent>
                <ItemTitle className={cn('text-base', active && 'font-bold')}>
                  {item.label}
                </ItemTitle>
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>
    </aside>
  );
}

export default Sidebar;
