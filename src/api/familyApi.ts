import type {
  AcceptInviteResponse,
  CreateInviteResponse,
  GetFamilyTreeResponse,
  VerifyInviteResponse,
  FamilyTree,
} from '../types/family';
import { authHeaders } from '../utils/auth';

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
  const res = await fetch(`${BASE_URL}/api/family/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 2. 產生邀請碼 (POST /family-tree/invites)
 */
export async function createInvite(): Promise<CreateInviteResponse> {
  const res = await fetch(`${BASE_URL}/api/family/invites`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 3. 驗證邀請碼 (GET /family-tree/invites/verify/{code}) - 公開 API
 */
export async function verifyInvite(code: string): Promise<VerifyInviteResponse> {
  const res = await fetch(`${BASE_URL}/api/family/invites/verify/${encodeURIComponent(code)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 4. 接受邀請 (POST /family-tree/invites/accept)
 */
export async function acceptInvite(code: string): Promise<AcceptInviteResponse> {
  const res = await fetch(`${BASE_URL}/api/family/invites/accept`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 5. 設定關係 (POST /family-tree/relationship)
 */
export async function setRelationship(memberId: string, relationshipType: string): Promise<FamilyTree> {
  const res = await fetch(`${BASE_URL}/api/family/relationship`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      member_id: memberId,
      relationship_type: relationshipType,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
