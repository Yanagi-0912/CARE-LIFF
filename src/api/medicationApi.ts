import type {
  CreateMedicationRequest,
  CreateRemindersRequest,
  Medication,
  MedicationReminder,
  MedicationVisit,
  UpdateReminderRequest,
} from '../types/medication';
import type {
  CommitPrescriptionDraftRequest,
  PrescriptionCommitResult,
  PrescriptionDraft,
  PrescriptionScanFailureReason,
} from '../types/prescription';
import i18n from '../i18n';
import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 輔助函式：解析錯誤訊息
 */
async function parseError(res: Response): Promise<Error> {
  let message = i18n.t('common.requestFailed', { status: res.status });
  try {
    const data = await res.json();
    if (data.detail) {
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // ignore parse error
  }
  return new Error(message);
}

/** 上傳藥袋影像失敗。reason 讓呼叫端能分別給「重拍」「換一張」「稍後再試」三種不同指示。 */
export class PrescriptionScanError extends Error {
  reason: PrescriptionScanFailureReason;

  constructor(reason: PrescriptionScanFailureReason, message: string) {
    super(message);
    this.name = 'PrescriptionScanError';
    this.reason = reason;
  }
}

const SCAN_FAILURE_REASONS = new Set<string>([
  'unreadable',
  'not_prescription',
  'service_unavailable',
]);

/**
 * 解析 /prescription-scan 的失敗回應。
 *
 * 413／415 由路由或 ASGI middleware 直接擋下，body 是純字串 detail，沒有
 * reason 欄位——這裡以狀態碼本身當依據，額外賦予 too_large／unsupported_type
 * 兩個前端專用的 reason，讓四種情境（含服務性失敗）都能各自呈現對應文案。
 */
async function parseScanError(res: Response): Promise<PrescriptionScanError> {
  let detail: unknown;
  try {
    detail = (await res.json()).detail;
  } catch {
    detail = undefined;
  }

  if (res.status === 413) {
    return new PrescriptionScanError(
      'too_large',
      typeof detail === 'string' ? detail : '影像檔案過大，請重新拍攝或壓縮後再試',
    );
  }
  if (res.status === 415) {
    return new PrescriptionScanError(
      'unsupported_type',
      typeof detail === 'string' ? detail : '僅接受影像檔案',
    );
  }
  if (detail && typeof detail === 'object' && 'reason' in detail) {
    const { reason, message } = detail as { reason: string; message?: string };
    if (SCAN_FAILURE_REASONS.has(reason)) {
      return new PrescriptionScanError(
        reason as PrescriptionScanFailureReason,
        message || '辨識失敗，請重新拍攝',
      );
    }
  }
  return new PrescriptionScanError('service_unavailable', '辨識服務暫時無法使用，請稍後再試');
}

/**
 * 1. 查詢某位使用者的用藥提醒列表
 * 後端一次只吃一個 target_user_id；省略則回傳本人的提醒。
 */
export async function fetchReminders(targetUserId?: string): Promise<MedicationReminder[]> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  const res = await fetchWithAuth(`${BASE_URL}/api/medications/reminders${query}`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 2. 建立用藥提醒（一次可勾多個時段，後端每個時段建一筆）
 * 簡易模式帶 slot_times（缺席的時段套用後端的 DEFAULT_SLOT_TIMES）；
 * 詳細設定帶 slot_entries，兩者都給時以 slot_entries 為準。目標時段已有
 * 規則時後端回 409。
 */
export async function createReminders(
  req: CreateRemindersRequest,
): Promise<MedicationReminder[]> {
  const res = await fetchWithAuth(`${BASE_URL}/api/medications/reminders`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 3. 修改用藥提醒（時間、起訖日期、啟用狀態）
 */
export async function updateReminder(
  reminderId: string,
  req: UpdateReminderRequest,
): Promise<MedicationReminder> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(req),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 4. 刪除用藥提醒
 */
export async function deleteReminder(reminderId: string): Promise<{ ok: boolean }> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'DELETE',
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 5. 查詢某位用藥者的藥品清單（含已停用者，帶 enabled）
 * 詳細設定頁用它列出可指派到飯前／飯後的藥品；後端一次只吃一個 user_id，省略則回傳本人的藥品。
 */
export async function fetchMedications(targetUserId?: string): Promise<Medication[]> {
  const query = targetUserId ? `?user_id=${encodeURIComponent(targetUserId)}` : '';
  const res = await fetchWithAuth(`${BASE_URL}/api/medications${query}`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 6. 手動新增一種藥品（source 固定為 manual）
 */
export async function createMedication(req: CreateMedicationRequest): Promise<Medication> {
  const res = await fetchWithAuth(`${BASE_URL}/api/medications`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

// ── 藥袋辨識 ──────────────────────────────────────────────────────────

/**
 * 7. 上傳藥袋影像進行辨識，回傳待使用者核對的草稿。
 * 影像僅以 multipart 傳輸，欄位名稱需與後端 `file: UploadFile = File(...)` 一致。
 */
export async function scanPrescription(file: File): Promise<PrescriptionDraft> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchWithAuth(`${BASE_URL}/api/medications/prescription-scan`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw await parseScanError(res);
  return res.json();
}

/**
 * 8. 查詢先前掃描產生的草稿，供核對畫面重新載入時使用。
 */
export async function getPrescriptionDraft(draftId: string): Promise<PrescriptionDraft> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/medications/prescription-drafts/${encodeURIComponent(draftId)}`,
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 9. 使用者核對草稿後提交，依草稿內容建立藥品並關聯至對應時段的提醒。
 */
export async function commitPrescriptionDraft(
  draftId: string,
  req: CommitPrescriptionDraftRequest,
): Promise<PrescriptionCommitResult> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/medications/prescription-drafts/${encodeURIComponent(draftId)}/commit`,
    {
      method: 'POST',
      body: JSON.stringify(req),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 查詢看診紀錄。
 *
 * 這支端點整體是 SENSITIVE：後端不做部分遮蔽，沒有 SENSITIVE 讀取權者直接
 * 403（把機構名遮掉之後剩下的就是一串沒有意義的日期）。因此 MEMBER 角色
 * 呼叫這支會拿到 403，呼叫端要把它當成「沒有權限看」而不是「載入失敗」。
 */
export async function fetchVisits(targetUserId?: string): Promise<MedicationVisit[]> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  const res = await fetchWithAuth(`${BASE_URL}/api/medications/visits${query}`);
  if (res.status === 403) throw new VisitsForbiddenError();
  if (!res.ok) throw await parseError(res);
  const data = await res.json();
  return data.visits ?? [];
}

/** 無權查看看診紀錄。與一般載入失敗分開，畫面要給的訊息完全不同。 */
export class VisitsForbiddenError extends Error {
  constructor() {
    super('no permission to view visits');
    this.name = 'VisitsForbiddenError';
  }
}
