import { useTranslation } from 'react-i18next';
import { FeaturePage } from '@/components/FeaturePage';
import { useFamily } from '@/hooks/useFamily';
import { FamilyDataState } from './FamilyDataState';
import { RoleManagerContent } from './RoleManagerContent';

export default function FamilyPermissionsPage() {
  const { t } = useTranslation();
  const { members, loading, error, refetch } = useFamily();
  return (
    <FeaturePage title={t('familyNavigation.permissions')} description={t('familyRole.manage.desc')} backTo="/family">
      <FamilyDataState loading={loading} error={error} empty={members.length === 0} refetch={refetch}>
        <RoleManagerContent />
      </FamilyDataState>
    </FeaturePage>
  );
}
