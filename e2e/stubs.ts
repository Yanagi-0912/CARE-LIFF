import type { Page } from '@playwright/test';

import { CORS_HEADERS, LINE_USER_ID, jsonResponse } from './fixtures';

/**
 * 各功能頁共用的後端 stub 與假資料。
 *
 * fixtures.ts 只管「地基」（假登入、兜底 404、profile）。這裡放的是各頁的
 * 資料形狀——形狀一律對齊 src/types 與 src/api 的 DTO，欄位名稱用 snake_case，
 * 跟真後端一模一樣，否則測試會在「前端把 DTO 轉成畫面」這一段留下盲區。
 *
 * 所有 stub 都回傳它收到的請求清單（ApiCall[]），讓測試能斷言「送了什麼給後端」，
 * 而不只是「畫面看起來對」。
 */

export type ApiCall = { method: string; url: URL; body: unknown };

type PathMatcher = string | RegExp | ((pathname: string) => boolean);

interface StubOptions {
  path: PathMatcher;
  /** 不指定就吃所有方法；指定時其他方法會 fallback 給先前註冊的 stub */
  method?: string;
  status?: number;
  body?: unknown;
  /** 延遲回應（毫秒），用來觀察 loading 狀態 */
  delayMs?: number;
  /** 依請求內容決定回應；比 status/body 優先 */
  respond?: (call: ApiCall) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
  /** 模擬網路層失敗（route.abort），fetch 會丟 TypeError: Failed to fetch */
  abort?: boolean;
}

function matchPath(matcher: PathMatcher, pathname: string): boolean {
  if (typeof matcher === 'string') return pathname === matcher;
  if (matcher instanceof RegExp) return matcher.test(pathname);
  return matcher(pathname);
}

export async function stubApi(page: Page, options: StubOptions): Promise<ApiCall[]> {
  const calls: ApiCall[] = [];

  await page.route(
    (url) => matchPath(options.path, url.pathname),
    async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      if (options.method && request.method() !== options.method) {
        await route.fallback();
        return;
      }

      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      const call: ApiCall = { method: request.method(), url: new URL(request.url()), body };
      calls.push(call);

      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      if (options.abort) {
        await route.abort('failed');
        return;
      }

      const response = options.respond
        ? await options.respond(call)
        : { status: options.status ?? 200, body: options.body ?? {} };
      await route.fulfill(jsonResponse(response.status, response.body ?? {}));
    },
  );

  return calls;
}

/* ───────────── 家庭 ───────────── */

/** 後端回的「實際生效」權限。前端一律 fail-closed：沒帶就當沒有權限。 */
export const FULL_PERMISSIONS = {
  general: ['READ', 'WRITE'],
  sensitive: ['READ', 'WRITE'],
  private: ['READ'],
} as const;
export const GENERAL_ONLY_PERMISSIONS = {
  general: ['READ'],
  sensitive: [],
  private: [],
} as const;
export const NO_PERMISSIONS = { general: [], sensitive: [], private: [] } as const;

export const FAMILY_MEMBERS = [
  {
    user_id: 'Ufamily00000000000000000000000001',
    relationship_type: 'parent',
    display_name: '林阿嬤',
    picture_url: undefined,
    family_role: 'GUARDIAN',
    my_role: 'GUARDIAN',
    my_permissions: FULL_PERMISSIONS,
  },
  {
    user_id: 'Ufamily00000000000000000000000002',
    relationship_type: null,
    display_name: '王小明',
    family_role: null,
    my_role: 'MEMBER',
    my_permissions: GENERAL_ONLY_PERMISSIONS,
  },
] as const;

