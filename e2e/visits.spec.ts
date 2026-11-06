import type { Page } from '@playwright/test';

import { expect, t, test } from './fixtures';
import { FAMILY_MEMBERS, stubApi, stubFamily, stubSettings, type ApiCall } from './stubs';

/**
 * 看診紀錄（從藥袋整理出的調劑機構與日期）：清單、空狀態、權限不足與載入失敗。
 * 權限不足與載入失敗要分得開：前者重試也沒用，所以不重試、不給「重新載入」。
 */

/** 對齊 types/medication.ts 的 MedicationVisit */
type VisitDto = {
  institution: string | null;
  dispensed_date: string | null;
  medication_ids: string[];
  medication_names: string[];
  scan_count: number;
  first_created_at: string | null;
};

const CLINIC_VISIT: VisitDto = {
  institution: '仁愛診所',
  dispensed_date: '2026-09-10',
  medication_ids: ['m-1', 'm-2'],
  medication_names: ['AMLODIPINE 5MG', 'METFORMIN 500MG'],
  scan_count: 3,
  first_created_at: '2026-09-10T09:00:00Z',
};
const UNKNOWN_SOURCE: VisitDto = {
  institution: null,
  dispensed_date: null,
  medication_ids: ['m-3'],
  medication_names: ['ASPIRIN 100MG'],
  scan_count: 1,
  first_created_at: null,
};

type VisitsResponse = { status: number; body: unknown };
const ok = (visits: VisitDto[]): VisitsResponse => ({ status: 200, body: { visits } });

/** GET /api/medications/visits；回應由 respond 依當下狀態決定，測試中途可以換 */
function stubVisits(page: Page, respond: (call: ApiCall) => VisitsResponse) {
  return stubApi(page, { path: '/api/medications/visits', method: 'GET', respond });
}

const heading = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 });

async function openPage(page: Page) {
  await page.goto('/reminders/medications/visits');
  await expect(heading(page, t('visits.title'))).toBeVisible();
}

test.beforeEach(async ({ authedPage }) => {
  await stubSettings(authedPage);
});

test('列出每次看診的機構、日期、藥名，未記錄來源的另外說明', async ({ authedPage }) => {
  await stubFamily(authedPage);
  const calls = await stubVisits(authedPage, () => ok([CLINIC_VISIT, UNKNOWN_SOURCE]));
  await openPage(authedPage);

  const main = authedPage.getByRole('main');
  await expect(main.getByText(CLINIC_VISIT.institution as string)).toBeVisible();
  await expect(main.getByText(CLINIC_VISIT.dispensed_date as string)).toBeVisible();
  await expect(main.getByText(t('visits.drugCount', { count: 2 }))).toBeVisible();
  await expect(main.getByText(t('visits.scanCount', { count: 3 }))).toBeVisible();
  await expect(
    main.getByText(CLINIC_VISIT.medication_names.join(t('meds.scan.draft.slotListSeparator'))),
  ).toBeVisible();

  await expect(main.getByText(t('visits.unknownInstitution'), { exact: true })).toBeVisible();
  await expect(main.getByText(t('visits.unknownDate'))).toBeVisible();
  await expect(main.getByText(t('visits.unknownInstitutionHint'))).toBeVisible();
  // 掃描次數只在大於 1 時出現
  await expect(main.getByText(t('visits.scanCount', { count: 1 }))).toHaveCount(0);

  expect(calls).toHaveLength(1);
  expect(calls[0].url.searchParams.has('target_user_id')).toBe(false);
});

test('沒有紀錄時告訴使用者怎麼讓資料出現', async ({ authedPage }) => {
  await stubFamily(authedPage);
  await stubVisits(authedPage, () => ok([]));
  await openPage(authedPage);

  await expect(authedPage.getByText(t('visits.empty'))).toBeVisible();
});

test('家人回 403：顯示沒有權限、不給重新載入，而且只請求一次', async ({ authedPage }) => {
  const GRANDMA = FAMILY_MEMBERS[0];
  await stubFamily(authedPage, [GRANDMA]);
  const calls = await stubVisits(authedPage, (call) =>
    call.url.searchParams.get('target_user_id') === GRANDMA.user_id
      ? { status: 403, body: { detail: 'e2e：權限不足' } }
      : ok([CLINIC_VISIT]),
  );
  await openPage(authedPage);
  await expect(authedPage.getByText(CLINIC_VISIT.institution as string)).toBeVisible();

  await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();

  await expect(
    heading(authedPage, t('visits.titleForMember', { name: GRANDMA.display_name })),
  ).toBeVisible();
  await expect(authedPage.getByText(t('visits.forbidden'))).toBeVisible();
  await expect(authedPage.getByRole('button', { name: t('visits.retry') })).toHaveCount(0);
  // 一般錯誤的第一次重試在 1 秒後；等過這段時間仍只有一次，才證明 403 沒有被重試
  await authedPage.waitForTimeout(1500);
  const grandmaCalls = calls.filter(
    (call) => call.url.searchParams.get('target_user_id') === GRANDMA.user_id,
  );
  expect(grandmaCalls).toHaveLength(1);
});

test('500 時重試後才顯示錯誤與後端訊息，按「重新載入」恢復', async ({ authedPage }) => {
  await stubFamily(authedPage);
  let response: VisitsResponse = { status: 500, body: { detail: '資料庫暫時無法連線' } };
  const calls = await stubVisits(authedPage, () => response);
  await openPage(authedPage);

  await expect(authedPage.getByText(t('visits.loadError'))).toBeVisible({ timeout: 10_000 });
  await expect(authedPage.getByText('資料庫暫時無法連線')).toBeVisible();
  // 一般錯誤會重試兩次（共三次請求），與 403 不同
  expect(calls).toHaveLength(3);

  response = ok([CLINIC_VISIT]);
  await authedPage.getByRole('button', { name: t('visits.retry') }).click();

  await expect(authedPage.getByText(CLINIC_VISIT.institution as string)).toBeVisible();
  await expect(authedPage.getByText(t('visits.loadError'))).toHaveCount(0);
  expect(calls).toHaveLength(4);
});
