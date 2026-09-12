import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamily } from '../../hooks/useFamily';
import { getLineUserId } from '../../utils/auth';
import { canReadGeneral } from '../../utils/familyPermissions';
import type { FamilyMember } from '../../types/family';

export interface ReminderTarget {
  /** undefined＝本人但尚未取得 userId（未登入）；列表 API 省略參數即為本人 */
  userId: string | undefined;
  name: string;
  /** 能不能替這個人新增／修改。只有讀取權的人看得到內容，但按鈕按下去必定 403 */
  canWrite: boolean;
}

/** 讀取本人 LINE userId；未登入時回 undefined（列表 API 省略參數即為本人） */
function readSelfUserId(): string | undefined {
  try {
    return getLineUserId();
  } catch {
    return undefined;
  }
}

/**
 * 「提醒對象」的共用邏輯。用藥與掛號兩個分頁的對象清單、權限判斷完全相同，
 * 只差寫入權各自由哪個函式判斷（canManageMedications／canManageAppointments）。
 *
 * 對象清單只列**讀得到**的成員（GENERAL READ）。列出沒有權限的人，使用者按下去
 * 只會看到一片錯誤，而他無從得知那是壞掉還是不該按。
 *
 * `canWrite` 請傳模組層級的函式，不要傳 inline arrow：它在 useMemo 的依賴裡，
 * 每次 render 換一個新函式會讓清單每次都重算。
 */
export function useReminderTargets(canWrite: (member: FamilyMember) => boolean) {
  const { t } = useTranslation();
  const { members } = useFamily();

  const [selfUserId] = useState(readSelfUserId);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(selfUserId);

  const targets = useMemo<ReminderTarget[]>(
    () => [
      { userId: selfUserId, name: t('meds.self'), canWrite: true },
      ...members
        .filter((member) => canReadGeneral(member))
        .map((member) => ({
          userId: member.user_id as string | undefined,
          name: member.display_name || t('family.unset'),
          canWrite: canWrite(member),
        })),
    ],
    [selfUserId, members, t, canWrite],
  );

  const selectedTarget = targets.find((target) => target.userId === selectedUserId);

  return {
    /** 完整族譜（含讀不到的人）。用來把 departed_by_user_id 之類的 id 換成名字 */
    members,
    selfUserId,
    targets,
    selectedUserId,
    setSelectedUserId,
    selectedName: selectedTarget?.name ?? t('meds.self'),
    // 找不到對象時保守處理：可能是剛被降級、清單還沒重抓。
    canEditSelected: selectedTarget?.canWrite ?? false,
  };
}
