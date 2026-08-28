import type { HealthProfile } from '../api/profileApi';

/** 家庭角色。`OWNER` 由後端推導，不會出現在成員項目上。 */
export type FamilyRole = 'OWNER' | 'GUARDIAN' | 'CAREGIVER' | 'MEMBER';

/** 可指派給成員的角色。OWNER 不在其中——那是資料歸屬，不是可授予的權限。 */
export const ASSIGNABLE_FAMILY_ROLES: FamilyRole[] = [
  'GUARDIAN',
  'CAREGIVER',
  'MEMBER',
];

export type PermissionAction = 'READ' | 'WRITE';

/**
 * 後端回報的**實際生效**權限。
 *
 * 這已經套用過該成員家庭的遷移狀態，所以前端只要照著渲染，不必也不應該
 * 自己判斷「這個家庭切換了沒」或套用權限矩陣——那等於在前端重建一次授權
 * 判定，而它必然會與後端漂移。真正的邊界永遠是後端的 403。
 */
export interface FamilyPermissions {
  general: PermissionAction[];
  sensitive: PermissionAction[];
  private: PermissionAction[];
}

/** 族譜中的一位成員 */
export interface FamilyMember {
  user_id: string;
  relationship_type: string | null;
  /** LINE 顯示名稱（由後端 JOIN user profile 回傳） */
  display_name?: string;
  /** LINE 頭像網址（由後端 JOIN user profile 回傳） */
  picture_url?: string;
  health_profile?: HealthProfile;
  /**
   * **他對「我的」資料**是什麼角色。存在我的族譜文件裡，我是擁有者，我可以
   * 改這個值。`null` 代表尚未設定（授權上等同 MEMBER，但呈現面要分得出來）。
   */
  family_role?: FamilyRole | null;
  /**
   * **我對「他的」資料**是什麼角色。存在他的族譜文件裡，由他決定，我不能改。
   *
   * 兩個欄位方向相反，很容易讀錯：要判斷「我能不能看他的健康資料」，看的是
   * `my_permissions`（由 `my_role` 攤平而來），不是 `family_role`。
   */
  my_role?: FamilyRole | null;
  my_permissions?: FamilyPermissions;
  /** 對方家庭的遷移狀態。權限已經套用過它，這裡只供呈現面說明用。 */
  rbac_migration_state?: 'shadow' | 'enforced';
}

/** 引導式角色指派的完成狀態。由後端依族譜資料判定，不採信前端旗標。 */
export interface FamilyRoleAssignmentStatus {
  owner_id: string;
  is_complete: boolean;
  /** 尚未設定角色的成員；呈現面要明確告知他們會以 MEMBER 權限處理 */
  unassigned_member_ids: string[];
  rbac_migration_state: 'shadow' | 'enforced';
}

/** 完整族譜 */
export interface FamilyTree {
  user_id: string;
  family_members: FamilyMember[];
  created_at: string;
  updated_at: string;
}

/** GET /family-tree/me 回應 */
export interface GetFamilyTreeResponse {
  family_tree: FamilyTree;
  /** 我自己的引導式指派狀態；族譜頁一載入就要知道還有幾位沒設定 */
  role_assignment?: FamilyRoleAssignmentStatus | null;
}

/** PUT /api/family/members/{memberId}/role 請求 */
export interface SetFamilyRoleRequest {
  family_role: FamilyRole;
}

/** GET /api/family/members/roles 的單筆回應 */
export interface FamilyRoleEntry {
  user_id: string;
  display_name?: string | null;
  /** `null` 代表未設定——呈現面 SHALL NOT 直接顯示成 MEMBER */
  family_role?: FamilyRole | null;
  effective_family_role: FamilyRole;
}

/** POST /family-tree/invites 回應 */
export interface CreateInviteResponse {
  invite_token: string;
  expires_at: string; // ISO 8601
}

/** GET /family-tree/invites/verify/{code} 回應 */
export interface VerifyInviteResponse {
  inviter_display_name: string;
  expires_at: string;
}

/** POST /family-tree/invites/accept 回應 */
export interface AcceptInviteResponse {
  status: 'joined' | 'already_member';
  message?: string;
}

/** POST /family-tree/relationship 請求 */
export interface SetRelationshipRequest {
  member_id: string;
  relationship_type: string;
}

/** 家庭角色的 i18n key。角色名稱要跟著使用者的語言走。 */
export const FAMILY_ROLE_LABEL_KEY: Record<FamilyRole, string> = {
  OWNER: 'familyRole.owner',
  GUARDIAN: 'familyRole.guardian',
  CAREGIVER: 'familyRole.caregiver',
  MEMBER: 'familyRole.member',
};

/** 稱謂中文對照表 */
export const RELATIONSHIP_LABEL: Record<string, string> = {
  parent:      '父/母',
  child:       '子/女',
  spouse:      '配偶',
  sibling:     '兄弟姊妹',
  grandparent: '祖父母',
  grandchild:  '孫子女',
  other:       '其他',
};
