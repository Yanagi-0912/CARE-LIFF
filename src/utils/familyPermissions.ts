import type { FamilyMember, FamilyPermissions } from '../types/family';

/**
 * 家庭權限的**單一判讀處**。
 *
 * 各頁面一律呼叫這裡，不要自己去讀 `my_permissions.sensitive.includes('READ')`——
 * 那個字串一旦散在四個頁面裡，日後改一處就會漏三處，而漏掉的那三處會安靜地
 * 顯示出使用者其實沒有權限的入口。
 *
 * 這裡的判斷 **SHALL NOT 被當成授權**。後端回的 `my_permissions` 已經套用過
 * 對方家庭的遷移狀態，是「實際生效」的值，但它可能是舊的（TanStack Query
 * 預設 staleTime 30 秒）。角色剛被降級時這裡還會說可以，那時後端的 403 才是
 * 真正的邊界。這裡只負責一件事：不要給使用者一個按下去必定失敗的按鈕。
 *
 * 前端**不重算**權限矩陣，也不判斷遷移狀態。那些只存在後端一處——在前端重建
 * 一次，就是第二個安全邊界，而它必然會與第一個漂移。
 */

const NO_PERMISSIONS: FamilyPermissions = {
  general: [],
  sensitive: [],
  private: [],
};

/**
 * 後端沒帶 `my_permissions` 時一律視為沒有權限（fail-closed）。
 *
 * 方向很重要：舊版後端或欄位漏掉時，若預設成「全部可以」，畫面會顯示一堆
 * 按了就 403 的入口；預設成「都不行」則最多是少顯示東西，看得出來、報得出來。
 */
function permissionsOf(member: FamilyMember): FamilyPermissions {
  const permissions = member.my_permissions;
  if (!permissions) return NO_PERMISSIONS;
  return {
    general: permissions.general ?? [],
    sensitive: permissions.sensitive ?? [],
    private: permissions.private ?? [],
  };
}

export function canReadGeneral(member: FamilyMember): boolean {
  return permissionsOf(member).general.includes('READ');
}

export function canWriteGeneral(member: FamilyMember): boolean {
  return permissionsOf(member).general.includes('WRITE');
}

export function canReadSensitive(member: FamilyMember): boolean {
  return permissionsOf(member).sensitive.includes('READ');
}

export function canWriteSensitive(member: FamilyMember): boolean {
  return permissionsOf(member).sensitive.includes('WRITE');
}

export function canReadPrivate(member: FamilyMember): boolean {
  return permissionsOf(member).private.includes('READ');
}

/**
 * 這位成員的資料我完全碰不到嗎。
 *
 * 用於「這張卡片除了名字之外還有什麼可看」的判斷——連 GENERAL 讀取權都沒有
 * 時，展開它只會得到一片空白加三個錯誤訊息。
 */
export function hasNoAccess(member: FamilyMember): boolean {
  const permissions = permissionsOf(member);
  return (
    permissions.general.length === 0 &&
    permissions.sensitive.length === 0 &&
    permissions.private.length === 0
  );
}

/** 我可以幫這位成員設定用藥嗎。用藥對象清單靠它決定要不要顯示新增入口。 */
export function canManageMedications(member: FamilyMember): boolean {
  return canWriteGeneral(member);
}

/** 我可以代這位成員填健康資料嗎。 */
export function canProxyEditHealth(member: FamilyMember): boolean {
  return canWriteSensitive(member);
}
