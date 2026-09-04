import type { Page } from '@playwright/test';

import { expect, seedLiffMock, t, test } from './fixtures';
import { KNOWLEDGE_REPORTS, knowledgeReport, stubApi, stubKnowledgeReports } from './stubs';

/**
 * 知識回報（使用者端）：列表四態、統計、篩選與排序、詳情 dialog、
 * /knowledge-reports/new 深連結開表單、表單送出的成功與三種失敗、回到 LINE 的 fallback。
 */

async function openPage(page: Page, path = '/knowledge-reports') {
  await page.goto(path);
  // /new 一掛載就開 dialog，背景會被 inert，標題不在無障礙樹裡；改等 dialog
  if (path.endsWith('/new')) {
    await expect(page.getByRole('dialog')).toBeVisible();
    return;
  }
  await expect(page.getByRole('heading', { name: t('knowledgeReports.title') })).toBeVisible();
}

const rowButton = (page: Page, question: string) =>
  page.getByRole('button', { name: t('knowledgeReports.viewReport', { question }) });

const filterTab = (page: Page, key: string) =>
  page.getByRole('tab', { name: new RegExp(`^${t(key)}`) });

test.describe('回報列表', () => {
  test('載入中顯示骨架屏，之後進入空狀態', async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, [], { delayMs: 1500 });
    await openPage(authedPage);

    await expect(
      authedPage.getByRole('list', { name: t('knowledgeReports.loading') }),
    ).toBeVisible();
    await expect(authedPage.getByText(t('knowledgeReports.emptyAllTitle'))).toBeVisible({
      timeout: 5000,
    });
    await expect(authedPage.getByText(t('knowledgeReports.emptyAllDesc'))).toBeVisible();
  });

  test('載入失敗顯示錯誤與後端訊息', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/knowledge-reports',
      method: 'GET',
      status: 500,
      body: { detail: '知識庫連線失敗' },
    });
    await openPage(authedPage);

    await expect(authedPage.getByText(t('knowledgeReports.loadError'))).toBeVisible({
      timeout: 10000,
    });
    await expect(authedPage.getByText('知識庫連線失敗')).toBeVisible();
  });

  test('有資料時顯示統計、最新提交卡與依時間排序的列', async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, KNOWLEDGE_REPORTS);
    await openPage(authedPage);

    const stats = authedPage.getByRole('group', { name: t('knowledgeReports.statsLabel') });
    await expect(stats.locator('strong')).toHaveText(['3', '1', '1']);

    const latest = authedPage.getByLabel(t('knowledgeReports.latest'));
    await expect(latest).toContainText('糖尿病患者的飲食建議');

    const rows = authedPage.getByRole('main').getByRole('button', { name: /^查看回報|^View report/ });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('糖尿病患者的飲食建議');
    await expect(rows.nth(2)).toContainText('流感疫苗今年幾月開打？');
    // 審核備註缺席時退回預設文案
    await expect(rows.nth(0)).toContainText(t('knowledgeReports.noReviewerNote'));
    await expect(rows.nth(2)).toContainText('已更新為 2026 年公告');
  });

  test('篩選分頁帶數量徽章，切換後只剩該狀態；沒有符合者顯示空狀態', async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, KNOWLEDGE_REPORTS);
    await openPage(authedPage);

    await expect(filterTab(authedPage, 'knowledgeReports.filter.all')).toContainText('3');
    await expect(filterTab(authedPage, 'knowledgeReports.filter.pending')).toContainText('1');

    await filterTab(authedPage, 'knowledgeReports.filter.reviewing').click();
    const rows = authedPage.getByRole('main').getByRole('button', { name: /^查看回報|^View report/ });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('高血壓可以喝咖啡嗎？');

    // rejected 沒有分頁；把唯一一筆改成 rejected 後 resolved 分頁會是空的
    await stubKnowledgeReports(authedPage, [
      knowledgeReport({ report_id: 'r', question: 'x', status: 'rejected' }),
    ]);
    await authedPage.reload();
    await filterTab(authedPage, 'knowledgeReports.filter.resolved').click();
    await expect(authedPage.getByText(t('knowledgeReports.emptyTitle'))).toBeVisible();
  });

  test('排序切到最舊時列順序反轉', async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, KNOWLEDGE_REPORTS);
    await openPage(authedPage);

    await authedPage.getByRole('combobox', { name: t('knowledgeReports.sortLabel') }).click();
    await authedPage.getByRole('option', { name: t('knowledgeReports.sort.oldest') }).click();

    const rows = authedPage.getByRole('main').getByRole('button', { name: /^查看回報|^View report/ });
    await expect(rows.nth(0)).toContainText('流感疫苗今年幾月開打？');
    await expect(rows.nth(2)).toContainText('糖尿病患者的飲食建議');
  });

  test('點列開啟詳情 dialog：顯示類型、來源連結、處理結果，可關閉', async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, KNOWLEDGE_REPORTS);
    await openPage(authedPage);

    await rowButton(authedPage, '高血壓可以喝咖啡嗎？').click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '高血壓可以喝咖啡嗎？' })).toBeVisible();
    await expect(dialog).toContainText(t('knowledgeReports.reason.missing'));
    await expect(dialog).toContainText(t('knowledgeReports.status.reviewing'));
    await expect(dialog.getByRole('link', { name: 'https://www.hpa.gov.tw/coffee' })).toHaveAttribute(
      'target',
      '_blank',
    );
    // user_note 與 question 不同時才顯示
    await expect(dialog).toContainText('找不到相關資料');

    await dialog.getByRole('button', { name: t('knowledgeReports.closeDetail') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);

    await rowButton(authedPage, '流感疫苗今年幾月開打？').click();
    await expect(authedPage.getByRole('dialog')).toContainText('知識庫已更新');
  });
});