export function familyTreeBody(
  members: readonly unknown[],
  roleAssignment: unknown = null,
) {
  return {
    family_tree: {
      user_id: LINE_USER_ID,
      family_members: members,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    role_assignment: roleAssignment,
  };
}

export function stubFamily(
  page: Page,
  members: readonly unknown[] = [],
  options: Omit<StubOptions, 'path' | 'body'> = {},
) {
  return stubApi(page, {
    path: '/api/family/me',
    body: familyTreeBody(members),
    ...options,
  });
}

/* ───────────── 用藥提醒 ───────────── */

export type ReminderDto = {
  id: string;
  creator_user_id: string;
  user_id: string;
  slot_type: 'morning' | 'noon' | 'evening' | 'bedtime';
  scheduled_time: string;
  start_date: string;
  end_date: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  medications?: unknown[];
};

export function reminder(overrides: Partial<ReminderDto> & Pick<ReminderDto, 'id' | 'slot_type'>): ReminderDto {
  return {
    creator_user_id: LINE_USER_ID,
    user_id: LINE_USER_ID,
    scheduled_time: '08:00',
    start_date: '2026-09-01',
    end_date: null,
    enabled: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

export function medication(overrides: Partial<Record<string, unknown>> & { id: string; name: string }) {
  return {
    user_id: LINE_USER_ID,
    created_by_user_id: LINE_USER_ID,
    generic_name: null,
    license_number: null,
    shape: '',
    color: '',
    score_line: '',
    mark_one: '',
    mark_two: '',
    size: '',
    thumbnail_url: null,
    unit_content: null,
    total_quantity: null,
    usage_raw: null,
    frequency_code: 'QD',
    indication: null,
    source: 'manual',
    start_date: '2026-09-01',
    end_date: null,
    enabled: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

/** GET /api/medications/reminders；回傳的清單可由 respond 動態決定 */
export function stubReminderList(
  page: Page,
  list: ReminderDto[] | ((call: ApiCall) => ReminderDto[]),
  options: Omit<StubOptions, 'path' | 'body' | 'method'> = {},
) {
  return stubApi(page, {
    path: '/api/medications/reminders',
    method: 'GET',
    respond: (call) => ({ status: 200, body: typeof list === 'function' ? list(call) : list }),
    ...options,
  });
}

/* ───────────── 使用者設定 ───────────── */

export const DEFAULT_API_SETTINGS = {
  language: null as string | null,
  font_size: 'large' as 'normal' | 'large' | 'xlarge',
  high_contrast: true,
  notify_reminder: true,
  notify_family: true,
  notify_medical_news: true,
  voice_reply_enabled: false,
  voice_rate: 'normal' as 'slow' | 'normal' | 'fast',
  voice_gender: 'female' as 'female' | 'male',
};

/**
 * GET／PATCH /api/profiles/me/settings。
 * prescription_scan_enabled 是全域功能旗標，跟著同一支端點回傳（見 settingsApi）。
 */
export async function stubSettings(
  page: Page,
  overrides: Partial<typeof DEFAULT_API_SETTINGS> = {},
  options: { prescriptionScanEnabled?: boolean; status?: number } = {},
) {
  const state = { ...DEFAULT_API_SETTINGS, ...overrides };
  const body = () => ({
    user_id: LINE_USER_ID,
    settings: state,
    prescription_scan_enabled: options.prescriptionScanEnabled ?? false,
  });

  const gets = await stubApi(page, {
    path: '/api/profiles/me/settings',
    method: 'GET',
    respond: () =>
      options.status && options.status >= 400
        ? { status: options.status, body: { detail: 'e2e: settings failed' } }
        : { status: 200, body: body() },
  });
  const patches = await stubApi(page, {
    path: '/api/profiles/me/settings',
    method: 'PATCH',
    respond: (call) => {
      Object.assign(state, call.body as object);
      return { status: 200, body: body() };
    },
  });
  return { gets, patches };
}

/* ───────────── 知識回報 ───────────── */

export type KnowledgeReportDto = {
  report_id: string;
  line_user_id: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected';
  reason: 'outdated' | 'missing' | 'other';
  question: string;
  user_note?: string | null;
  user_source_urls: string[];
  resolution?: string | null;
  reviewer_note?: string | null;
  ingest_job?: unknown | null;
  source?: 'manual' | 'agent_tool' | 'web_fallback' | null;
  created_at: string;
  updated_at: string;
};

export function knowledgeReport(
  overrides: Partial<KnowledgeReportDto> & Pick<KnowledgeReportDto, 'report_id' | 'question'>,
): KnowledgeReportDto {
  return {
    line_user_id: LINE_USER_ID,
    status: 'pending',
    reason: 'outdated',
    user_note: null,
    user_source_urls: [],
    resolution: null,
    reviewer_note: null,
    ingest_job: null,
    source: 'manual',
    created_at: '2026-09-01T08:00:00Z',
    updated_at: '2026-09-01T08:00:00Z',
    ...overrides,
  };
}

export const KNOWLEDGE_REPORTS: KnowledgeReportDto[] = [
  knowledgeReport({
    report_id: 'rpt-oldest',
    question: '流感疫苗今年幾月開打？',
    status: 'resolved',
    reason: 'outdated',
    reviewer_note: '已更新為 2026 年公告',
    resolution: '知識庫已更新',
    created_at: '2026-08-01T08:00:00Z',
  }),
  knowledgeReport({
    report_id: 'rpt-middle',
    question: '高血壓可以喝咖啡嗎？',
    status: 'reviewing',
    reason: 'missing',
    user_note: '找不到相關資料',
    user_source_urls: ['https://www.hpa.gov.tw/coffee'],
    created_at: '2026-08-15T08:00:00Z',
  }),
  knowledgeReport({
    report_id: 'rpt-newest',
    question: '糖尿病患者的飲食建議',
    status: 'pending',
    reason: 'other',
    created_at: '2026-09-01T08:00:00Z',
  }),
];

export function stubKnowledgeReports(
  page: Page,
  reports: KnowledgeReportDto[] | ((call: ApiCall) => KnowledgeReportDto[]),
  options: Omit<StubOptions, 'path' | 'body' | 'method'> = {},
) {
  return stubApi(page, {
    path: '/api/knowledge-reports',
    method: 'GET',
    respond: (call) => ({
      status: 200,
      body: {
        reports: typeof reports === 'function' ? reports(call) : reports,
        total: null,
        limit: null,
        offset: null,
        status_counts: null,
      },
    }),
    ...options,
  });
}

/* ───────────── 諮詢紀錄 ───────────── */

export const SUMMARIES = [
  {
    line_id: LINE_USER_ID,
    summary_date: '2026-09-02',
    summary: JSON.stringify({ 主訴: '最近常頭暈', 建議: ['多喝水', '量血壓'] }),
  },
  {
    line_id: LINE_USER_ID,
    summary_date: '2026-08-20',
    summary: JSON.stringify({ 主訴: '睡不好', 建議: '睡前少滑手機' }),
  },
];

export const RAW_MESSAGES = [
  { message_type: 'text', content: '我最近常常頭暈，該怎麼辦？' },
  { message_type: 'ai_response', content: '建議先量血壓，若持續請就醫。' },
];

export async function stubConsultations(
  page: Page,
  data: {
    summaries?: unknown[] | { status: number; detail?: string };
    raw?: unknown[] | { status: number };
    owner?: string;
    delayMs?: number;
  } = {},
) {
  const owner = data.owner ?? 'me';
  const summaries = data.summaries ?? [];
  const raw = data.raw ?? [];

  const summaryCalls = await stubApi(page, {
    path: `/api/consultations/${owner}/allsummaries`,
    delayMs: data.delayMs,
    respond: () =>
      Array.isArray(summaries)
        ? { status: 200, body: summaries }
        : { status: summaries.status, body: { detail: summaries.detail ?? 'e2e' } },
  });
  const rawCalls = await stubApi(page, {
    path: `/api/consultations/${owner}/messages/raw`,
    delayMs: data.delayMs,
    respond: () =>
      Array.isArray(raw)
        ? { status: 200, body: { line_id: LINE_USER_ID, view_type: 'raw', messages: raw } }
        : { status: raw.status, body: { detail: 'e2e' } },
  });
  return { summaryCalls, rawCalls };
}

/* ───────────── 附近醫院 ───────────── */

const OPEN_STATUS = { status: 'open', next_open: null, note: null, has_emergency: false };

export const FACILITIES = [
  {
    id: 'f1',
    name: '象山中醫診所',
    latitude: 25.0297,
    longitude: 121.5603,
    address: '臺北市信義區吳興街 118 號',
    phone: '(02)27201234',
    type: '中醫診所',
    distance_meters: 99,
    departments: ['中醫一般科'],
    business_status: OPEN_STATUS,
  },
  {
    id: 'f2',
    name: '臺北醫學大學附設醫院',
    latitude: 25.0255,
    longitude: 121.5613,
    address: '臺北市信義區吳興街 252 號',
    phone: null,
    type: '醫學中心',
    distance_meters: 1234,
    departments: ['內科', '外科', '急診醫學科'],
    business_status: { status: 'break', next_open: { weekday_key: 'monday', time_text: '14:00', is_today: true }, note: null, has_emergency: true },
  },
];

/** NearbyHospitalsResponse 的完整形狀；預設是「第一級 5 公里內就湊滿」的最單純情形 */
export function nearbyResponse(
  facilities: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    facilities,
    count: facilities.length,
    reached_meters: 5000,
    satisfied: facilities.length > 0,
    expanded: false,
    furthest_meters: facilities.length > 0 ? 1234 : null,
    max_meters: 50000,
    open_now_requested: false,
    open_now_fallback: false,
    department: null,
    facility_type: null,
    unresolved_department: null,
    unresolved_facility_type: null,
    pharmacy_data_gap_meters: null,
    ...overrides,
  };
}

export function stubNearby(
  page: Page,
  response: ReturnType<typeof nearbyResponse> | { status: number },
  options: Omit<StubOptions, 'path' | 'body' | 'respond'> = {},
) {
  return stubApi(page, {
    path: '/api/medical/nearby',
    respond: () =>
      'facilities' in response
        ? { status: 200, body: response }
        : { status: response.status, body: { detail: 'e2e' } },
    ...options,
  });
}

/** GET /api/medical/facilities（依名稱查詢） */
export function stubFacilitySearch(
  page: Page,
  response: { facilities: unknown[]; total_count?: number } | { status: number },
) {
  return stubApi(page, {
    path: '/api/medical/facilities',
    respond: () =>
      'facilities' in response
        ? {
            status: 200,
            body: {
              facilities: response.facilities,
              count: response.facilities.length,
              total_count: response.total_count ?? response.facilities.length,
            },
          }
        : { status: response.status, body: { detail: 'e2e' } },
  });
}

/* ───────────── 共用：console 錯誤收集 ───────────── */

export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}
