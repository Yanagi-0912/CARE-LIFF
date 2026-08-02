import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export type KnowledgeReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';
export type KnowledgeReportReason = 'outdated' | 'missing' | 'other';

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
  created_at: string;
  updated_at: string;
}

export interface KnowledgeReportListResponse {
  reports: KnowledgeReportDto[];
}

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

export async function fetchKnowledgeReports(): Promise<KnowledgeReportListResponse> {
  const res = await fetch(`${BASE_URL}/api/knowledge-reports`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
