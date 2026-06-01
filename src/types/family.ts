import type { HealthProfile } from '../api/profileApi';

/** 族譜中的一位成員 */
export interface FamilyMember {
  user_id: string;
  relationship_type: string | null;
  display_name?: string;   // 後續由後端擴充提供（方案 A）
  picture_url?: string;    // 後續由後端擴充提供（方案 A）
  health_profile?: HealthProfile;
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
