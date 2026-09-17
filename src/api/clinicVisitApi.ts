import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const PATH = '/api/clinic-visits';

/**
 * 錄音是在診間錄的，還是出診間之後長輩自己複述的。
 *
 * 這不是設定，是紀錄的一部分：衛福部《醫療機構醫療隱私維護規範》第二點要求
 * 診療過程錄音須先徵得對方同意，所以一定要走過徵詢。徵詢的結果改變這份紀錄
 * 是什麼東西——`self_recap` 是「長輩記得的版本」，不是「醫師講的版本」，
 * 畫面上必須標明。沒有第三種，沒有徵詢就不會有紀錄。
 */
export type ConsentMode = 'doctor_agreed' | 'self_recap';

export type ClinicVisitStatus = 'processing' | 'ready' | 'failed';

export interface TranscriptSegment {
  text: string;
  /** 這段話從第幾秒開始；模型沒給就是 null。 */
  start_seconds: number | null;
}

export interface MedicationChangeNote {
  description: string;
  /** 逐字稿裡的原文。沒有它這一則就不成立，後端會直接丟掉。 */
  quote: string;
}

export interface DrugHintNote {
  medication_name: string;
  /** 逐字稿實際聽到的字。跟 medication_name 並排顯示，不宣稱哪個才對。 */
  heard: string;
  start: number;
  score: number;
}

export interface ClinicVisitSummary {
  main_points: string[];
  medication_changes: MedicationChangeNote[];
  next_visit: string;
  reminders: string[];
  unclear: string[];
  truncated: boolean;
}

export interface ClinicVisitRecord {
  _id?: string;
  id?: string;
  user_id: string;
  created_by_user_id: string;
  appointment_id: string | null;
  hospital_name: string;
  department: string;
  consent: ConsentMode;
  status: ClinicVisitStatus;
  failure_reason: string;
  recorded_at: string;
  segments: TranscriptSegment[];
  summary: ClinicVisitSummary;
  drug_hints: DrugHintNote[];
}

export class ClinicVisitApiError extends Error {
  status: number;
  detail: string | null;

  constructor(status: number, detail: string | null) {
    super(detail ?? `API 請求失敗：${status}`);
    this.name = 'ClinicVisitApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | null = null;
    try {
      detail = (await response.json())?.detail ?? null;
    } catch {
      detail = null;
    }
    throw new ClinicVisitApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export interface UploadOptions {
  blob: Blob;
  consent: ConsentMode;
  targetUserId?: string;
  appointmentId?: string;
  hospitalName?: string;
  department?: string;
}

/**
 * 上傳整段錄音。回傳的紀錄是 `processing`，轉錄在後端背景跑。
 *
 * 副檔名跟著 Blob 的 MIME 走，因為 Android 多半給 webm、iOS 給 mp4，
 * 後端照 content type 決定暫存檔的副檔名。
 */
export async function uploadClinicRecording(
  options: UploadOptions,
): Promise<ClinicVisitRecord> {
  const { blob, consent, targetUserId, appointmentId, hospitalName, department } = options;
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';

  const form = new FormData();
  form.append('file', blob, `clinic-visit.${extension}`);
  form.append('consent', consent);
  if (targetUserId) form.append('target_user_id', targetUserId);
  if (appointmentId) form.append('appointment_id', appointmentId);
  if (hospitalName) form.append('hospital_name', hospitalName);
  if (department) form.append('department', department);

  // 不要自己設 Content-Type：multipart 的 boundary 必須由瀏覽器產生。
  const response = await fetchWithAuth(`${BASE_URL}${PATH}`, { method: 'POST', body: form });
  return unwrap<ClinicVisitRecord>(response);
}

export async function listClinicVisits(targetUserId?: string): Promise<ClinicVisitRecord[]> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  return unwrap<ClinicVisitRecord[]>(await fetchWithAuth(`${BASE_URL}${PATH}${query}`));
}

export async function getClinicVisit(
  recordId: string,
  targetUserId?: string,
): Promise<ClinicVisitRecord> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  return unwrap<ClinicVisitRecord>(
    await fetchWithAuth(`${BASE_URL}${PATH}/${encodeURIComponent(recordId)}${query}`),
  );
}

export async function deleteClinicVisit(
  recordId: string,
  targetUserId?: string,
): Promise<void> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  const response = await fetchWithAuth(
    `${BASE_URL}${PATH}/${encodeURIComponent(recordId)}${query}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new ClinicVisitApiError(response.status, null);
}
