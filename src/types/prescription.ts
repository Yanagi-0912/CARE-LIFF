import type { MedicationSlotType } from './medication';

/** 醫囑頻次代碼（對應後端 app/models/medication.py 的 MedicationFrequencyCode） */
export type PrescriptionFrequencyCode = 'QD' | 'BID' | 'TID' | 'QID' | 'HS' | 'PRN' | 'OTHER';

/** 服用時機。藥袋未標示時為 null，不由前端推測 */
export type DrugTiming = 'before_meal' | 'after_meal' | 'bedtime' | 'empty_stomach' | null;

/** 草稿整體信心度：高可一鍵確認，中需逐筆核對，低則後端不會建立草稿 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** 單一藥品「名稱」是否通過藥證庫校驗；只有比對命中才會是 high */
export type NameConfidence = 'high' | 'medium' | 'low';

/**
 * 辨識失敗原因。前三者對應後端 ScanFailureReason；
 * too_large／unsupported_type 是前端依 413／415 狀態碼另外賦予的值，
 * 讓四種情境（含服務性失敗）都能各自呈現對應的文案與下一步。
 */
export type PrescriptionScanFailureReason =
  | 'unreadable'
  | 'not_prescription'
  | 'service_unavailable'
  | 'too_large'
  | 'unsupported_type';

/**
 * 頻次代碼 → 預設時段對照，與後端 FREQUENCY_TO_SLOTS（app/models/prescription.py）同步。
 * 僅供畫面預覽「一鍵確認／未覆寫時段時會建立哪些提醒」；實際映射與安全規則
 * （PRN 一律不建立提醒、OTHER 必須由使用者指定）一律以後端為準，前端不重算。
 */
export const FREQUENCY_TO_SLOTS: Record<PrescriptionFrequencyCode, MedicationSlotType[]> = {
  QD: ['morning'],
  BID: ['morning', 'evening'],
  TID: ['morning', 'noon', 'evening'],
  QID: ['morning', 'noon', 'evening', 'bedtime'],
  HS: ['bedtime'],
  PRN: [],
  OTHER: [],
};

/** 單一藥品的辨識結果（對應後端 RecognizedDrug） */
export interface RecognizedDrug {
  name: string;
  generic_name?: string | null;
  unit_content?: string | null;
  total_quantity?: number | null;
  /** 藥袋上的用法原文，原樣保留，供使用者對照 */
  usage_raw?: string | null;
  frequency_code: PrescriptionFrequencyCode;
  dose_per_time?: string | null;
  timing?: DrugTiming;
  duration_days?: number | null;
  indication?: string | null;
  /** 藥證庫比對命中後才會有值 */
  license_number?: string | null;
  name_confidence: NameConfidence;
}

/** 整張藥袋的辨識結果（對應後端 RecognitionResult） */
export interface RecognitionResult {
  institution?: string | null;
  patient_name?: string | null;
  dispensed_date?: string | null;
  drugs: RecognizedDrug[];
  /** 出現多個病患姓名或多份調劑日期：影像中可能鋪了不只一張藥袋 */
  multiple_bags_suspected: boolean;
}

/** 待使用者核對的辨識草稿（對應後端 PrescriptionDraft） */
export interface PrescriptionDraft {
  draft_id: string;
  creator_user_id: string;
  recognition: RecognitionResult;
  confidence_level: ConfidenceLevel;
  /** 由藥袋病患姓名比對族譜得到的建議對象，僅為預設值，仍需使用者確認 */
  suggested_user_id?: string | null;
  created_at: string;
  expires_at: string;
  committed_at?: string | null;
  committed_medication_ids: string[];
}

/** 提交草稿時，單一藥品項目（對應後端 CommitDrugItem） */
export interface CommitDrugItem {
  name: string;
  generic_name?: string | null;
  license_number?: string | null;
  unit_content?: string | null;
  total_quantity?: number | null;
  usage_raw?: string | null;
  frequency_code: PrescriptionFrequencyCode;
  indication?: string | null;
  /** 療程天數，換算成後端 Medication.end_date；省略或 null 代表長期用藥，不設結束日 */
  duration_days?: number | null;
  /**
   * 使用者覆寫的時段。省略（undefined）代表沒有覆寫，由後端依頻次代碼自動映射；
   * 空陣列（[]）代表使用者明確取消勾選所有時段，後端 SHALL NOT 因此退回自動映射的
   * 預設時段——這顆藥就是要被建立成沒有任何定時提醒。兩者不可互相替代。
   */
  slots?: MedicationSlotType[];
  /** 使用者取消勾選的項目不會被建立 */
  include: boolean;
}

/** POST /api/medications/prescription-drafts/{draft_id}/commit 請求 */
export interface CommitPrescriptionDraftRequest {
  user_id: string;
  drugs: CommitDrugItem[];
}

/** 提交後的結果（對應後端 PrescriptionCommitResult） */
export interface PrescriptionCommitResult {
  medication_ids: string[];
  prn_medication_ids: string[];
  /** 這次提交實際建立或連結到的提醒規則 id（去重後）。冪等重放時可能為空陣列。 */
  reminder_ids: string[];
}
