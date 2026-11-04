import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TriangleAlertIcon, UsersIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

/** 分類子頁共用載入、錯誤與尚無家人的狀態；成員頁保留原有邀請流程。 */
export function FamilyDataState({ loading, error, empty, refetch, children }: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  refetch: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) {
    return <div role="status" className="flex items-center justify-center gap-3 py-8">
      <Spinner aria-hidden="true" />{t('common.loading')}
    </div>;
  }
  if (error) {
    return <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><TriangleAlertIcon /></EmptyMedia>
        <EmptyTitle>{t('family.errorTitle')}</EmptyTitle>
        <EmptyDescription className="wrap-anywhere">{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button variant="outline" onClick={refetch}>{t('family.retry')}</Button></EmptyContent>
    </Empty>;
  }
  if (empty) {
    return <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
        <EmptyTitle>{t('family.emptyTitle')}</EmptyTitle>
        <EmptyDescription>{t('family.empty')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link className={buttonVariants({ variant: 'outline' })} to="/family/members">
          {t('familyNavigation.members')}
        </Link>
      </EmptyContent>
    </Empty>;
  }
  return children;
}
