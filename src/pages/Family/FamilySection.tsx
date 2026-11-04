import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRightIcon, HeartPulseIcon, RotateCwIcon, ShieldCheckIcon, TriangleAlertIcon, UserPlusIcon, UsersIcon } from 'lucide-react';

import { useLiff } from '../../hooks/useLiff';
import { useFamily } from '../../hooks/useFamily';
import { InviteButton } from './InviteButton';
import { RoleAssignmentNotice } from './RoleAssignmentNotice';
import { MemberAvatar, RoleStatus } from './memberDisplay';
import { memberName, memberPath } from './memberUtils';
import { EntryLink } from '@/components/FeaturePage';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const tileClass =
  'flex min-h-11 flex-col items-center gap-2 rounded-2xl px-0.5 py-3 text-center outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** 健康首頁的「家人」區塊：家人格子、加入家人，以及新增家人與我的健康紀錄兩列入口。 */
export function FamilySection() {
  const { t } = useTranslation();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch, roleAssignment } = useFamily();

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
  const hasUnassigned = (roleAssignment?.unassigned_member_ids.length ?? 0) > 0;

  return (
    <>
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
            {members.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                <RoleAssignmentNotice status={roleAssignment} />
                {hasUnassigned && (
                  <Link to="/family/permissions" className="care-entry-row care-entry-soft">
                    <ShieldCheckIcon className="size-5 shrink-0" aria-hidden="true" />
                    <strong className="min-w-0 flex-1">{t('familyRole.manage.open')}</strong>
                    <ChevronRightIcon className="size-5 shrink-0" aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
            {members.length === 0 && (
              <p className="mb-3 text-base text-muted-foreground">{t('family.empty')}</p>
            )}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,6.5rem),1fr))] gap-1">
              {members.map((member) => (
                <li key={member.user_id}>
                  <Link to={memberPath(member)} className={tileClass}>
                    <MemberAvatar member={member} />
                    <strong className="text-base wrap-anywhere">{memberName(member)}</strong>
                    <RoleStatus role={member.family_role} className="flex-col" />
                  </Link>
                </li>
              ))}
              <li>
                {invite((open) => (
                  <button type="button" className={`${tileClass} w-full`} onClick={open}>
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

      <div className="care-entry-list">
        {invite((open) => (
          <button type="button" className="care-entry-row" onClick={open}>
            <span className="care-entry-icon care-tone-green"><UsersIcon aria-hidden="true" /></span>
            <strong className="min-w-0 flex-1 text-left text-lg">{t('healthHome.addFamily')}</strong>
            <ChevronRightIcon className="size-5 shrink-0 text-faint" aria-hidden="true" />
          </button>
        ))}
        <EntryLink to="/health-records" title={t('healthHome.myRecords')} icon={HeartPulseIcon} />
      </div>
    </>
  );
}
