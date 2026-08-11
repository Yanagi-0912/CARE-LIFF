import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export type KnowledgeReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';
export type KnowledgeReportReason = 'outdated' | 'missing' | 'other';
export type KnowledgeReportSource = 'manual' | 'agent_tool' | 'web_fallback';
/** null 代表後端加入此欄位之前寫下的舊紀錄，視同已結束 */
export type IngestJobStatus = 'running' | 'succeeded' | 'failed';

export interface IngestJobResultDto {
  url: string;
  status: string;
  chunk_count: number;
  message: string;
}

export interface IngestJobDto {
  selected_urls: string[];
  results: IngestJobResultDto[];
  error?: string | null;
  status?: IngestJobStatus | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface KnowledgeReportDto {
  report_id: string;
  line_user_id: string;
  status: KnowledgeReportStatus;
  reason: KnowledgeReportReason;
  question: string;
  user_note?: string | null;
  user_source_urls: string[];
  resolution?: string | null;
  reviewer_note?: string | null;
  ingest_job?: IngestJobDto | null;
  /** null 代表 source 欄位加入前寫下的舊紀錄，視為非手動 */
  source?: KnowledgeReportSource | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeReportListResponse {
  reports: KnowledgeReportDto[];
  /** 以下分頁欄位僅 admin 待審列表會回傳 */
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
  /** 待審佇列各狀態的實際筆數，不受 status 篩選與分頁影響 */
  status_counts?: Record<string, number> | null;
}

async function parseError(res: Response): Promise<Error> {
  let message = `API 請求失敗：${res.status}`;
  try {
    const data = await res.json();
    if (data.detail) {
      if (typeof data.detail === 'string') {
        // 舊形狀：detail 本身就是給人看的字串，向後相容
        message = data.detail;
      } else if (
        typeof data.detail === 'object' &&
        !Array.isArray(data.detail) &&
        typeof data.detail.message === 'string'
      ) {
        // 新形狀（如 approve 的白名單檢查）：detail 是結構化物件，
        // 其中 message 才是給人看的中文說明，其餘欄位（code、invalid_urls…）
        // 是給表單逐一標紅用的機器可讀資訊，不該直接塞給使用者看
        message = data.detail.message;
      } else {
        // detail 是其他物件形狀（如陣列、或物件但沒有字串 message）：
        // 沒有已知的可讀欄位可取，保留 JSON.stringify 後備，
        // 讓至少看得到原始內容，而不是完全吞掉錯誤
        message = JSON.stringify(data.detail);
      }
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // ignore parse error
  }
  return new Error(message);
}

export async function fetchKnowledgeReports(): Promise<KnowledgeReportListResponse> {
  const res = await fetch(`${BASE_URL}/api/knowledge-reports`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export type CreateKnowledgeReportBody = {
  question: string;
  reason: KnowledgeReportReason;
  user_note: string;
  user_source_urls: string[];
};

export type InvalidUrl = {
  url: string;
  /** malformed：網址本身有問題；not_allowed：網域不在白名單。兩者的補救動作不同 */
  reason: 'malformed' | 'not_allowed';
};

export type KnowledgeReportErrorCode =
  | 'url_not_allowed'
  | 'quota_exceeded'
  | 'generic';

/**
 * 建立回報失敗時丟出的錯誤。
 *
 * 刻意不沿用 parseError：那會把後端的 message 直接顯示，而後端文案只有
 * zh-TW／en 兩語（見 app/i18n/messages.py 的註記）。表單依 code 與逐筆
 * reason 自己組六語文案，才能讓越南語使用者看到越南語。
 */
export class KnowledgeReportRequestError extends Error {
  code: KnowledgeReportErrorCode;
  invalidUrls: InvalidUrl[];
  limit?: number;

  constructor(code: KnowledgeReportErrorCode, invalidUrls: InvalidUrl[] = [], limit?: number) {
    super(code);
    this.name = 'KnowledgeReportRequestError';
    this.code = code;
    this.invalidUrls = invalidUrls;
    this.limit = limit;
  }
}

async function parseCreateError(res: Response): Promise<KnowledgeReportRequestError> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      if (detail.code === 'url_not_allowed') {
        const invalid = Array.isArray(detail.invalid_urls) ? detail.invalid_urls : [];
        return new KnowledgeReportRequestError('url_not_allowed', invalid);
      }
      if (detail.code === 'quota_exceeded') {
        return new KnowledgeReportRequestError('quota_exceeded', [], detail.limit);
      }
    }
  } catch {
    // 落到 generic
  }
  return new KnowledgeReportRequestError('generic');
}

export async function createKnowledgeReport(
  body: CreateKnowledgeReportBody,
): Promise<{ report_id: string }> {
  const res = await fetch(`${BASE_URL}/api/knowledge-reports`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseCreateError(res);
  return res.json();
}

export type AdminKnowledgeReportQuery = {
  status?: KnowledgeReportStatus;
  limit?: number;
  offset?: number;
};

export async function fetchAdminKnowledgeReports(
  query: AdminKnowledgeReportQuery = {},
): Promise<KnowledgeReportListResponse> {
  const url = new URL(`${BASE_URL}/api/admin/knowledge-reports`);
  if (query.status) {
    url.searchParams.set('status', query.status);
  }
  if (query.limit !== undefined) {
    url.searchParams.set('limit', String(query.limit));
  }
  if (query.offset !== undefined) {
    url.searchParams.set('offset', String(query.offset));
  }
  const res = await fetch(url.toString(), {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export type ApproveKnowledgeReportBody = {
  selected_urls?: string[];
  resolution?: string;
  reviewer_note?: string;
};

export async function approveKnowledgeReport(
  reportId: string,
  body?: ApproveKnowledgeReportBody,
): Promise<KnowledgeReportDto> {
  const res = await fetch(
    `${BASE_URL}/api/admin/knowledge-reports/${encodeURIComponent(reportId)}/approve`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export type RejectKnowledgeReportBody = {
  reviewer_note?: string;
  resolution?: string;
};

export async function rejectKnowledgeReport(
  reportId: string,
  body?: RejectKnowledgeReportBody,
): Promise<KnowledgeReportDto> {
  const res = await fetch(
    `${BASE_URL}/api/admin/knowledge-reports/${encodeURIComponent(reportId)}/reject`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}
