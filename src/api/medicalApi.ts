import type { NearbyHospitalsResponse } from '../types/medical';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

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

  const res = await fetchWithAuth(`${BASE_URL}/api/medical/nearby?${params}`, {
    method: 'GET',
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('醫療院所查詢暫時不可用，請稍後再試');
    }
    throw new Error(`搜尋附近醫院失敗：${res.status}`);
  }

  return (await res.json()) as NearbyHospitalsResponse;
}

