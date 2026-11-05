import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ClipboardListIcon, EyeIcon, LockIcon, PencilIcon } from 'lucide-react';

import { FAMILY_ROLE_LABEL_KEY } from '../../types/family';
import { FamilyDataState } from './FamilyDataState';
import { MemberNotFound } from './MemberDetailPage';
import { RoleAssignmentNotice } from './RoleAssignmentNotice';
import { memberName, memberPath, useFamilyMember } from './memberUtils';
import { accessRowsFor } from './roleAccess';
import { FeaturePage } from '@/components/FeaturePage';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

/** 查詢紀錄：/family/members/:userId/access，依您替他設定的角色列出他能用您的哪些資料。 */
export default function MemberAccessPage() {
  const { t } = useTranslation();
  const { member, loading, error, refetch, roleAssignment } = useFamilyMember();
  const role = member?.family_role;
  const backTo = member ? memberPath(member) : '/';

  return (
    <FeaturePage title={t('familyAccess.title')} backTo={backTo}>
      <FamilyDataState loading={loading} error={error} empty={false} refetch={refetch}>
        {!member ? <MemberNotFound /> : !role ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><LockIcon /></EmptyMedia>
              <EmptyTitle>{t('familyAccess.unsetTitle')}</EmptyTitle>
              <EmptyDescription>{t('familyAccess.unsetDesc')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link to={backTo} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                {t('familyAccess.back')}
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-base text-muted-foreground">
              {memberName(member)} · {t(FAMILY_ROLE_LABEL_KEY[role])}
            </p>
            {/* 影子模式下角色還沒生效，表格講的是生效後的樣子；提示要照實況講 */}
            <RoleAssignmentNotice status={roleAssignment} />
            <p className="text-base">{t('familyAccess.intro', { name: memberName(member) })}</p>
            <ul className="care-entry-list">
              {accessRowsFor(role).map((row) => (
                <li key={row.labelKey} className="care-entry-row cursor-default">
                  <span className="care-entry-icon care-tone-green"><ClipboardListIcon aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-lg">{t(row.labelKey)}</strong>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      {row.level === 'manage'
                        ? <PencilIcon className="size-4 shrink-0" aria-hidden="true" />
                        : <EyeIcon className="size-4 shrink-0" aria-hidden="true" />}
                      {t(`familyAccess.level.${row.level}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t('familyAccess.menstrualNote')}</p>
          </div>
        )}
      </FamilyDataState>
    </FeaturePage>
  );
}
