import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckIcon } from 'lucide-react';

import { setFamilyRole } from '../../api/familyApi';
import type { FamilyMember, FamilyRole, FamilyRoleAssignmentStatus } from '../../types/family';
import { ASSIGNABLE_FAMILY_ROLES, FAMILY_ROLE_LABEL_KEY } from '../../types/family';
import { FamilyDataState } from './FamilyDataState';
import { MemberNotFound } from './MemberDetailPage';
import { RoleAssignmentNotice } from './RoleAssignmentNotice';
import { ROLE_EXPLAIN_KEY } from './roleAccess';
import { MemberAvatar } from './memberDisplay';
import { memberName, memberPath, useFamilyMember } from './memberUtils';
import { FeaturePage } from '@/components/FeaturePage';
import { queryKeys } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';

/** 設定權限：/family/members/:userId/role，替一位家人選角色。 */
export default function MemberRolePage() {
  const { t } = useTranslation();
  const { member, loading, error, refetch, roleAssignment } = useFamilyMember();
  return (
    <FeaturePage title={t('familyRolePage.title')} backTo={member ? memberPath(member) : '/personalhealth'}>
      <FamilyDataState loading={loading} error={error} empty={false} refetch={refetch}>
        {member
          // key：換人時選取狀態從那個人目前的角色重新開始
          ? <RoleForm key={member.user_id} member={member} roleAssignment={roleAssignment} />
          : <MemberNotFound />}
      </FamilyDataState>
    </FeaturePage>
  );
}

function RoleForm({ member, roleAssignment }: {
  member: FamilyMember;
  roleAssignment: FamilyRoleAssignmentStatus | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // 未設定時不預先選任何一個：直接選中一般家人，擁有者會以為自己設定過了
  const [selected, setSelected] = useState<FamilyRole | null>(member.family_role ?? null);
  const name = memberName(member);
  // 說明寫的是生效後的權限；還沒生效時照原句會變成謊話，所以前面標上「生效後」
  const notYetEnforced = roleAssignment?.rbac_migration_state === 'shadow';

  const mutation = useMutation({
    mutationFn: (role: FamilyRole) => setFamilyRole(member.user_id, role),
    onSuccess: () =>
      // 角色一變，族譜的權限、指派狀態與該成員的健康資料快取都可能過期
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.familyTree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.familyMemberRoles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberProfile(member.user_id) }),
      ]),
  });

  const save = async () => {
    if (!selected) return;
    try {
      await mutation.mutateAsync(selected);
      toast.success(t('familyRole.manage.saved', { name }));
      navigate(memberPath(member), { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('familyRole.manage.saveError'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <MemberAvatar member={member} className="size-14" />
        <div className="min-w-0">
          <p className="text-xl font-bold wrap-anywhere text-ink">{name}</p>
          <p className="text-sm text-muted-foreground">{t('familyRolePage.choose')}</p>
        </div>
      </div>

      <RoleAssignmentNotice status={roleAssignment} />

      <RadioGroup
        value={selected}
        onValueChange={(value) => setSelected(value as FamilyRole)}
        disabled={mutation.isPending}
        aria-label={t('familyRole.manage.roleFor', { name })}
      >
        {ASSIGNABLE_FAMILY_ROLES.map((role) => (
          <label
            key={role}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4 has-data-checked:border-primary has-data-checked:bg-accent"
          >
            <RadioGroupItem value={role} className="mt-1.5" />
            <span className="min-w-0 flex-1">
              <strong className="block text-lg">{t(FAMILY_ROLE_LABEL_KEY[role])}</strong>
              <span className="block text-base leading-relaxed text-muted-foreground">
                {notYetEnforced
                  ? t('familyRole.explain.pending', { text: t(ROLE_EXPLAIN_KEY[role]) })
                  : t(ROLE_EXPLAIN_KEY[role])}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      <p className="text-center text-sm text-muted-foreground">{t('familyAccess.menstrualNote')}</p>

      <Button
        type="button"
        size="lg"
        className="h-auto min-h-12 w-full py-2 whitespace-normal"
        disabled={!selected || mutation.isPending}
        onClick={() => void save()}
      >
        {mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
        {t(mutation.isPending ? 'familyRolePage.saving' : 'familyRolePage.save')}
      </Button>
    </div>
  );
}
