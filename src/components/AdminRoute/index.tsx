import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlertIcon } from 'lucide-react';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';
import { queryKeys } from '@/lib/queryClient';
import { FeaturePage } from '@/components/FeaturePage';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

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

  // 停在原網址說明原因，而不是默默導回首頁：從連結點進來的人才知道不是壞掉。
  if (state === 'denied') {
    return (
      <FeaturePage title={t('adminRoute.deniedTitle')} backTo="/">
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t('adminRoute.deniedDesc')}
            </p>
            <Link to="/" className={buttonVariants({ variant: 'outline' })}>
              {t('adminRoute.backToTools')}
            </Link>
          </CardContent>
        </Card>
      </FeaturePage>
    );
  }

  return <>{children}</>;
}

export default AdminRoute;
