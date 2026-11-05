import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { RotateCwIcon, TriangleAlertIcon, UserPlusIcon } from 'lucide-react';

import { useLiff } from '../../hooks/useLiff';
import { useFamily } from '../../hooks/useFamily';
import { InviteButton } from './InviteButton';
import { MemberAvatar, RoleStatus } from './memberDisplay';
import { memberName, memberPath } from './memberUtils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const tileClass =
  'flex min-h-11 w-full flex-col items-center gap-2 rounded-2xl px-0.5 py-3 text-center outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';
// 每格固定寬度、橫向滑動：家人多時不會把首頁拉長，滑到最後是「加入家人」。
const slideClass = 'w-[7.5rem] shrink-0 snap-start';

/** 首頁的「家人」區塊：可左右滑動的家人頭像（權限以標籤顯示），最後一格是加入家人。 */
export function FamilySection() {
  const { t } = useTranslation();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();

  const invite = (render: (open: () => void) => ReactNode) => (
    <InviteButton
      liffReady={liffReady}
      onSuccess={() => {
        toast.success(t('family.inviteSuccess'));
        refetch();
      }}
      onError={(msg) => toast.error(msg)}
      renderTrigger={render}
    />
  );

  return (
    <section className="mb-6" aria-labelledby="health-family-title">
      <h2 id="health-family-title" className="mb-3 text-lg font-bold">{t('healthHome.family')}</h2>

      {loading ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-3">
              <Skeleton className="size-16 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t('healthHome.familyLoadError')}</AlertTitle>
            <AlertDescription className="wrap-anywhere">{error}</AlertDescription>
          </Alert>
          <Button variant="outline" className="self-start" onClick={() => refetch()}>
            <RotateCwIcon data-icon="inline-start" />
            {t('family.retry')}
          </Button>
        </div>
      ) : (
        <>
          {members.length === 0 && (
            <p className="mb-3 text-base text-muted-foreground">{t('family.empty')}</p>
          )}
          <ul className="-mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1 pb-2" aria-label={t('healthHome.family')}>
            {members.map((member) => (
              <li key={member.user_id} className={slideClass}>
                <Link to={memberPath(member)} className={tileClass}>
                  <MemberAvatar member={member} />
                  <strong className="text-base wrap-anywhere">{memberName(member)}</strong>
                  <RoleStatus role={member.family_role} className="flex-col" />
                </Link>
              </li>
            ))}
            <li className={slideClass}>
              {invite((open) => (
                <button type="button" className={tileClass} onClick={open}>
                  <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-border text-primary">
                    <UserPlusIcon className="size-6" aria-hidden="true" />
                  </span>
                  <strong className="text-base">{t('healthHome.addFamilyTile')}</strong>
                </button>
              ))}
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
