import { expect, type Page, type Route, test } from '@playwright/test';

const API_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,ngrok-skip-browser-warning',
};

/** 對齊 types/medication.ts 的 DEFAULT_SLOT_TIMES，stub 端建立提醒時套用同一份預設值 */
const DEFAULT_SLOT_TIMES: Record<string, string> = {
  morning: '08:00',
  noon: '12:00',
  evening: '18:00',
  bedtime: '21:30',
};

interface StubEntry {
  meal_timing: 'before_meal' | 'after_meal' | 'none';
  scheduled_time: string;
  medication_ids: string[];
}

interface StubMedication {
  id: string;
  user_id: string;
  created_by_user_id: string;
  name: string;
  generic_name: null;
  license_number: null;
  shape: '';
  color: '';
  score_line: '';
  mark_one: '';
  mark_two: '';
  size: '';
  thumbnail_url: null;
  unit_content: null;
  total_quantity: null;
  usage_raw: null;
  frequency_code: 'OTHER';
  indication: null;
  spc_indication: null;
  spc_indication_summary: null;
  source: 'manual';
  start_date: string;
  end_date: null;
  enabled: true;
  created_at: string;
  updated_at: string;
}

interface StubReminder {
  id: string;
  creator_user_id: string;
  user_id: string;
  slot_type: string;
  scheduled_time: string;
  timeout_anchor_time: string;
  entries: StubEntry[];
  start_date: string;
  end_date: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  medications: StubMedication[];
}

function makeMedication(id: string, name: string): StubMedication {
  return {
    id,
    user_id: 'U-self',
    created_by_user_id: 'U-self',
    name,
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
    frequency_code: 'OTHER',
    indication: null,
    spc_indication: null,
    spc_indication_summary: null,
    source: 'manual',
    start_date: '2026-01-01',
    end_date: null,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

/** entries 的最早／最晚時刻，比照後端 scheduled_time／timeout_anchor_time 的派生規則 */
function deriveTimes(entries: StubEntry[]): { scheduled_time: string; timeout_anchor_time: string } {
  const times = entries.map((entry) => entry.scheduled_time).sort();
  return { scheduled_time: times[0], timeout_anchor_time: times[times.length - 1] };
}

function unionIds(entries: StubEntry[]): string[] {
  return Array.from(new Set(entries.flatMap((entry) => entry.medication_ids)));
}

interface StubState {
  reminders: StubReminder[];
  medications: StubMedication[];
  reminderSeq: number;
  medSeq: number;
}

interface Captured {
  lastReminderPost?: {
    user_id: string;
    slots: string[];
    slot_times?: Record<string, string>;
    slot_entries?: Record<string, StubEntry[]>;
    start_date?: string;
    end_date?: string;
  };
  lastReminderPut?: { entries?: StubEntry[] };
}

function resolveMedications(state: StubState, ids: string[]): StubMedication[] {
  return state.medications.filter((med) => ids.includes(med.id));
}

async function handleMedicationsRoute(
  route: Route,
  state: StubState,
  captured: Captured,
): Promise<void> {
  const request = route.request();
  const method = request.method();
  const url = new URL(request.url());
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: API_HEADERS });
    return;
  }

  // GET/POST /api/medications/reminders
  if (pathname.endsWith('/api/medications/reminders')) {
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(state.reminders),
      });
      return;
    }
    if (method === 'POST') {
      const body = request.postDataJSON() as Captured['lastReminderPost'];
      captured.lastReminderPost = body;
      const created: StubReminder[] = [];
      for (const slot of body?.slots ?? []) {
        const entries: StubEntry[] = body?.slot_entries?.[slot] ?? [
          {
            meal_timing: 'none',
            scheduled_time: body?.slot_times?.[slot] ?? DEFAULT_SLOT_TIMES[slot],
            medication_ids: [],
          },
        ];
        const { scheduled_time, timeout_anchor_time } = deriveTimes(entries);
        const reminder: StubReminder = {
          id: `r-${state.reminderSeq++}`,
          creator_user_id: body!.user_id,
          user_id: body!.user_id,
          slot_type: slot,
          scheduled_time,
          timeout_anchor_time,
          entries,
          start_date: body?.start_date ?? '2026-01-01',
          end_date: body?.end_date ?? null,
          enabled: true,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          medications: resolveMedications(state, unionIds(entries)),
        };
        state.reminders.push(reminder);
        created.push(reminder);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(created),
      });
      return;
    }
  }

  // PUT/DELETE /api/medications/reminders/{id}
  const reminderMatch = pathname.match(/\/api\/medications\/reminders\/([^/]+)$/);
  if (reminderMatch) {
    const id = reminderMatch[1];
    const reminder = state.reminders.find((item) => item.id === id);
    if (!reminder) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify({ detail: 'not found' }),
      });
      return;
    }
    if (method === 'PUT') {
      const body = request.postDataJSON() as { entries?: StubEntry[]; enabled?: boolean };
      captured.lastReminderPut = body;
      if (body.entries) {
        reminder.entries = body.entries;
        const { scheduled_time, timeout_anchor_time } = deriveTimes(body.entries);
        reminder.scheduled_time = scheduled_time;
        reminder.timeout_anchor_time = timeout_anchor_time;
        reminder.medications = resolveMedications(state, unionIds(body.entries));
      }
      if (typeof body.enabled === 'boolean') reminder.enabled = body.enabled;
      reminder.updated_at = '2026-01-02T00:00:00.000Z';
      // 真實後端的 PUT 回應不含 medications（見 useMedications.ts 的說明）
      const withoutMedications: Record<string, unknown> = { ...reminder };
      delete withoutMedications.medications;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(withoutMedications),
      });
      return;
    }
    if (method === 'DELETE') {
      state.reminders = state.reminders.filter((item) => item.id !== id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
  }

  // GET/POST /api/medications
  if (pathname.endsWith('/api/medications')) {
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(state.medications),
      });
      return;
    }
    if (method === 'POST') {
      const body = request.postDataJSON() as { user_id: string; name: string };
      const created = makeMedication(`m-manual-${state.medSeq++}`, body.name);
      created.user_id = body.user_id;
      created.created_by_user_id = body.user_id;
      state.medications.push(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(created),
      });
      return;
    }
  }

  await route.fulfill({ status: 404, headers: API_HEADERS, body: JSON.stringify({ detail: 'unhandled' }) });
}

