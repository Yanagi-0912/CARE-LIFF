import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';
import { queryKeys } from '@/lib/queryClient';

function AdminRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // 與 Sidebar 共用同一個查詢：兩者都只是要判斷管理員身分，
  // 分開抓會對同一支 API 打兩次。
  const { data: profile, isPending, isError } = useQuery({
    queryKey: queryKeys.myProfile,
    // 包一層：queryFn 會收到 QueryFunctionContext，直接傳函式會把它
    // 當成 userId 參數傳進去。
    queryFn: () => getPersonalHealthProfile(),
  });

  const state = isPending ? 'loading' : isError || !isAdminRole(profile?.role) ? 'denied' : 'allowed';

  if (state === 'loading') {
    return (
      <p className="mx-auto my-8 text-center text-muted-foreground" role="status">
        {t('adminKnowledgeReports.checkingAccess')}
      </p>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default AdminRoute;
