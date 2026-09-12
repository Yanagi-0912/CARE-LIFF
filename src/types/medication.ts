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
 * 後端預設觸發時間（app/models/medication.py 的 DEFAULT_SLOT_TIMES）。
 *
 * 新增表單（簡易模式）拿它預先帶入每個勾選時段的時間欄位，使用者可直接調整，
 * 送出時連同 slot_times 一起送給後端；編輯視窗則用它判斷「時間是否仍停在原
 * 時段的預設值」，據以決定改時段時要不要讓時間跟著走（見 ReminderEditDialog）。
 * 兩份常數必須一致——這裡改了而後端沒改，編輯視窗會判定使用者自訂過時間而
 * 不再跟隨。
 */
export const DEFAULT_SLOT_TIMES: Record<MedicationSlotType, string> = {
  morning: '08:00',
  noon: '12:00',
  evening: '18:00',
  bedtime: '21:30',
};

/** 條目內的服藥時機（對應後端 MealTiming）。同一筆提醒內每種至多一個、至少一個條目。 */
export type MealTiming = 'before_meal' | 'after_meal' | 'none';

/** 顯示順序：飯前 → 飯後 → 其他，推播版面與詳細設定頁都依此排序 */
export const MEAL_TIMING_ORDER: readonly MealTiming[] = ['before_meal', 'after_meal', 'none'] as const;

/** 各服藥時機的 i18n key */
export const MEAL_LABEL_KEY: Record<MealTiming, string> = {
  before_meal: 'meds.meal.before_meal',
  after_meal: 'meds.meal.after_meal',
  none: 'meds.meal.none',
};

/** 一筆提醒內的條目（對應後端 ReminderEntry） */
export interface ReminderEntry {
  meal_timing: MealTiming;
  /** HH:MM */
  scheduled_time: string;
  medication_ids: string[];
}

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
  /**
   * 食藥署仿單的適應症原文。與 thumbnail_url 同一慣例：由後端在讀取當下依
   * 證號就地解析，不是資料庫裡存的值。證號未確定時為 null——不知道是哪一張
   * 藥證，顯示的適應症就可能屬於另一顆藥（與「證號不確定時不得顯示藥丸
   * 照片」同一條安全邊界）。
   *
   * 與上面的 `indication` 分開呈現，SHALL NOT 合併：兩者回答的是不同問題。
   * 仿單答「這個藥核准用於哪些適應症」（監管範疇），藥袋上印的通常是醫師
   * 針對這位病人挑過的那一個，也就是使用者真正想知道的「我為什麼要吃這個」。
   */
  spc_indication: string | null;
  /**
   * 仿單適應症的濃縮版，給不熟悉醫學名詞的長輩看。
   *
   * 為 null 有兩種成因（原文已經夠短所以不需要摘要、或產不出合格摘要），
   * 但對呈現面的意義相同：**退回顯示 `spc_indication` 原文**，而不是整個
   * 不顯示。這是 spec 的「摘要缺席時的降級」。
   */
  spc_indication_summary: string | null;
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
  /** HH:MM，派生自 entries 中最早的時刻。後端以 UTC 判定觸發，前端原樣顯示不做換算 */
  scheduled_time: string;
  /**
   * HH:MM，派生自 entries 中最晚的時刻。T+20 催促與 T+30 家屬警報以它為基準——
   * 只有單一 none 條目時與 scheduled_time 相等。
   */
  timeout_anchor_time: string;
  /** 依飯前 → 飯後 → 其他排序，同一時機至多一筆；medication_ids 為條目聯集的唯讀來源 */
  entries: ReminderEntry[];
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
  /** 簡易模式：每個勾選時段的觸發時間，缺席的時段套用 DEFAULT_SLOT_TIMES */
  slot_times?: Partial<Record<MedicationSlotType, string>>;
  /** 詳細設定：帶條目的時段以此為準，覆蓋 slot_times 的單時刻假設 */
  slot_entries?: Partial<Record<MedicationSlotType, ReminderEntry[]>>;
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
  /** 整份取代現有條目；多條目規則不可再送 scheduled_time（後端回 400，不知道要改哪一個時刻） */
  entries?: ReminderEntry[];
  start_date?: string;
  /** null 代表清成「長期」（沒有結束日期）；不帶這個 key 則不動原值 */
  end_date?: string | null;
  enabled?: boolean;
}

/** POST /api/medications 請求：手動新增一種藥品（source 固定為 manual） */
export interface CreateMedicationRequest {
  user_id: string;
  name: string;
}

/**
 * 一次看診：同一個調劑機構、同一個調劑日期拿到的那些藥。
 *
 * 資料來自藥袋辨識。健保雲端藥歷看不到自費看診（不插健保卡就不會產生就醫
 * 紀錄），藥袋是那件事唯一的入口——這也是這個畫面存在的理由。
 *
 * institution 為 null 代表「未記錄來源」：手動新增的藥，以及後端把這個欄位
 * 落地之前建立的舊紀錄。畫面 SHALL 明確標示，不要留白。
 */
export interface MedicationVisit {
  institution: string | null;
  /** 藥袋上印的調劑日期（YYYY-MM-DD），不是掃描時間 */
  dispensed_date: string | null;
  medication_ids: string[];
  medication_names: string[];
  /**
   * 這次看診被掃描了幾次。實測同一個藥袋在 42 分鐘內被掃了三次，
   * 但那仍然只是一次看診——這個數字只供顯示「掃描過 N 次」，不是分組依據。
   */
  scan_count: number;
  first_created_at: string | null;
}
