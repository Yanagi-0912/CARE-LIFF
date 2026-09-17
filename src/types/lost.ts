/** 走失求救的即時位置分享（後端 app/models/lost_location.py）。 */

export type LostStatus = 'active' | 'found' | 'safe' | 'expired';

/** 長輩定位頁看的狀態：還要不要繼續上傳 */
export interface LostSelfStatus {
  active: boolean;
  status: LostStatus | null;
  started_at: string | null;
  ended_at: string | null;
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
  server_time: string;
}

export interface LostEndResult {
  ended: boolean;
  status: LostStatus | null;
}
