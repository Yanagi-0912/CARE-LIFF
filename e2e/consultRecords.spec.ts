import type { Page } from '@playwright/test';

import { expect, seedLiffMock, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  RAW_MESSAGES,
  SUMMARIES,
  stubApi,
  stubConsultations,
  stubFamily,
} from './stubs';

/**
 * 健康諮詢紀錄：摘要／對話兩個分頁各自的載入、空、錯誤、有資料四態，
 * 日期切換、訊息全文 dialog、查看家人（?user=）與下載摘要。
 */

const GRANDMA = FAMILY_MEMBERS[0];

async function openPage(page: Page, query = '') {
  await page.goto(`/personalhealth/consult${query}`);
  await expect(page.getByRole('tab', { name: t('consultRecord.tabSummary') })).toBeVisible();
}

test.describe('諮詢紀錄（本人）', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
  });

  test('載入中兩個分頁都顯示骨架屏', async ({ authedPage }) => {
    await stubConsultations(authedPage, { delayMs: 1500 });
    await openPage(authedPage);

    await expect(authedPage.getByRole('list', { name: t('consultRecord.loading') })).toBeVisible();
    await expect(authedPage.getByText(t('consultRecord.noSummaryData'))).toBeVisible({
      timeout: 5000,
    });
  });

  test('沒有任何紀錄時兩個分頁各自顯示空狀態', async ({ authedPage }) => {
    await stubConsultations(authedPage);
    await openPage(authedPage);

    await expect(authedPage.getByRole('heading', { name: t('consultRecord.title') })).toBeVisible();
    await expect(authedPage.getByText(t('consultRecord.noSummaryData'))).toBeVisible();

    await authedPage.getByRole('tab', { name: t('consultRecord.tabRaw') }).click();
    await expect(authedPage.getByText(t('consultRecord.noRawMessages'))).toBeVisible();
  });

  test('有摘要時顯示日期選單與各段落，切換日期會換內容', async ({ authedPage }) => {
    await stubConsultations(authedPage, { summaries: SUMMARIES, raw: RAW_MESSAGES });
    await openPage(authedPage);

    const select = authedPage.locator('#summary-select');
    await expect(select).toContainText('09/02');

    const sections = authedPage.getByRole('list', { name: t('consultRecord.summaryTitle') });
    await expect(sections).toContainText('主訴');
    await expect(sections).toContainText('最近常頭暈');
    // 陣列值渲染成 markdown 清單
    await expect(sections.locator('li')).toHaveCount(2);
    await expect(sections).toContainText('量血壓');

    await select.click();
    await authedPage.getByRole('option', { name: '08/20' }).click();

    await expect(select).toContainText('08/20');
    await expect(sections).toContainText('睡不好');
    await expect(sections).not.toContainText('最近常頭暈');
  });

  test('摘要是純文字時原樣顯示', async ({ authedPage }) => {
    await stubConsultations(authedPage, {
      summaries: [{ summary_date: '2026-09-02', summary: '今天聊了血壓與飲食。' }],
    });
    await openPage(authedPage);

    const sections = authedPage.getByRole('list', { name: t('consultRecord.summaryTitle') });
    await expect(sections).toContainText(t('consultRecord.summaryContent'));
    await expect(sections).toContainText('今天聊了血壓與飲食。');
  });

  test('對話分頁列出訊息，點開可看全文並關閉', async ({ authedPage }) => {
    await stubConsultations(authedPage, { raw: RAW_MESSAGES });
    await openPage(authedPage);

    await authedPage.getByRole('tab', { name: t('consultRecord.tabRaw') }).click();
    const list = authedPage.getByRole('list', { name: t('consultRecord.tabRaw') });
    await expect(list.getByRole('button')).toHaveCount(2);
    await expect(list).toContainText(t('consultRecord.modalUserTitle'));
    await expect(list).toContainText(t('consultRecord.modalAiTitle'));

    await list.getByRole('button').nth(1).click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog).toContainText(t('consultRecord.modalAiTitle'));
    await expect(dialog).toContainText('建議先量血壓，若持續請就醫。');

    await dialog.getByRole('button', { name: t('consultRecord.closeModal') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
  });

  test('摘要載入失敗但有對話時，顯示錯誤並自動切到對話分頁', async ({ authedPage }) => {
    await stubConsultations(authedPage, {
      summaries: { status: 503 },
      raw: RAW_MESSAGES,
    });
    await openPage(authedPage);

    await expect(authedPage.getByRole('tab', { name: t('consultRecord.tabRaw') })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 10000 },
    );
    await expect(authedPage.getByRole('list', { name: t('consultRecord.tabRaw') })).toBeVisible();

    await authedPage.getByRole('tab', { name: t('consultRecord.tabSummary') }).click();
    // consultationApi 對 503 的固定文案
    await expect(authedPage.getByText('資料庫暫時不可用，請稍後再試')).toBeVisible();
  });

  test('「返回個人健康資料」導向 /personalhealth', async ({ authedPage }) => {
    await stubConsultations(authedPage);
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('consultRecord.backToHealth') }).click();
    await expect(authedPage).toHaveURL(/\/personalhealth$/);
  });
});

