import { fetchWithAuth } from '@/utils/auth';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const taskPath = '/api/long-term-care/tasks';

export const careTopics = ['discharge', 'home_care', 'equipment', 'respite'] as const;
export type CareTopic = typeof careTopics[number];
export type CareStatus = 'assigned' | 'accepted' | 'contacted' | 'done' | 'cancelled';
export type CareStatusUpdate = Exclude<CareStatus, 'assigned'>;

export interface CareTask {
  id: string;
  creator_id: string;
  topic: CareTopic;
  assignee_id: string;
  remind_at: string | null;
  status: CareStatus;
  updated_at: string;
}

export interface CareAssignee {
  id: string;
  name: string | null;
}

export interface NewCareTask {
  id: string;
  topic: CareTopic;
  assignee_id: string;
  remind_at: string | null;
}

export class CareTaskApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Care task request failed (${status})`);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${baseUrl}${path}`, init);
  if (!response.ok) throw new CareTaskApiError(response.status);
  return response.json() as Promise<T>;
}

function scopedPath(target: string | undefined) {
  return target ? `${taskPath}?target_user_id=${encodeURIComponent(target)}` : taskPath;
}

export function fetchCareTasks(target: string | undefined) {
  return request<{ tasks: CareTask[]; assignees: CareAssignee[] }>(scopedPath(target));
}

export function createCareTask(target: string | undefined, task: NewCareTask) {
  return request<CareTask>(scopedPath(target), { method: 'POST', body: JSON.stringify(task) });
}

export function updateCareTask(id: string, status: CareStatusUpdate) {
  return request<CareTask>(`${taskPath}/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}

export async function fetchCareTaskTarget(id: string) {
  const result = await request<{ target_user_id: string }>(
    `${taskPath}/${encodeURIComponent(id)}/target`,
  );
  return result.target_user_id;
}
