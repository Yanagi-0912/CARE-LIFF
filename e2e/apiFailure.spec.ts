import type { Page } from '@playwright/test';

import { LINE_USER_ID, expect, seedLiffMock, stubLiffLogin, stubProfileApi, t, test } from './fixtures';
import {
  FACILITIES,
  FAMILY_MEMBERS,
  KNOWLEDGE_REPORTS,
  RAW_MESSAGES,
  SUMMARIES,
  collectConsoleErrors,
  knowledgeReport,
  medication,
  reminder,
  stubApi,
  stubConsultations,
  stubFamily,
  stubKnowledgeReports,
  nearbyResponse,
  stubNearby,
  stubReminderList,
  stubSettings,
} from './stubs';

/**
 * 橫切面：401 全域救援、網路層失敗、以及「正常路徑下 console 不得有錯誤」。
 *
 * console 這條守的是靜默退化：畫面看起來對、但某個 effect 已經在丟例外，
 * 唯一看得到的地方就是 console。每一頁都用完整的 happy-path stub 跑一次。
 */

test.describe('401 全域救援', () => {
  test('任一帶憑證的請求回 401：清掉 token、記住目前頁面、導向登入頁', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/family/me',
      status: 401,
      body: { detail: 'Token expired' },
    });
    await authedPage.goto('/family');

    await expect(authedPage).toHaveURL(/\/login(\?|$)/);
    // token 是否被清掉在這裡驗不到：fixture 的 addInitScript 會在導向 /login 那次
    // 頁面載入時把假 token 寫回去。清 token 的行為由 vitest 的 auth 測試涵蓋。
    expect(
      await authedPage.evaluate(() => sessionStorage.getItem('CARE_REDIRECT_URL')),
    ).toBe('/family');
  });

  test('列表類頁面在網路中斷時落入錯誤狀態而非白畫面', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/knowledge-reports', method: 'GET', abort: true });
    await authedPage.goto('/knowledge-reports');

    await expect(authedPage.getByText(t('knowledgeReports.loadError'))).toBeVisible({
      timeout: 10000,
    });
    await expect(authedPage.getByRole('banner')).toBeVisible();
  });
});

/** 每一頁的 happy-path 資料。admin 頁另外處理（需要 admin 身分）。 */
async function stubEverything(page: Page) {
  await stubProfileApi(page, { name: '王大明', gender: 'male', age: 72, height: 168, weight: 60 });
  await stubFamily(page, FAMILY_MEMBERS);
  await stubSettings(page, {}, { prescriptionScanEnabled: true });
  await stubReminderList(page, [
    reminder({
      id: 'r1',
      slot_type: 'morning',
      medications: [medication({ id: 'm1', name: 'AMLODIPINE', shape: '圓形', color: '白色' })],
    }),
  ]);
  await stubKnowledgeReports(page, KNOWLEDGE_REPORTS);
  await stubConsultations(page, { summaries: SUMMARIES, raw: RAW_MESSAGES });
  await stubNearby(page, nearbyResponse(FACILITIES));
  await stubApi(page, {
    path: `/api/profiles/${FAMILY_MEMBERS[0].user_id}`,
    body: { name: '林阿嬤', age: 78 },
  });
  await stubApi(page, {
    path: '/api/family/invites/verify/e2e-code',
    body: { inviter_display_name: '林阿嬤', expires_at: '2026-12-31T00:00:00Z' },
  });
}

const PAGES = [
  '/',
  '/personalhealth',
  '/personalhealth/consult',
  '/medications',
  '/family',
  '/knowledge-reports',
  '/knowledge-reports/new',
  '/settings',
  '/nearby-hospitals',
  '/join?code=e2e-code',
] as const;

test.describe('正常路徑下 console 不得出現錯誤', () => {
  test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] });

  for (const path of PAGES) {
    test(`${path}`, async ({ authedPage }) => {
      if (path === '/nearby-hospitals') {
        // 已知 bug：FacilityCard 的「撥打電話」「導航前往」用 <Button render={<a/>}>
        // 卻沒設 nativeButton={false}，Base UI 每張卡片都往 console 丟 error。
        test.fail(true, '已知 bug：FacilityCard 的連結型 Button 缺 nativeButton={false}');
      }
      await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: true, getIDToken: 'tok' });
      await stubLiffLogin(authedPage, { access_token: 'e2e-mock-access-token', line_user_id: LINE_USER_ID });
      await stubEverything(authedPage);
      const errors = collectConsoleErrors(authedPage);

      await authedPage.goto(path);
      await expect(authedPage.locator('#root')).not.toBeEmpty();
      // 讓 lazy 頁面與各查詢落地
      await authedPage.waitForLoadState('networkidle');
      // 順手互動：展開家人卡片、切到對話分頁、搜尋附近醫院
      if (path === '/family') {
        await authedPage.getByRole('button', { name: FAMILY_MEMBERS[0].display_name }).click();
        await expect(authedPage.getByText(`78 ${t('personalHealth.unit.age')}`)).toBeVisible();
      }
      if (path === '/personalhealth/consult') {
        await authedPage.getByRole('tab', { name: t('consultRecord.tabRaw') }).click();
        await expect(authedPage.getByRole('list', { name: t('consultRecord.tabRaw') })).toBeVisible();
      }
      if (path === '/nearby-hospitals') {
        await authedPage.getByRole('button', { name: t('nearby.searchButton') }).click();
        await expect(authedPage.getByText('象山中醫診所')).toBeVisible();
      }
      await authedPage.waitForTimeout(500);

      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('/admin/knowledge-reports（管理員）', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true });
    await stubLiffLogin(authedPage, { access_token: 'e2e-mock-access-token', line_user_id: LINE_USER_ID });
    await stubEverything(authedPage);
    await stubProfileApi(authedPage, { name: '管理員', role: 'admin' });
    await stubApi(authedPage, {
      path: '/api/admin/knowledge-reports',
      method: 'GET',
      body: {
        reports: [knowledgeReport({ report_id: 'a1', question: 'q', user_source_urls: ['https://www.cdc.gov.tw/x'] })],
        total: 1,
        limit: 50,
        offset: 0,
        status_counts: { pending: 1, reviewing: 0 },
      },
    });
    const errors = collectConsoleErrors(authedPage);

    await authedPage.goto('/admin/knowledge-reports');
    await expect(
      authedPage.getByRole('heading', { name: t('adminKnowledgeReports.title') }),
    ).toBeVisible();
    await authedPage.waitForLoadState('networkidle');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
