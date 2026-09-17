import type {
  LostEndResult,
  LostSelfStatus,
  LostSessionView,
} from '../types/lost';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 走失求救 API 的失敗。只留狀態碼：後端的 detail 只有繁中，畫面上的字由頁面依
 * 狀態碼從 i18n 取（403 沒權限、404 沒有位置分享），理由同 AppointmentApiError。
 */
export class LostApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`lost api ${status}`);
    this.name = 'LostApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!res.ok) throw new LostApiError(res.status);
  return res.json() as Promise<T>;
}

export function fetchMyLostStatus(): Promise<LostSelfStatus> {
  return request<LostSelfStatus>('/api/lost/me');
}

export function uploadLostLocation(position: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}): Promise<LostSelfStatus> {
  return request<LostSelfStatus>('/api/lost/me/location', {
    method: 'POST',
    body: JSON.stringify(position),
  });
}

export function endLostByElder(): Promise<LostEndResult> {
  return request<LostEndResult>('/api/lost/me/end', { method: 'POST' });
}

export function fetchLostSession(userId: string): Promise<LostSessionView> {
  return request<LostSessionView>(`/api/lost/${encodeURIComponent(userId)}`);
}

export function markLostFound(userId: string): Promise<LostEndResult> {
  return request<LostEndResult>(`/api/lost/${encodeURIComponent(userId)}/found`, {
    method: 'POST',
  });
}
