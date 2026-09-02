/**
 * 醫療院所查詢的資料型別，對應後端 `app/routers/users/medical.py`。
 *
 * 這裡刻意把後端回傳的每個欄位都定義出來，即使畫面暫時沒用到：先前 clinic_time /
 * departments / notes 早就在 response JSON 裡（後端 response_model 是完整的
 * MedicalFacility），卻因為型別沒宣告而整整被丟掉一輪，畫面上少了營業時間與科別，
 * 看起來像後端沒給。型別檔漏一個欄位的代價，是功能被誤判成「還沒做」。
 */

/** 星期 key，與後端 `WEEKDAY_KEYS` 對齊（datetime.weekday() 的順序，週一為首）。 */
export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/**
 * 營業狀態。分級判斷（含跨日跨週的下次開診、急診豁免、節慶註記）全在後端，
 * 前端只把列舉值對到顏色與譯文——重寫一份必然與後端漂移。
 */
export type BusinessStatus =
  | 'open'
  | 'before_open'
  | 'break'
  | 'closed_today'
  | 'closed_day'
  | 'emergency'
  | 'call_ahead'
  | 'unknown';

export interface NextOpen {
  weekday_key: WeekdayKey;
  time_text: string;
  is_today: boolean;
}

export interface BusinessStatusInfo {
  status: BusinessStatus;
  next_open: NextOpen | null;
  note: string | null;
  /** 設有急診。與 status 並存：它是能力標示，不是營業狀態。 */
  has_emergency: boolean;
}

export interface ClinicTimeSlot {
  open: string;
  close: string;
}

export interface ClinicDaySchedule {
  isClosed: boolean;
  slots: ClinicTimeSlot[];
}

export interface MedicalFacility {
  id?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  phone?: string | null;
  type: string;
  distance_meters?: number | null;
  clinic_time?: Record<string, ClinicDaySchedule> | null;
  departments?: string[] | null;
  /** 自由文字，格式不規則（節慶休診、需先電洽等）。原樣顯示，不要嘗試解析。 */
  notes?: string | null;
  business_status: BusinessStatusInfo;
}

/** 科別解析結果。`is_alias` 為真代表使用者的說法與部定專科不同，畫面必須揭露。 */
export interface DepartmentMatch {
  requested: string;
  canonical: string;
  is_alias: boolean;
}

/** 院所類型解析結果，語意同 DepartmentMatch。 */
export interface FacilityTypeMatch {
  requested: string;
  category: string;
  is_alias: boolean;
}

export interface NearbyHospitalsResponse {
  facilities: MedicalFacility[];
  count: number;
  reached_meters: number;
  satisfied: boolean;
  expanded: boolean;
  furthest_meters: number | null;
  max_meters: number;
  open_now_requested: boolean;
  open_now_fallback: boolean;
  department: DepartmentMatch | null;
  facility_type: FacilityTypeMatch | null;
  unresolved_department: string | null;
  unresolved_facility_type: string | null;
  /** 查到藥局但最近一家已遠超生活圈時，為最近一家的距離；否則 null。 */
  pharmacy_data_gap_meters: number | null;
}

export interface FacilitySearchResponse {
  facilities: MedicalFacility[];
  count: number;
  total_count: number;
}
