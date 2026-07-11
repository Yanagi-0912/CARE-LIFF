import type { NearbyHospitalsResponse } from '../types/medical';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function getAuthToken() {
  const token = (localStorage.getItem('CARE_AUTH_TOKEN') || '').trim();
  if (!token) {
    throw new Error('缺少登入憑證，請先重新登入');
  }
  return token;
}

function buildAuthHeaders() {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    'ngrok-skip-browser-warning': 'true',
  };
}

export async function fetchNearbyHospitals(
  lat: number,
  lng: number,
  options?: { radiusMeters?: number; limit?: number },
): Promise<NearbyHospitalsResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius_meters: String(options?.radiusMeters ?? 5000),
    limit: String(options?.limit ?? 5),
  });

  const res = await fetch(`${BASE_URL}/api/medical/nearby?${params}`, {
    method: 'GET',
    headers: buildAuthHeaders(),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('登入已失效，請重新登入');
    }
    if (res.status === 503) {
      throw new Error('醫療院所查詢暫時不可用，請稍後再試');
    }
    throw new Error(`搜尋附近醫院失敗：${res.status}`);
  }

  return (await res.json()) as NearbyHospitalsResponse;
}
