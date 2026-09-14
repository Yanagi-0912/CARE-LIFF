import { useTranslation } from 'react-i18next';
import { InfoIcon, ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';

import type { FamilyRoleAssignmentStatus } from '../../types/family';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * 族譜頁與「家人的權限」對話框共用的權限提示。
 *
 * 一定要照**實際生效**的狀態講話。`rbac_migration_state` 由後端算好（總閘打開、
 * 且這位擁有者已切換，才是 enforced），前端只照著選文案。舊版不看狀態，一律說
 * 「未設定的人會以一般家人處理」——在 shadow 時那是錯的：角色根本沒有作用，
 * 每位家人都看得到健康狀況與對話紀錄。讓擁有者以為自己被保護著，比什麼都不說更糟。
 *
 * - enforced：角色照矩陣生效，未設定的人真的以一般家人處理。
 * - shadow、還有人沒設定：後端要等每一位都設定好才切換，所以要講清楚「在那之前
 *   大家都看得到」。
 * - shadow、全都設定好了：總閘被關掉（緊急狀態），或這個家庭還沒被切換。不論是
 *   哪一種，實況都是每位家人看得到，照實講。
 */
export function RoleAssignmentNotice({
  status,
}: {
  status: FamilyRoleAssignmentStatus | null | undefined;
}) {
  const { t } = useTranslation();
  if (!status) return null;

  const count = status.unassigned_member_ids.length;

  if (status.rbac_migration_state === 'enforced') {
    // 沒有待辦就不要製造一則永遠在那裡的橫幅
    if (count === 0) return null;
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>{t('familyRole.unassignedNotice', { count })}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      {status.is_complete ? <TriangleAlertIcon /> : <ShieldAlertIcon />}
      <AlertDescription>
        {status.is_complete
          ? t('familyRole.shadowOffNotice')
          : t('familyRole.shadowPendingNotice', { count })}
      </AlertDescription>
    </Alert>
  );
}