async function setupMedicationsPage(page: Page): Promise<{ state: StubState; captured: Captured }> {
  const state: StubState = {
    reminders: [],
    medications: [makeMedication('m-a', '降血糖藥'), makeMedication('m-b', '血壓藥')],
    reminderSeq: 1,
    medSeq: 1,
  };
  const captured: Captured = {};

  await page.route('**/api/medications**', (route) => handleMedicationsRoute(route, state, captured));

  await page.route('**/api/family/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: API_HEADERS });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({
        family_tree: {
          user_id: 'U-self',
          family_members: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        role_assignment: null,
      }),
    });
  });

  await page.route('**/api/profiles/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: API_HEADERS });
      return;
    }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/api/profiles/me/settings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify({
          settings: {
            language: 'zh-TW',
            font_size: 'normal',
            high_contrast: false,
            notify_reminder: true,
            notify_family: true,
            notify_medical_news: false,
            voice_reply_enabled: false,
            voice_rate: 'normal',
            voice_gender: 'female',
          },
          prescription_scan_enabled: false,
        }),
      });
      return;
    }
    // /api/profiles/me：側欄用來判斷管理員身分，找不到就 404，行為與 personalhealth.spec 一致
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({ detail: 'Not found' }),
    });
  });

  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'mock-jwt-token-12345');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
  });
  await page.goto('/medications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '用藥提醒' })).toBeVisible({ timeout: 15000 });

  return { state, captured };
}

test.describe('用藥提醒 飯前飯後', () => {
  test('新增表單可改時間', async ({ page }) => {
    const { captured } = await setupMedicationsPage(page);

    await page.getByRole('button', { name: '新增', exact: true }).click();
    // Base UI 的 Checkbox 是 role=checkbox 的自訂元件，不是原生 input[type=checkbox]，
    // 用 click 切換勾選狀態（比照 switch/toggle 的互動方式）
    await page.getByRole('checkbox', { name: /早/ }).click();

    const timeInput = page.getByLabel('早提醒時間');
    await expect(timeInput).toHaveValue('08:00', { timeout: 15000 });
    await timeInput.fill('07:30');

    await page.getByRole('button', { name: '建立提醒' }).click();

    await expect(page.getByText('已建立 1 筆用藥提醒')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('07:30', { exact: true })).toBeVisible({ timeout: 15000 });

    expect(captured.lastReminderPost?.slot_times?.morning).toBe('07:30');
  });

  test('詳細設定建立飯前飯後', async ({ page }) => {
    const { captured } = await setupMedicationsPage(page);

    await page.getByRole('button', { name: '新增', exact: true }).click();
    await page.getByRole('button', { name: '詳細設定' }).click();
    await page.getByRole('button', { name: /^早/ }).click();

    await expect(page.getByText('降血糖藥')).toBeVisible({ timeout: 15000 });

    await page.getByRole('switch', { name: '飯前' }).click();
    await page.getByLabel('飯前時間').fill('07:30');

    await page.getByRole('switch', { name: '飯後' }).click();
    await page.getByLabel('飯後時間').fill('08:30');

    const beforeMed = page.getByRole('listitem').filter({ hasText: '降血糖藥' });
    await beforeMed.getByRole('button', { name: '放到飯前' }).click();

    const afterMed = page.getByRole('listitem').filter({ hasText: '血壓藥' });
    await afterMed.getByRole('button', { name: '放到飯後' }).click();

    await page.getByRole('button', { name: '儲存' }).click();
    await expect(page.getByText('已儲存用藥提醒')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: '返回' }).click();

    const beforeRow = page.getByRole('listitem').filter({ hasText: '飯前' });
    await expect(beforeRow).toContainText('07:30', { timeout: 15000 });
    await expect(beforeRow).toContainText('降血糖藥');

    const afterRow = page.getByRole('listitem').filter({ hasText: '飯後' });
    await expect(afterRow).toContainText('08:30');
    await expect(afterRow).toContainText('血壓藥');

    expect(captured.lastReminderPost?.slot_entries?.morning).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
    ]);
  });

  test('手動新增藥品後可指派', async ({ page }) => {
    await setupMedicationsPage(page);

    await page.getByRole('button', { name: '新增', exact: true }).click();
    await page.getByRole('button', { name: '詳細設定' }).click();
    await page.getByRole('button', { name: /^早/ }).click();

    await expect(page.getByText('降血糖藥')).toBeVisible({ timeout: 15000 });

    await page.getByLabel('藥品名稱').fill('胃藥');
    await page.getByRole('button', { name: '新增藥品' }).click();

    const newMedRow = page.getByRole('listitem').filter({ hasText: '胃藥' });
    await expect(newMedRow).toBeVisible({ timeout: 15000 });

    // 開啟飯後開關，指派按鈕才可按（未開啟時 disabled）
    await page.getByRole('switch', { name: '飯後' }).click();

    const assignAfterButton = newMedRow.getByRole('button', { name: '放到飯後' });
    await expect(assignAfterButton).toBeEnabled();
    await assignAfterButton.click();
    await expect(assignAfterButton).toHaveAttribute('aria-pressed', 'true');
  });
});
