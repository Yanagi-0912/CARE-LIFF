import { fetchWithAuth } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const ROOT = `${BASE_URL}/api/admin/annotations`;

export type AnnotationTaskId = 'health' | 'claim-pairs';
export type AnnotationTask = {
  id: AnnotationTaskId;
  title: string;
  description: string;
  question_count: number;
  total_count: number;
};
export type AnnotationLabel = 0 | 1 | null;
export type AnnotationOrder = { id: string | number; retest: boolean };
export type AnnotationAnswer = AnnotationOrder & {
  label: AnnotationLabel;
  unsure: boolean;
  note: string;
  ms: number;
  at: string;
  edits: number;
};
export type AnnotationSession = {
  task: AnnotationTaskId;
  title: string;
  annotator: string;
  annotator_id: string;
  fingerprint: string;
  version: string;
  hash_key: 'dataset_sha256' | 'samples_sha256';
  pilot: number;
  items: Array<{ id: string | number; t?: string; u?: string; r?: string }>;
  order: AnnotationOrder[];
  started_at: string;
  revision: number;
  position: number;
  answers: Record<string, AnnotationAnswer>;
};

export class AnnotationApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${ROOT}${path}`, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = response.status === 403 ? '只有管理員可以使用標記頁面。'
      : typeof error?.detail === 'string' ? error.detail : '暫時無法儲存或載入，請再試一次。';
    throw new AnnotationApiError(message, response.status);
  }
  return response.json();
}

export const fetchAnnotationTasks = () => request<AnnotationTask[]>('');
export const fetchAnnotationSession = (task: AnnotationTaskId, signal?: AbortSignal) =>
  request<AnnotationSession>(`/${task}/session`, { signal });
export const saveAnnotation = (
  task: AnnotationTaskId,
  position: number,
  body: { fingerprint: string; revision: number; label: AnnotationLabel; unsure: boolean; note: string; ms: number },
) => request<{ revision: number; position: number; answer: AnnotationAnswer }>(
  `/${task}/answers/${position}`, { method: 'PUT', body: JSON.stringify(body) },
);
export const exportAnnotations = (task: AnnotationTaskId) => request<Record<string, unknown>>(`/${task}/export`);