test.describe('回報表單', () => {
  const URL = 'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=1';
  const NOTE = '這頁的疫苗接種年齡已經不是最新的。';

  async function openForm(page: Page) {
    await page.getByRole('button', { name: t('knowledgeReports.form.open') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(t('knowledgeReports.form.title'))).toBeVisible();
    return dialog;
  }

  async function fillForm(dialog: ReturnType<Page['getByRole']>) {
    await dialog.locator('#knowledge-report-url').fill(URL);
    await dialog.locator('#knowledge-report-note').fill(NOTE);
  }

  test.beforeEach(async ({ authedPage }) => {
    await stubKnowledgeReports(authedPage, []);
  });

  test('/knowledge-reports/new 掛載時自動開啟表單，關閉後網址回到列表', async ({ authedPage }) => {
    await openPage(authedPage, '/knowledge-reports/new');

    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByText(t('knowledgeReports.form.title'))).toBeVisible();

    await dialog.getByRole('button', { name: t('knowledgeReports.form.cancel') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(authedPage).toHaveURL(/\/knowledge-reports$/);
  });

  test('網址與說明都填了才能送出', async ({ authedPage }) => {
    await openPage(authedPage);
    const dialog = await openForm(authedPage);

    const submit = dialog.getByRole('button', { name: t('knowledgeReports.form.submit') });
    await expect(submit).toBeDisabled();
    await dialog.locator('#knowledge-report-url').fill(URL);
    await expect(submit).toBeDisabled();
    await dialog.locator('#knowledge-report-note').fill(NOTE);
    await expect(submit).toBeEnabled();
  });

  test('送出成功：payload 正確、關閉表單、toast、列表重新載入', async ({ authedPage }) => {
    const lists = await stubKnowledgeReports(authedPage, []);
    const posts = await stubApi(authedPage, {
      path: '/api/knowledge-reports',
      method: 'POST',
      status: 201,
      body: { report_id: 'rpt-new' },
    });
    await openPage(authedPage);
    const dialog = await openForm(authedPage);
    await fillForm(dialog);

    // 回報原因改成「缺少資料」
    await dialog.locator('#knowledge-report-reason').click();
    await authedPage.getByRole('option', { name: t('knowledgeReports.reason.missing') }).click();

    await dialog.getByRole('button', { name: t('knowledgeReports.form.submit') }).click();

    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toEqual({
      question: NOTE,
      reason: 'missing',
      user_note: NOTE,
      user_source_urls: [URL],
    });
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(authedPage.getByText(t('knowledgeReports.form.submitSuccess'))).toBeVisible();
    await expect.poll(() => lists.length).toBeGreaterThanOrEqual(2);
  });

  test('回報原因下拉要顯示翻譯後的標籤，而不是 outdated 這種原始值', async ({ authedPage }) => {
    // 已知 bug：ReportFormDialog 的 <SelectValue /> 沒有像設定頁那樣用函式 child
    // 對應回標籤，觸發器上直接顯示 "outdated"。修好後把這行 test.fail 拿掉。
    test.fail(true, '已知 bug：回報原因 Select 顯示原始值 outdated');
    await openPage(authedPage);
    const dialog = await openForm(authedPage);

    await expect(dialog.locator('#knowledge-report-reason')).toContainText(
      t('knowledgeReports.reason.outdated'),
    );
    await expect(dialog.locator('#knowledge-report-reason')).not.toContainText('outdated');
  });

  test('網址不在白名單：逐筆列出被拒網址與原因', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/knowledge-reports',
      method: 'POST',
      status: 422,
      body: {
        detail: {
          code: 'url_not_allowed',
          message: '網址不在白名單',
          invalid_urls: [
            { url: 'https://example.com/a', reason: 'not_allowed' },
            { url: 'not a url', reason: 'malformed' },
          ],
        },
      },
    });
    await openPage(authedPage);
    const dialog = await openForm(authedPage);
    await fillForm(dialog);
    await dialog.getByRole('button', { name: t('knowledgeReports.form.submit') }).click();

    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText(t('knowledgeReports.form.error.urlNotAllowed'));
    await expect(alert).toContainText('https://example.com/a');
    await expect(alert).toContainText(t('knowledgeReports.form.error.urlDomainNotAllowed'));
    await expect(alert).toContainText('not a url');
    await expect(alert).toContainText(t('knowledgeReports.form.error.urlInvalid'));
    await expect(alert).toContainText(t('knowledgeReports.form.error.urlRemedy'));
    await expect(dialog).toBeVisible();
  });

  test('超過每日上限時顯示含上限數字的訊息', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/knowledge-reports',
      method: 'POST',
      status: 429,
      body: { detail: { code: 'quota_exceeded', limit: 5 } },
    });
    await openPage(authedPage);
    const dialog = await openForm(authedPage);
    await fillForm(dialog);
    await dialog.getByRole('button', { name: t('knowledgeReports.form.submit') }).click();

    await expect(dialog.getByRole('alert')).toContainText(
      t('knowledgeReports.form.error.quotaExceeded', { limit: 5 }),
    );
  });

  test('其他失敗（500）顯示通用錯誤，表單內容保留', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/knowledge-reports',
      method: 'POST',
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);
    const dialog = await openForm(authedPage);
    await fillForm(dialog);
    await dialog.getByRole('button', { name: t('knowledgeReports.form.submit') }).click();

    await expect(dialog.getByRole('alert')).toContainText(t('knowledgeReports.form.error.generic'));
    await expect(dialog.locator('#knowledge-report-note')).toHaveValue(NOTE);
  });
});

test.describe('回到 LINE 詢問', () => {
  test('外部瀏覽器按下時不關視窗，改用 toast 提示', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: false });
    await stubKnowledgeReports(authedPage, []);
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('knowledgeReports.askInLine') }).click();

    await expect(authedPage.getByText(t('knowledgeReports.lineFallback'))).toBeVisible();
    await expect(authedPage).toHaveURL(/\/knowledge-reports$/);
  });
});
