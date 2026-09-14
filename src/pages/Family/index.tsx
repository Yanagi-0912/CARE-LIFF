import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheckIcon, TriangleAlertIcon, UsersIcon } from 'lucide-react';

import { useLiff } from '../../hooks/useLiff';
import { useFamily } from '../../hooks/useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';
import { RoleAssignmentNotice } from './RoleAssignmentNotice';
import { RoleManagerDialog } from './RoleManagerDialog';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

const FamilyPage = () => {
  const { t } = useTranslation();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch, roleAssignment } = useFamily();
  const [managingRoles, setManagingRoles] = useState(false);

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

      {/* 引導式角色指派的入口與提示。
          提示照「實際生效」的狀態講話（見 RoleAssignmentNotice）：沉默或說錯的
          預設值在這裡特別危險——擁有者以為沒做的事等於沒有後果，實際上可能是
          把某個人留在最低權限，也可能是每位家人都看得到他的健康狀況。 */}
      {members.length > 0 && (
        <div className="mb-5 flex flex-col gap-3">
          <RoleAssignmentNotice status={roleAssignment} />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setManagingRoles(true)}
          >
            <ShieldCheckIcon data-icon="inline-start" />
            {t('familyRole.manage.open')}
          </Button>
        </div>
      )}

      {loading ? (
        // 骨架屏用與 MemberCard 同一組 Item 元件，卡片外框自然對齊，
        // 不必再手寫一份 rounded/border/padding
        <ItemGroup className="gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Item key={i} variant="outline">
              <ItemMedia>
                <Skeleton className="size-12 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16 rounded-4xl" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : error ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t('family.errorTitle')}</EmptyTitle>
            {/* 這裡印的是後端或網路層的原始錯誤訊息，可能夾著一整段不能斷行的
                網址或代碼。EmptyHeader 是置中的 flex 欄，子元素縮不到比那段字
                更窄，特大字級下會往兩側各溢出 30 幾 px，整頁出現橫向捲動。
                overflow-wrap: anywhere 連 min-content 寬度一起降下來（break-words
                不會），才縮得進去。 */}
            <EmptyDescription className="wrap-anywhere">{error}</EmptyDescription>
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
      {managingRoles && (
        <RoleManagerDialog onClose={() => setManagingRoles(false)} />
      )}
    </div>
  );
};

export default FamilyPage;
