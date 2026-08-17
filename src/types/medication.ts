/** 用藥時段（對應後端 MedicationSlotType） */
export type MedicationSlotType = 'morning' | 'noon' | 'evening' | 'bedtime';

/** 時段顯示順序，同時作為新增表單的排列順序 */
export const SLOT_TYPES: readonly MedicationSlotType[] = [
  'morning',
  'noon',
  'evening',
  'bedtime',
] as const;

/** 各時段的 i18n key（時段名稱） */
export const SLOT_LABEL_KEY: Record<MedicationSlotType, string> = {
  morning: 'meds.slot.morning',
  noon: 'meds.slot.noon',
  evening: 'meds.slot.evening',
  bedtime: 'meds.slot.bedtime',
};

/**
 * 後端預設觸發時間（app/models/medication.py 的 DEFAULT_SLOT_TIMES）
 * 僅用於新增表單的預覽顯示；實際時間由後端寫入。
 */
export const DEFAULT_SLOT_TIMES: Record<MedicationSlotType, string> = {
  morning: '08:00',
  noon: '12:00',
  evening: '18:00',
  bedtime: '21:30',
};

/**
 * 一種藥（對應後端 Medication）。藥袋辨識建立的藥會多帶 usage_raw／license_number 等欄位。
 *
 * 外觀欄位（shape／color／score_line／mark_one／mark_two／size）與後端同一慣例：
 * 缺席時是空字串而非 null，只有 license_number 對到候選清單中「有對應藥證」時
 * 才會非空。呈現面據此判斷要不要顯示藥丸照片與外觀描述（spec「證號不確定時
 * 不得顯示藥丸照片」）——license_number 為 null／空字串時，這些欄位理論上
 * 也會是空字串，兩者是一致的。
 */
export interface Medication {
  id: string;
  user_id: string;
  created_by_user_id: string;
  name: string;
  generic_name: string | null;
  license_number: string | null;
  /** 藥丸形狀，例如「圓形」「橢圓形」 */
  shape: string;
  /** 藥丸顏色，例如「白色」 */
  color: string;
  /** 刻痕，例如「一字型」 */
  score_line: string;
  /** 標註一，例如「PBF 436」。160px 縮圖看不清楚，因此以文字欄位獨立呈現 */
  mark_one: string;
  mark_two: string;
  /** 外觀尺寸的原文描述（食藥署資料集的裸數字，無單位——呈現面不臆測單位） */
  size: string;
  /**
   * 藥丸縮圖的對外 URL。由後端在讀取當下就地解析（見
   * MedicationService.get_user_reminders_with_medications），不是資料庫裡
   * 存的值，也不是前端算出來的——只有後端知道證號對應的縮圖檔案是否真的
   * 落地，前端用證號自行推算 URL 只會在多數沒有縮圖的情況下猜出一個會
   * 404 的網址。查無縮圖或證號未確定時為 null，呈現面安全退回純文字。
   */
  thumbnail_url: string | null;
  unit_content: string | null;
  total_quantity: number | null;
  /** 藥袋上的用法原文，手動建立的藥品沒有這個值 */
  usage_raw: string | null;
  frequency_code: string;
  /** 適應症僅供本人與族譜成員於 LIFF 內查看，後端保證不會出現在推播訊息中 */
  indication: string | null;
  source: 'manual' | 'prescription_ocr';
  start_date: string;
  end_date: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** 一筆用藥提醒設定（對應後端 MedicationReminderWithMedications） */
export interface MedicationReminder {
  id: string;
  /** 開立提醒者（家屬）的 LINE userId */
  creator_user_id: string;
  /** 服用藥物者的 LINE userId */
  user_id: string;
  slot_type: MedicationSlotType;
  /** HH:MM。後端以 UTC 判定觸發，前端原樣顯示不做換算 */
  scheduled_time: string;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD，null 代表長期 */
  end_date: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  /** 由 medication_ids 解析出的藥品清單；GET /reminders 才會附上，舊資料或其他端點可能沒有這個欄位 */
  medications?: Medication[];
}

/** POST /api/medications/reminders 請求 */
export interface CreateRemindersRequest {
  user_id: string;
  slots: MedicationSlotType[];
  start_date?: string;
  end_date?: string;
}

/**
 * PUT /api/medications/reminders/{id} 請求
 *
 * 後端以 `model_dump(exclude_unset=True)` 匯出，所以「沒帶這個 key」與
 * 「帶了但是 null」是兩件不同的事：前者不動該欄位，後者才是清空。只有
 * `end_date` 接受 null（清成長期），其餘欄位送 null 會被擋成 400——因此
 * 這裡刻意只有 end_date 的型別包含 null，讓誤用在編譯期就被抓到。
 */
export interface UpdateReminderRequest {
  slot_type?: MedicationSlotType;
  scheduled_time?: string;
  start_date?: string;
  /** null 代表清成「長期」（沒有結束日期）；不帶這個 key 則不動原值 */
  end_date?: string | null;
  enabled?: boolean;
}
