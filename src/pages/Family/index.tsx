import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TriangleAlertIcon, UsersIcon } from 'lucide-react';

import { useLiff } from '../../hooks/useLiff';
import { useFamily } from '../../hooks/useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ItemGroup } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

const FamilyPage = () => {
  const { t } = useTranslation();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();

  const handleInvited = () => {
    toast.success(t('family.inviteSuccess'));
    refetch();
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{t('family.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length > 0
              ? t('family.memberCount', { n: members.length })
              : t('family.desc')}
          </p>
        </div>

        {/* 有成員時才擺在標題列；空狀態時按鈕改放進 Empty 卡片裡，
            避免長輩得先看懂「右上角」指的是哪裡 */}
        {members.length > 0 && (
          <InviteButton
            liffReady={liffReady}
            onSuccess={handleInvited}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </header>

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 rounded-2xl border border-border px-4 py-3.5"
            >
              <Skeleton className="size-12 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16 rounded-4xl" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t('family.errorTitle')}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => refetch()}>
              {t('family.retry')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : members.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{t('family.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('family.empty')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <InviteButton
              liffReady={liffReady}
              onSuccess={handleInvited}
              onError={(msg) => toast.error(msg)}
            />
          </EmptyContent>
        </Empty>
      ) : (
        // ItemGroup 本身就掛了 role="list"，成員卡片各自掛 role="listitem"
        <ItemGroup className="gap-3">
          {members.map((member) => (
            <MemberCard key={member.user_id} member={member} />
          ))}
        </ItemGroup>
      )}
    </div>
  );
};

export default FamilyPage;
