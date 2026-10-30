import { useTranslation } from 'react-i18next';
import { InfoIcon, MapPinIcon } from 'lucide-react';
import { EntryLink, FeaturePage } from '@/components/FeaturePage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFamily } from '@/hooks/useFamily';
import { FamilyDataState } from './FamilyDataState';

export default function FamilyLocationPage() {
  const { t } = useTranslation();
  const { members, loading, error, refetch } = useFamily();
  return (
    <FeaturePage title={t('familyNavigation.location')} description={t('familyNavigation.locationSelect')} backTo="/family">
      <div className="mb-5">
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{t('familyNavigation.locationNotice')}</AlertDescription>
        </Alert>
      </div>
      <FamilyDataState loading={loading} error={error} empty={members.length === 0} refetch={refetch}>
        {/* 位置授權依走失通報收件人名單，不是健康 RBAC。族譜沒有這份能力資料，
            由既有地圖頁向後端確認並分別呈現 403／404，不在這裡猜測分享或權限。 */}
        <div className="care-entry-list">
          {members.map((member) => (
            <EntryLink key={member.user_id} to={`/lost/watch?user=${encodeURIComponent(member.user_id)}`}
              title={member.display_name || member.user_id.slice(0, 8)}
              description={t('familyNavigation.locationOpen')} icon={MapPinIcon} />
          ))}
        </div>
      </FamilyDataState>
    </FeaturePage>
  );
}
