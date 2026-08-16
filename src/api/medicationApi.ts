import type {
  CreateRemindersRequest,
  MedicationReminder,
  UpdateReminderRequest,
} from '../types/medication';
import type {
  CommitPrescriptionDraftRequest,
  PrescriptionCommitResult,
  PrescriptionDraft,
  PrescriptionScanFailureReason,
} from '../types/prescription';
import { authHeaders } from '../utils/auth';

// 匯出供 utils/drugAppearanceImage.ts 共用同一個後端網域——藥丸縮圖的對外
// 靜態路徑掛在同一個後端（PUBLIC_BASE_URL 與這裡的 API 網域是同一台主機），
// 不應該各自維護一份預設值，否則兩處環境變數沒同步設定時會悄悄失聯。
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/**
 * 輔助函式：解析錯誤訊息
 */
async function parseError(res: Response): Promise<Error> {
  let message = `API 請求失敗：${res.status}`;
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

/** 帶認證的 multipart 上傳標頭。authHeaders() 固定帶 application/json，
 *  瀏覽器組 multipart body 時要自己補 boundary，Content-Type 不能沿用。 */
function multipartAuthHeaders(): HeadersInit {
  const headers = { ...(authHeaders() as Record<string, string>) };
  delete headers['Content-Type'];
  return headers;
}

/**
 * 1. 查詢某位使用者的用藥提醒列表
 * 後端一次只吃一個 target_user_id；省略則回傳本人的提醒。
 */
export async function fetchReminders(targetUserId?: string): Promise<MedicationReminder[]> {
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  const res = await fetch(`${BASE_URL}/api/medications/reminders${query}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 2. 建立用藥提醒（一次可勾多個時段，後端每個時段建一筆）
 * 時間由後端套用 DEFAULT_SLOT_TIMES，此 API 不接受 scheduled_time。
 */
export async function createReminders(
  req: CreateRemindersRequest,
): Promise<MedicationReminder[]> {
  const res = await fetch(`${BASE_URL}/api/medications/reminders`, {
    method: 'POST',
    headers: authHeaders(),
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
  const res = await fetch(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'PUT',
      headers: authHeaders(),
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
  const res = await fetch(
    `${BASE_URL}/api/medications/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

// ── 藥袋辨識 ──────────────────────────────────────────────────────────

/**
 * 5. 上傳藥袋影像進行辨識，回傳待使用者核對的草稿。
 * 影像僅以 multipart 傳輸，欄位名稱需與後端 `file: UploadFile = File(...)` 一致。
 */
export async function scanPrescription(file: File): Promise<PrescriptionDraft> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/api/medications/prescription-scan`, {
    method: 'POST',
    headers: multipartAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw await parseScanError(res);
  return res.json();
}

/**
 * 6. 查詢先前掃描產生的草稿，供核對畫面重新載入時使用。
 */
export async function getPrescriptionDraft(draftId: string): Promise<PrescriptionDraft> {
  const res = await fetch(
    `${BASE_URL}/api/medications/prescription-drafts/${encodeURIComponent(draftId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 7. 使用者核對草稿後提交，依草稿內容建立藥品並關聯至對應時段的提醒。
 */
export async function commitPrescriptionDraft(
  draftId: string,
  req: CommitPrescriptionDraftRequest,
): Promise<PrescriptionCommitResult> {
  const res = await fetch(
    `${BASE_URL}/api/medications/prescription-drafts/${encodeURIComponent(draftId)}/commit`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(req),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}
