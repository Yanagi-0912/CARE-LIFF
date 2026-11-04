import type { FamilyRole } from '../../types/family';

/**
 * 「查詢紀錄」與「家人提醒」的說明用表：您替一位家人選的角色（family_role），
 * 讓他能用您的哪些資料、會不會收到您的照護通知。
 *
 * 這兩張表是抄自後端 `app/models/family_authorization.py` 的 `PERMISSIONS` 與
 * `NOTIFICATION_POLICY`，只拿來**說明**角色的意思，不拿來決定畫面上能不能按、
 * 能不能看——那些一律問 utils/familyPermissions（後端回的實際生效權限）。
 * 後端改矩陣時這裡要跟著改，否則說明會與實況不符。
 */

/** 每個角色配一句白話說明。長輩要能從這句話判斷該選哪個，而不是從角色名稱猜。 */
export const ROLE_EXPLAIN_KEY: Record<FamilyRole, string> = {
  OWNER: 'familyRole.explain.guardian', // 不會被渲染，OWNER 不是可指派的角色
  GUARDIAN: 'familyRole.explain.guardian',
  CAREGIVER: 'familyRole.explain.caregiver',
  MEMBER: 'familyRole.explain.member',
};

type AssignableRole = Exclude<FamilyRole, 'OWNER'>;
type Classification = 'GENERAL' | 'SENSITIVE' | 'PRIVATE';
export type AccessLevel = 'manage' | 'read';

const ROLE_ACCESS: Record<AssignableRole, Record<Classification, AccessLevel | null>> = {
  GUARDIAN: { GENERAL: 'manage', SENSITIVE: 'manage', PRIVATE: 'read' },
  CAREGIVER: { GENERAL: 'manage', SENSITIVE: 'read', PRIVATE: null },
  MEMBER: { GENERAL: 'read', SENSITIVE: null, PRIVATE: null },
};

/** 畫面上的類別對到後端的資料分級。經期是 PERSONAL，任何角色都看不到，所以不列。 */
const CATEGORIES: { key: string; classification: Classification }[] = [
  { key: 'medicationsAppointments', classification: 'GENERAL' },
  { key: 'healthMeasurements', classification: 'SENSITIVE' },
  { key: 'clinicVisits', classification: 'SENSITIVE' },
  { key: 'consultations', classification: 'PRIVATE' },
];

export interface AccessRow {
  labelKey: string;
  level: AccessLevel;
}

/** 這個角色用得到的類別；完全碰不到的類別不列，免得長輩看到一排「不可」。 */
export function accessRowsFor(role: FamilyRole): AccessRow[] {
  if (role === 'OWNER') return [];
  return CATEGORIES.flatMap(({ key, classification }) => {
    const level = ROLE_ACCESS[role][classification];
    return level ? [{ labelKey: `familyAccess.category.${key}`, level }] : [];
  });
}

/** 收得到照護通知（漏服藥、數值異常、走失…）的角色，同後端 NOTIFICATION_POLICY。 */
const CARE_NOTIFIED_ROLES: ReadonlySet<FamilyRole> = new Set(['GUARDIAN', 'CAREGIVER']);

export function receivesCareAlerts(role: FamilyRole): boolean {
  return CARE_NOTIFIED_ROLES.has(role);
}
