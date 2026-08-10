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

/** 一種藥（對應後端 Medication）。藥袋辨識建立的藥會多帶 usage_raw／license_number 等欄位。 */
export interface Medication {
  id: string;
  user_id: string;
  created_by_user_id: string;
  name: string;
  generic_name: string | null;
  license_number: string | null;
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
 * 注意：後端會濾掉值為 null／undefined 的欄位，
 * 因此無法透過此 API 把 end_date 清成「長期」。
 */
export interface UpdateReminderRequest {
  scheduled_time?: string;
  start_date?: string;
  end_date?: string;
  enabled?: boolean;
}
