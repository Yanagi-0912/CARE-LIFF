/** 走失求救的即時位置分享（後端 app/models/lost_location.py）。 */

export type LostStatus = 'active' | 'found' | 'safe' | 'expired';

/** 長輩定位頁上的一位家人。位置只在他按了「我要過去找」之後才有 */
export interface LostFamilyMember {
  name: string;
  /** 45 秒內開著地圖頁 */
  online: boolean;
  coming: boolean;
  latitude: number | null;
  longitude: number | null;
  location_at: string | null;
  distance_m: number | null;
}

/** 長輩定位頁看的狀態：還要不要繼續上傳、哪些家人正在看或正在過來 */
export interface LostSelfStatus {
  active: boolean;
  status: LostStatus | null;
  started_at: string | null;
  ended_at: string | null;
  family: LostFamilyMember[];
}

/** 家人地圖頁每次輪詢時的回報 */
export interface LostPresenceUpload {
  coming: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface LostLocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  source: string | null;
  received_at: string;
}

export interface LostTrailPoint {
  latitude: number;
  longitude: number;
  at: string;
}

/** 家人地圖頁看的內容 */
export interface LostSessionView {
  session_id: string;
  status: LostStatus;
  intent: 'lost' | 'share';
  patient_name: string;
  patient_words: string;
  started_at: string;
  auto_end_at: string;
  ended_at: string | null;
  ended_by_name: string | null;
  last_location: LostLocationPoint | null;
  last_seen_at: string | null;
  stale: boolean;
  stale_after_seconds: number;
  trail: LostTrailPoint[];
  /** 看地圖的這位家人自己按了「我要過去找」沒有 */
  viewer_coming: boolean;
  server_time: string;
}

export interface LostEndResult {
  ended: boolean;
  status: LostStatus | null;
}
