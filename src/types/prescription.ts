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

/**
 * 單一候選藥證（對應後端 DrugCandidate）：藥名命中多張藥證時，供核對畫面
 * 呈現給使用者挑選的其中一張。外觀欄位缺席時是空字串而非 null——原樣沿用
 * 後端慣例，呼叫端不必先判斷型別就能安全串接顯示。
 * `thumbnail_url` 是掃描當下就地解析好的對外縮圖路徑，查無縮圖時為
 * null，呈現面必須安全地退回純文字（spec「照片缺席時的降級」）。
 */
export interface DrugCandidate {
  license_number: string;
  name_zh: string;
  shape: string;
  color: string;
  score_line: string;
  mark_one: string;
  mark_two: string;
  size: string;
  thumbnail_url: string | null;
}

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
  /** 後端**唯一性判定成立**時才有值。null 代表「藥名比對到了，但無法確定是
   * 哪一張藥證」，**不蘊含候選有多筆**：反向含容命中算進唯一性判定卻不列入
   * candidates，所以「候選只有一筆、license_number 為 null」是常態（實測全庫
   * 56,886 個中文品名有 27,058 個、47.6% 落在這個狀態）。只有單向的蘊含成立
   * ——有值時 candidates 必然恰好一筆，反過來不成立。 */
  license_number?: string | null;
  /**
   * 可供使用者挑選的候選清單：完全比對與正向含容命中的藥證，**不含**只參與
   * 唯一性判定的反向含容命中（那些按定義是別的藥，挑中就會貼上錯的照片）。
   * 完全比不到藥證庫時為空陣列，此時沒有任何外觀資訊可呈現。
   * **清單只有一筆不代表證號已確定**——要判斷「已確定」一律看 license_number
   * 有沒有值，不要從 candidates.length 推論（見上一個欄位與
   * DrugCandidateSection 的唯讀閘門）。核對畫面用它呈現候選的照片與外觀描述
   * 供使用者挑選；挑選結果經由 CommitDrugItem 的 license_number 送回。
   */
  candidates: DrugCandidate[];
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
  /**
   * 服用時機。與辨識結果一樣原樣帶出，不在前端重算——後端只在頻次代碼
   * 隱含「一日單一劑量」（目前僅 QD）且值為 `bedtime` 時，用它把預設時段
   * 由 `morning` 改為 `bedtime`；其餘 timing 值不影響時段映射。省略此欄位
   * 會讓後端無從得知辨識出的服用時機，因此即使 slots 有覆寫也一併帶上。
   */
  timing?: DrugTiming;
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
  /**
   * 這次提交把哪些時段從「停用／已過期／還沒到開始日」重新變回可排程狀態。
   * 命中一筆原本關閉的規則時，掛在它底下、使用者當初就是要停掉的其他藥
   * 也會連帶恢復收到提醒——核對畫面要在送出前用這個事實先揭露一次，
   * 送出後的訊息也要如實反映，不能只字未提。冪等重放時可能為空陣列。
   */
  reactivated_slots: MedicationSlotType[];
  /**
   * 這次提交把哪些藥品挑定的證號丟棄、改以空證號建立（候選清單外的證號，
   * 見後端 PrescriptionCommitResult 的說明）。正常操作下不會發生——本畫面
   * 的候選挑選器只會送出真的落在候選清單內的證號，藥名一經編輯也會清空
   * 挑選狀態；此欄位是後端回應契約的一部分，選填是為了不強迫既有測試
   * 逐一補上這個永遠是空陣列的欄位。
   */
  discarded_license_medication_ids?: string[];
}
