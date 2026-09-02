import type {
  FacilitySearchResponse,
  NearbyHospitalsResponse,
} from '../types/medical';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const SERVICE_UNAVAILABLE_MESSAGE = '醫療院所查詢暫時不可用，請稍後再試';

export interface NearbySearchFilters {
  /** 只看現在營業中。設有急診者後端一律保留。 */
  openNow?: boolean;
  /** 科別，填使用者的原始說法即可（「腸胃科」），由後端對到部定專科。 */
  department?: string;
  /** 院所類型，填原始說法（「大醫院」「藥局」）。 */
  facilityType?: string;
  limit?: number;
}

/**
 * 搜尋附近院所。
 *
 * 刻意不傳 radius_meters：後端省略此參數時會採用與 LINE 相同的階梯放寬
 * （5→10→20→50 公里），並在回應裡帶上 reached_meters 讓畫面說明實際搜到多遠。
 * 先前這裡寫死 5000，等於把後端「湊不滿就放寬」的設計整個關掉，醫療資源密度
 * 低的地區永遠只會看到「附近無資料」。要硬上限的話應該是使用者的明確選擇，
 * 而不是 API 層的預設值。
 */
export async function fetchNearbyHospitals(
  lat: number,
  lng: number,
  filters: NearbySearchFilters = {},
): Promise<NearbyHospitalsResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    limit: String(filters.limit ?? 5),
  });
  if (filters.openNow) params.set('open_now', 'true');
  if (filters.department?.trim()) params.set('department', filters.department.trim());
  if (filters.facilityType?.trim()) {
    params.set('facility_type', filters.facilityType.trim());
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/medical/nearby?${params}`, {
    method: 'GET',
  });

  if (!res.ok) {
    if (res.status === 503) throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
    throw new Error(`搜尋附近醫院失敗：${res.status}`);
  }

  return (await res.json()) as NearbyHospitalsResponse;
}

export interface FacilitySearchOptions {
  /** 座標可省略；兩者都給才會納入查詢（後端只在成對時走生活圈優先的排序）。 */
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}

/**
 * 依名稱關鍵字查詢院所，對應 LINE 的 `lookup_medical_facility`。
 *
 * LIFF 先前完全沒有這條路：頁面上那個看起來能打字的搜尋框，輸入值是被直接丟掉的，
 * 使用者打「臺大醫院」按下去只會拿到附近五家不相干的診所。
 */
export async function searchFacilitiesByName(
  keyword: string,
  options: FacilitySearchOptions = {},
): Promise<FacilitySearchResponse> {
  const params = new URLSearchParams({
    keyword,
    limit: String(options.limit ?? 10),
  });
  if (options.lat != null && options.lng != null) {
    params.set('lat', String(options.lat));
    params.set('lng', String(options.lng));
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/medical/facilities?${params}`, {
    method: 'GET',
  });

  if (!res.ok) {
    if (res.status === 503) throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
    throw new Error(`查詢院所失敗：${res.status}`);
  }

  return (await res.json()) as FacilitySearchResponse;
}
