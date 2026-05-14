import type { GetFamilyTreeResponse, SendInvitationResponse } from '../types/family';
import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 取得指定使用者的族譜
 */
export async function fetchFamilyTree(userId: string): Promise<GetFamilyTreeResponse> {
  const res = await fetch(
    `${BASE_URL}/family-tree/me?user_id=${encodeURIComponent(userId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`取得族譜失敗：${res.status}${text ? ` - ${text}` : ''}`);
  }
  return res.json();
}

/**
 * 產生邀請連結
 */
export async function createInvitation(inviterId: string): Promise<SendInvitationResponse> {
  const res = await fetch(`${BASE_URL}/family-tree/invite`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ inviter_id: inviterId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`建立邀請失敗：${res.status}${text ? ` - ${text}` : ''}`);
  }
  return res.json();
}
