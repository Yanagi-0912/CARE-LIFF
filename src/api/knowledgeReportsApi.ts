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

export type ContentPreviewStatus = 'running' | 'ready' | 'failed';
export type ContentPreviewItemStatus = 'ok' | 'empty' | 'error';

export interface ContentPreviewItemDto {
  url: string;
  status: ContentPreviewItemStatus;
  title: string;
  /** 抓到的原文；超過長度上限時會被截斷，此時 truncated 為 true */
  content: string;
  /** sha256(全文)；核准時要原樣回送，伺服器據此確認你看的就是它要收的 */
  content_hash: string;
  /** 截斷前的真實字元數 */
  char_count: number;
  truncated: boolean;
  message: string;
}

export interface ContentPreviewDto {
  preview_id: string;
  report_id: string;
  status: ContentPreviewStatus;
  /**
   * 本次預覽涵蓋的 URL，已由後端正規化（補 scheme、去追蹤參數、主機名轉小寫）。
   *
   * 送出的字串與這裡回來的可能不同，而之後每個環節——快照的鍵、核准的
   * selected_urls、向量庫的 url——都必須是同一份字串，所以呼叫端要以這個欄位
   * 為準去更新自己的選取清單。
   *
   * 不能用 `items[].url` 代替：`status` 為 `running` 時 `items` 還是空的，
   * 此時這個欄位是唯一能說明「正在抓哪幾個」的資訊。
   * 對應後端 `app/models/knowledge_report.py` 的 `ContentPreview.urls`。
   */
  urls: string[];
  items: ContentPreviewItemDto[];
  created_at: string;
  expires_at: string;
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

/**
 * 帶上機器可讀資訊的 API 錯誤。
 *
 * 呈現層要分辨「預覽逾期／被取代／雜湊不符」與一般操作失敗——前者要給重新
 * 抓取的出口，後者只要顯示訊息。只丟 Error 的話 code 在 parseError 就被丟掉了。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** 預覽失效的錯誤碼；這幾種要引導 admin 重新抓取，而不是當成一般失敗 */
const STALE_PREVIEW_CODES = [
  'preview_missing',
  'preview_expired',
  'preview_superseded',
  'preview_url_missing',
  'preview_hash_mismatch',
] as const;

export function isStalePreviewError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    STALE_PREVIEW_CODES.includes(error.code as (typeof STALE_PREVIEW_CODES)[number])
  );
}

async function parseError(res: Response): Promise<Error> {
  let message = `API 請求失敗：${res.status}`;
  let code: string | undefined;
  try {
    const data = await res.json();
    if (data.detail) {
      if (typeof data.detail === 'object' && !Array.isArray(data.detail)) {
        code = typeof data.detail.code === 'string' ? data.detail.code : undefined;
      }
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
  return new ApiError(message, res.status, code);
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

export type StartContentPreviewBody = {
  urls?: string[];
  /** true 時忽略 TTL 內的既有預覽，強制重抓並取得新的 preview_id */
  force?: boolean;
};

/** 啟動內容預覽。後端立即回 202，實際抓取在背景進行，之後靠 GET 輪詢。 */
export async function startKnowledgeReportPreview(
  reportId: string,
  body?: StartContentPreviewBody,
): Promise<ContentPreviewDto> {
  const res = await fetch(
    `${BASE_URL}/api/admin/knowledge-reports/${encodeURIComponent(reportId)}/preview`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** 取回內容預覽；尚未建立或已逾期時後端回 404，這裡轉成 null。 */
export async function fetchKnowledgeReportPreview(
  reportId: string,
): Promise<ContentPreviewDto | null> {
  const res = await fetch(
    `${BASE_URL}/api/admin/knowledge-reports/${encodeURIComponent(reportId)}/preview`,
    { headers: authHeaders() },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export type ApproveKnowledgeReportBody = {
  selected_urls?: string[];
  resolution?: string;
  reviewer_note?: string;
  /** 核准所依據的預覽；沒帶會被後端以 409 拒絕 */
  preview_id?: string;
  /** url → 呼叫端實際看過的內容雜湊 */
  content_hashes?: Record<string, string>;
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
