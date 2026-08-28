import type {
  AcceptInviteResponse,
  CreateInviteResponse,
  FamilyRole,
  FamilyRoleAssignmentStatus,
  FamilyRoleEntry,
  GetFamilyTreeResponse,
  VerifyInviteResponse,
  FamilyTree,
} from '../types/family';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 輔助函式：解析錯誤訊息
 */
async function parseError(res: Response): Promise<Error> {
  let message = `API 請求失敗：${res.status}`;
  try {
    const data = await res.json();
    if (data.detail) {
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // ignore parse error
  }
  return new Error(message);
}

/**
 * 1. 取得當前使用者的族譜 (由後端透過 JWT 識別)
 */
export async function fetchFamilyTree(): Promise<GetFamilyTreeResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/me`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 2. 產生邀請碼 (POST /family-tree/invites)
 */
export async function createInvite(): Promise<CreateInviteResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/invites`, {
    method: 'POST',
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 3. 驗證邀請碼 (GET /family-tree/invites/verify/{code}) - 公開 API
 */
export async function verifyInvite(code: string): Promise<VerifyInviteResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/invites/verify/${encodeURIComponent(code)}`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 4. 接受邀請 (POST /family-tree/invites/accept)
 */
export async function acceptInvite(code: string): Promise<AcceptInviteResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/invites/accept`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 5. 設定關係 (POST /family-tree/relationship)
 */
export async function setRelationship(memberId: string, relationshipType: string): Promise<FamilyTree> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/relationship`, {
    method: 'POST',
    body: JSON.stringify({
      member_id: memberId,
      relationship_type: relationshipType,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}


/**
 * 6. 指派家庭成員角色（限資料擁有者本人或其受委任者）
 *
 * 路徑不帶 ownerId，因此寫入的恆為呼叫者自己的族譜——這條路徑不存在
 * 「改別人族譜裡的自己」這種形狀。真正的判定在後端，這裡只是呼叫。
 */
export async function setFamilyRole(
  memberId: string,
  familyRole: FamilyRole,
): Promise<FamilyTree> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/family/members/${encodeURIComponent(memberId)}/role`,
    {
      method: 'PUT',
      body: JSON.stringify({ family_role: familyRole }),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 7. 查詢自己族譜中每位成員的角色
 *
 * `family_role` 為 null 代表**未設定**——呈現面要據此告訴擁有者「這個人目前
 * 會以 MEMBER 的權限處理」，不能直接顯示成 MEMBER 而讓他以為自己設定過了。
 */
export async function fetchMemberRoles(): Promise<FamilyRoleEntry[]> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/members/roles`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** 8. 查詢引導式角色指派的完成狀態（由後端依族譜資料判定） */
export async function fetchRoleAssignmentStatus(): Promise<FamilyRoleAssignmentStatus> {
  const res = await fetchWithAuth(`${BASE_URL}/api/family/role-assignment-status`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}
