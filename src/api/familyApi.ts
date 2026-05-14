import type {
  AcceptInvitationResponse,
  GetFamilyTreeResponse,
  SendInvitationResponse,
} from '../types/family';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 取得指定使用者的族譜
 */
export async function fetchFamilyTree(userId: string): Promise<GetFamilyTreeResponse> {
  const res = await fetch(`${BASE_URL}/family-tree/me?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) {
    throw new Error(`取得族譜失敗：${res.status}`);
  }
  return res.json();
}

export class FamilyApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = 'FamilyApiError';
    this.status = status;
    this.code = code;
  }
}

interface AcceptInvitationErrorResponse {
  error_code?: string;
  message?: string;
}

/**
 * 產生邀請連結
 */
export async function createInvitation(inviterId?: string): Promise<SendInvitationResponse> {
  const body = inviterId ? JSON.stringify({ inviter_id: inviterId }) : undefined;
  const res = await fetch(`${BASE_URL}/family-tree/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    throw new Error(`建立邀請失敗：${res.status}`);
  }
  return res.json();
}

/**
 * 使用邀請碼加入家庭
 */
export async function acceptInvitation(code: string): Promise<AcceptInvitationResponse> {
  const res = await fetch(`${BASE_URL}/family-tree/invite/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    let errorCode: string | undefined;
    let message = `接受邀請失敗：${res.status}`;
    try {
      const data = await res.json() as AcceptInvitationErrorResponse;
      errorCode = data.error_code;
      if (data.message) message = data.message;
    } catch {
      // ignore parse error
    }
    throw new FamilyApiError(message, res.status, errorCode);
  }

  return res.json();
}
