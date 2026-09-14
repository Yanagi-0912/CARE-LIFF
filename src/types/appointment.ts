/**
 * 掛號提醒的資料型別，對應後端 `app/models/appointment.py`。
 *
 * 契約來源是後端實作報告（2026-09-10）。與用藥提醒最大的差異：這是**單次事件**，
 * 時間是一個帶 offset 的絕對時間點，不是每天重複的時段。
 */

export type AppointmentStatus = 'scheduled' | 'departed' | 'attended' | 'missed' | 'cancelled';

/** 還能回報出發／到診的狀態。其餘三種是終局，後端會回 409。 */
export const ACTIONABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
  'scheduled',
  'departed',
]);

/**
 * 一筆掛號提醒（GET／POST／PUT／depart／attend 共用同一個回應形狀）。
 *
 * 選填欄位標成 `?: string | null` 而不是只有 `string | null`：後端報告註明，
 * 日後若新增分類更高的欄位，跨使用者讀取在強制模式下會以**拿掉 key** 的方式
 * 遮蔽，而不是設成 null。今天所有欄位都是 GENERAL 不會發生，但型別先允許缺席，
 * 呈現面就不會因為少一個 key 而崩潰。
 */
export interface AppointmentReminder {
  id: string;
  /** 就診者的 LINE userId */
  user_id: string;
  /** 建立者（可能是家屬）。只是來源紀錄，不是授權依據 */
  creator_user_id: string;
  /**
   * 門診時間，ISO 8601 帶 offset，例如 `2026-09-15T09:30:00+08:00`。
   * 後端原樣回傳建立時送去的 offset，前端**不做任何時區換算**，照字串顯示。
   */
  appointment_at: string;

  /** 院所查詢回傳的 id；可能為 null（查詢結果沒帶 id，或手動輸入的院所） */
  facility_id?: string | null;
  /** 權威顯示值，不依賴 facility_id */
  hospital_name: string;
  hospital_address?: string | null;
  hospital_phone?: string | null;
  department: string;
  doctor_name?: string | null;
  serial_number?: string | null;
  note?: string | null;

  status: AppointmentStatus;
  departed_at?: string | null;
  /** 實際按下「我已出發」的人（本人或代按的家屬） */
  departed_by_user_id?: string | null;
  attended_at?: string | null;
  attended_by_user_id?: string | null;
  /** 取消這次門診的時間。與 cancelled_by_user_id 同時有值／同時為 null */
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  /** false＝不再推播。狀態機照走，仍可回報出發／到診 */
  enabled: boolean;
  /**
   * 後端算好的推播時間點，固定 3 筆 `[T-1h, T+0, T+30]` 或 0 筆（不會再推）。
   *
   * 前端只原樣顯示，**不自己推算**——提前多久、延後多久這兩個長度只存在後端。
   * 注意第三筆 T+30 只發給家屬，而且只在屆時仍未到診才會發。
   */
  notify_at: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 清單的兩個分區，「過去」的定義只在後端：當日已結束，**或已經取消**
 * （一筆下個月的門診取消了也歸在過去）。前端不自己分區。
 */
export type AppointmentListScope = 'upcoming' | 'past';

/**
 * `GET /api/appointments/reminders?scope=...` 的回應。
 *
 * - `next_cursor`：不透明字串，原樣帶回去拿下一頁，不要解析。null＝沒有下一頁；
 *   upcoming 不分頁，一律 null。
 * - `total_count`：整個 scope 的筆數，不是這一頁的。「過去的門診（23）」與
 *   「刪除全部 23 筆」都用它。
 */
export interface AppointmentPage {
  items: AppointmentReminder[];
  next_cursor: string | null;
  total_count: number;
}

/** POST /api/appointments/reminders 請求 */
export interface CreateAppointmentRequest {
  user_id: string;
  appointment_at: string;
  facility_id: string | null;
  hospital_name: string;
  hospital_address: string | null;
  hospital_phone: string | null;
  department: string;
  doctor_name: string | null;
  serial_number: string | null;
  note: string | null;
}

/**
 * PUT /api/appointments/reminders/{id} 請求
 *
 * 後端用 `exclude_unset`：「沒帶這個 key」＝不動、「帶了 null」＝清空。
 * 只有選填的六個欄位接受 null；必填欄位送 null 會被擋成 400，所以型別上
 * 刻意不讓它們是 null，誤用在編譯期就會被抓到。
 *
 * 狀態與出發／到診欄位不在這裡：那些只能透過 depart／attend 改。
 */
export interface UpdateAppointmentRequest {
  appointment_at?: string;
  facility_id?: string | null;
  hospital_name?: string;
  hospital_address?: string | null;
  hospital_phone?: string | null;
  department?: string;
  doctor_name?: string | null;
  serial_number?: string | null;
  note?: string | null;
  enabled?: boolean;
}

/**
 * 各欄位的長度上限，與後端 400 驗證一致（實作報告 §4）。
 *
 * 這份是給表單即時提示用的，權威仍在後端：兩邊若漂移，最壞情況是使用者
 * 送出後才看到後端的 400，不會寫進錯的資料。
 */
export const APPOINTMENT_FIELD_LIMITS = {
  facility_id: 64,
  hospital_name: 100,
  hospital_address: 200,
  hospital_phone: 30,
  department: 50,
  doctor_name: 50,
  serial_number: 20,
  note: 500,
} as const;