test.describe('下載摘要', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubConsultations(authedPage, { summaries: SUMMARIES });
  });

  test('外部瀏覽器：取得下載 token 後直接導向下載網址', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/consultations/me/summary/downloadtoken',
      body: { downloadToken: 'dl-token-1', expiresIn: 300 },
    });
    // 下載端點會被當成整頁導航，這裡用純文字回應接住
    await authedPage.route(
      (url) => url.pathname === '/api/consultations/me/summary/download',
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'e2e-download' }),
    );
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('consultRecord.downloadAll') }).click();

    await expect(authedPage).toHaveURL(/summary\/download\?downloadToken=dl-token-1$/);
  });

  test('LINE 內：用 openWindow 開外部瀏覽器並提示', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: true });
    await stubApi(authedPage, {
      path: '/api/consultations/me/summary/downloadtoken',
      body: { downloadToken: 'dl-token-2', expiresIn: 300 },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('consultRecord.downloadAll') }).click();

    await expect(authedPage.getByText(t('consultRecord.downloadOpened'))).toBeVisible();
    await expect(authedPage).toHaveURL(/\/personalhealth\/consult$/);
  });

  test('取得 token 失敗時顯示錯誤 toast', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/consultations/me/summary/downloadtoken',
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('consultRecord.downloadAll') }).click();

    await expect(authedPage.getByText('取得摘要下載token失敗：500')).toBeVisible();
  });
});

test.describe('查看家人的紀錄', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await stubConsultations(authedPage, { summaries: SUMMARIES });
  });

  test('?user= 指向家人時改打該成員的端點、標題換名字、隱藏下載鈕', async ({ authedPage }) => {
    const { summaryCalls } = await stubConsultations(authedPage, {
      owner: GRANDMA.user_id,
      summaries: [{ summary_date: '2026-07-01', summary: '阿嬤的摘要' }],
      raw: [{ message_type: 'text', content: '阿嬤說的話' }],
    });
    await openPage(authedPage, `?user=${GRANDMA.user_id}`);

    await expect(
      authedPage.getByRole('heading', {
        name: t('consultRecord.titleForMember', { name: GRANDMA.display_name }),
      }),
    ).toBeVisible();
    await expect.poll(() => summaryCalls.length).toBeGreaterThan(0);
    await expect(authedPage.getByText('阿嬤的摘要')).toBeVisible();
    await expect(
      authedPage.getByRole('button', { name: t('consultRecord.downloadAll') }),
    ).toHaveCount(0);

    // 對話分頁的發言者換成家人的名字
    await authedPage.getByRole('tab', { name: t('consultRecord.tabRaw') }).click();
    await expect(authedPage.getByRole('list', { name: t('consultRecord.tabRaw') })).toContainText(
      t('consultRecord.modalMemberTitle', { name: GRANDMA.display_name }),
    );
  });

  test('切換對象會改寫網址參數，切回本人則移除參數', async ({ authedPage }) => {
    await stubConsultations(authedPage, { owner: GRANDMA.user_id });
    await openPage(authedPage);

    const targets = authedPage.getByRole('group', { name: t('consultRecord.targetLabel') });
    await targets.getByRole('button', { name: GRANDMA.display_name }).click();
    await expect(authedPage).toHaveURL(new RegExp(`\\?user=${GRANDMA.user_id}$`));

    await targets.getByRole('button', { name: t('consultRecord.self') }).click();
    await expect(authedPage).toHaveURL(/\/personalhealth\/consult$/);
    await expect(authedPage.getByRole('heading', { name: t('consultRecord.title') })).toBeVisible();
  });

  test('不在同一家庭時（403）顯示權限說明', async ({ authedPage }) => {
    await stubConsultations(authedPage, {
      owner: 'Ustranger000000000000000000000000',
      summaries: { status: 403 },
      raw: { status: 403 },
    });
    await openPage(authedPage, '?user=Ustranger000000000000000000000000');

    await expect(
      authedPage.getByText('你不在這位成員的家庭群組中，無法查看紀錄'),
    ).toBeVisible({ timeout: 10000 });
  });
});
