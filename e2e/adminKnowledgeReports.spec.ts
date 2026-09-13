import type { Page } from '@playwright/test';

import { expect, stubProfileApi, t, test } from './fixtures';
import { knowledgeReport, stubApi, type KnowledgeReportDto } from './stubs';

/**
 * 管理員審核：AdminRoute 守門、佇列列表與分頁、審核 dialog 的
 * 內容預覽（抓取中→就緒）、核准／駁回的 API 契約、預覽失效（409）的重抓出口。
 */

const REPORT_WITH_URL = knowledgeReport({
  report_id: 'rpt-1',
  question: '流感疫苗接種年齡？',
  status: 'pending',
  user_note: '這頁寫的年齡是舊的',
  user_source_urls: ['https://www.cdc.gov.tw/flu'],
});
const REPORT_NO_URL = knowledgeReport({
  report_id: 'rpt-2',
  question: '糖尿病可以吃水果嗎？',
  status: 'reviewing',
  reason: 'missing',
});

const PREVIEW_ITEM = (url: string) => ({
  url,
  status: 'ok',
  title: '疾管署 流感專區',
  content: '本季流感疫苗自 10 月 1 日起開打……'.repeat(3),
  content_hash: `hash-${url}`,
  char_count: 1200,
  truncated: false,
  message: '',
});

function previewBody(reportId: string, urls: string[], status: 'running' | 'ready') {
  return {
    preview_id: `pv-${reportId}`,
    report_id: reportId,
    status,
    urls,
    items: status === 'ready' ? urls.map(PREVIEW_ITEM) : [],
    created_at: '2026-09-01T00:00:00Z',
    expires_at: '2026-09-01T01:00:00Z',
  };
}

/** 佇列列表 stub：依 status 查詢參數過濾，回傳 total 與 status_counts */
async function stubQueue(page: Page, reports: KnowledgeReportDto[], total?: number) {
  return stubApi(page, {
    path: '/api/admin/knowledge-reports',
    method: 'GET',
    respond: (call) => {
      const status = call.url.searchParams.get('status');
      const filtered = status ? reports.filter((r) => r.status === status) : reports;
      return {
        status: 200,
        body: {
          reports: filtered,
          total: total ?? filtered.length,
          limit: Number(call.url.searchParams.get('limit') ?? 50),
          offset: Number(call.url.searchParams.get('offset') ?? 0),
          status_counts: {
            pending: reports.filter((r) => r.status === 'pending').length,
            reviewing: reports.filter((r) => r.status === 'reviewing').length,
          },
        },
      };
    },
  });
}

/**
 * 預覽端點：POST 啟動、GET 輪詢。startStatus 決定 POST 回什麼。
 *
 * startStatus 為 running 時，第一次 GET 回 404（尚未建立）：頁面一開 dialog 就會
 * 同時發 GET 與 POST，若 GET 直接回 ready，誰先回來就決定畫面，測「抓取中」會變成
 * 擲骰子。404 → POST(running) → 3 秒後輪詢 GET(ready) 才是真後端的順序。
 */
async function stubPreview(page: Page, reportId: string, startStatus: 'running' | 'ready' = 'ready') {
  let getCount = 0;
  const posts = await stubApi(page, {
    path: `/api/admin/knowledge-reports/${reportId}/preview`,
    method: 'POST',
    respond: (call) => {
      const urls = (call.body as { urls?: string[] }).urls ?? [];
      return { status: 202, body: previewBody(reportId, urls, startStatus) };
    },
  });
  const gets = await stubApi(page, {
    path: `/api/admin/knowledge-reports/${reportId}/preview`,
    method: 'GET',
    respond: () => {
      getCount += 1;
      if (startStatus === 'running' && getCount === 1) {
        return { status: 404, body: { detail: 'preview not found' } };
      }
      return {
        status: 200,
        body: previewBody(reportId, [...REPORT_WITH_URL.user_source_urls], 'ready'),
      };
    },
  });
  return { posts, gets };
}

async function openAsAdmin(page: Page) {
  await stubProfileApi(page, { name: '管理員', role: 'admin' });
  await page.goto('/admin/knowledge-reports');
  await expect(
    page.getByRole('heading', { name: t('adminKnowledgeReports.title') }),
  ).toBeVisible();
}

const rowButton = (page: Page, question: string) =>
  page.getByRole('button', { name: t('adminKnowledgeReports.viewReport', { question }) });

test.describe('管理員守門', () => {
  test('一般使用者進入審核頁會被導回首頁', async ({ authedPage }) => {
    await stubProfileApi(authedPage, { name: '一般人', role: 'user' });
    await authedPage.goto('/admin/knowledge-reports');

    await expect(authedPage).toHaveURL(/\/$/);
    await expect(authedPage.getByRole('heading', { name: t('home.title'), level: 1 })).toBeVisible();
  });

  test('尚未建檔（profile 404）也視為非管理員', async ({ authedPage }) => {
    await authedPage.goto('/admin/knowledge-reports');
    await expect(authedPage).toHaveURL(/\/$/);
  });

  test('管理員可進入，且側欄多出審核入口', async ({ authedPage }) => {
    await stubQueue(authedPage, []);
    await openAsAdmin(authedPage);

    await expect(authedPage).toHaveURL(/\/admin\/knowledge-reports$/);
    await expect(authedPage.getByText(t('adminKnowledgeReports.emptyAllTitle'))).toBeVisible();
  });
});

test.describe('審核佇列', () => {
  test('列出待審與審核中的回報、統計由後端計數決定', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_WITH_URL, REPORT_NO_URL]);
    await openAsAdmin(authedPage);

    const stats = authedPage.getByRole('group', { name: t('adminKnowledgeReports.statsLabel') });
    await expect(stats.locator('strong')).toHaveText(['2', '1', '1']);

    await expect(rowButton(authedPage, REPORT_WITH_URL.question)).toBeVisible();
    await expect(rowButton(authedPage, REPORT_NO_URL.question)).toBeVisible();
    await expect(rowButton(authedPage, REPORT_WITH_URL.question)).toContainText('這頁寫的年齡是舊的');
    await expect(rowButton(authedPage, REPORT_NO_URL.question)).toContainText(
      t('adminKnowledgeReports.noUserNote'),
    );
  });

  test('篩選交給後端：切到待審核時帶 status=pending 重新查詢', async ({ authedPage }) => {
    const gets = await stubQueue(authedPage, [REPORT_WITH_URL, REPORT_NO_URL]);
    await openAsAdmin(authedPage);

    await authedPage
      .getByRole('tab', { name: new RegExp(`^${t('adminKnowledgeReports.filter.pending')}`) })
      .click();

    await expect
      .poll(() => gets.map((c) => c.url.searchParams.get('status')))
      .toContain('pending');
    await expect(rowButton(authedPage, REPORT_NO_URL.question)).toHaveCount(0);
    await expect(rowButton(authedPage, REPORT_WITH_URL.question)).toBeVisible();
  });

  test('超過一頁時顯示已載入筆數與「載入更多」，按下後帶 offset 查下一頁', async ({ authedPage }) => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      knowledgeReport({ report_id: `p1-${i}`, question: `第一頁問題 ${i}` }),
    );
    const page2 = [knowledgeReport({ report_id: 'p2-0', question: '第二頁的問題' })];
    const gets = await stubApi(authedPage, {
      path: '/api/admin/knowledge-reports',
      method: 'GET',
      respond: (call) => {
        const offset = Number(call.url.searchParams.get('offset') ?? 0);
        return {
          status: 200,
          body: {
            reports: offset === 0 ? page1 : page2,
            total: 51,
            limit: 50,
            offset,
            status_counts: { pending: 51, reviewing: 0 },
          },
        };
      },
    });
    await openAsAdmin(authedPage);

    await expect(
      authedPage.getByText(t('adminKnowledgeReports.loadedCount', { loaded: 50, total: 51 })),
    ).toBeVisible();
    await authedPage.getByRole('button', { name: t('adminKnowledgeReports.loadMore') }).click();

    await expect.poll(() => gets.map((c) => c.url.searchParams.get('offset'))).toContain('50');
    await expect(rowButton(authedPage, '第二頁的問題')).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('adminKnowledgeReports.loadMore') })).toHaveCount(0);
  });

  test('載入失敗顯示錯誤', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/admin/knowledge-reports',
      method: 'GET',
      status: 500,
      body: { detail: '佇列讀取失敗' },
    });
    await openAsAdmin(authedPage);

    await expect(authedPage.getByText(t('adminKnowledgeReports.loadError'))).toBeVisible({
      timeout: 10000,
    });
    await expect(authedPage.getByText('佇列讀取失敗')).toBeVisible();
  });
});

test.describe('審核 dialog', () => {
  test('開啟時自動抓取預覽：抓取中→就緒後才能核准', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_WITH_URL]);
    const { posts } = await stubPreview(authedPage, REPORT_WITH_URL.report_id, 'running');
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_WITH_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: REPORT_WITH_URL.question })).toBeVisible();

    const approve = dialog.getByRole('button', { name: t('adminKnowledgeReports.approve') });
    await expect(dialog.getByText(t('adminKnowledgeReports.preview.running'))).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toEqual({ urls: REPORT_WITH_URL.user_source_urls });

    // 3 秒輪詢一次，GET 回 ready 後預覽內容出現、核准鈕解鎖
    await expect(dialog.getByText('疾管署 流感專區')).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText(
      t('adminKnowledgeReports.preview.charCount', { count: 1200 }),
    );
    await expect(approve).toBeEnabled();
  });

  test('核准送出勾選的網址、preview_id 與內容雜湊；成功後關閉並重新載入', async ({ authedPage }) => {
    const lists = await stubQueue(authedPage, [REPORT_WITH_URL]);
    await stubPreview(authedPage, REPORT_WITH_URL.report_id, 'ready');
    const approves = await stubApi(authedPage, {
      path: `/api/admin/knowledge-reports/${REPORT_WITH_URL.report_id}/approve`,
      method: 'POST',
      body: { ...REPORT_WITH_URL, status: 'reviewing' },
    });
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_WITH_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    await dialog.locator('#reviewer-note').fill('已核對來源');
    const approve = dialog.getByRole('button', { name: t('adminKnowledgeReports.approve') });
    await expect(approve).toBeEnabled();
    await approve.click();

    await expect.poll(() => approves.length).toBe(1);
    const url = REPORT_WITH_URL.user_source_urls[0];
    expect(approves[0].body).toEqual({
      selected_urls: [url],
      reviewer_note: '已核對來源',
      preview_id: `pv-${REPORT_WITH_URL.report_id}`,
      content_hashes: { [url]: `hash-${url}` },
    });
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => lists.length).toBeGreaterThanOrEqual(2);
  });

  test('取消勾選所有網址後不能核准並顯示提示', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_WITH_URL]);
    await stubPreview(authedPage, REPORT_WITH_URL.report_id, 'ready');
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_WITH_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    const url = REPORT_WITH_URL.user_source_urls[0];
    const checkbox = dialog.getByRole('checkbox', {
      name: t('adminKnowledgeReports.selectUrl', { url }),
    });
    await expect(checkbox).toBeChecked();
    await checkbox.click();

    await expect(dialog.getByText(t('adminKnowledgeReports.selectUrlsRequired'))).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: t('adminKnowledgeReports.approve') }),
    ).toBeDisabled();
  });

  test('預覽失效（409）時顯示重新抓取的出口，重抓帶 force=true', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_WITH_URL]);
    const { posts } = await stubPreview(authedPage, REPORT_WITH_URL.report_id, 'ready');
    await stubApi(authedPage, {
      path: `/api/admin/knowledge-reports/${REPORT_WITH_URL.report_id}/approve`,
      method: 'POST',
      status: 409,
      body: { detail: { code: 'preview_expired', message: '預覽已逾期，請重新抓取' } },
    });
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_WITH_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    const approve = dialog.getByRole('button', { name: t('adminKnowledgeReports.approve') });
    await expect(approve).toBeEnabled();
    await approve.click();

    await expect(dialog.getByText(t('adminKnowledgeReports.preview.stale'))).toBeVisible();
    await expect(dialog.getByText('預覽已逾期，請重新抓取')).toBeVisible();
    await expect(approve).toBeDisabled();

    await dialog.getByRole('button', { name: t('adminKnowledgeReports.preview.refetch') }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1].body).toEqual({ urls: REPORT_WITH_URL.user_source_urls, force: true });
    await expect(dialog.getByText(t('adminKnowledgeReports.preview.stale'))).toHaveCount(0);
    await expect(approve).toBeEnabled();
  });

  test('駁回只送審核備註，成功後關閉', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_NO_URL]);
    const rejects = await stubApi(authedPage, {
      path: `/api/admin/knowledge-reports/${REPORT_NO_URL.report_id}/reject`,
      method: 'POST',
      body: { ...REPORT_NO_URL, status: 'rejected' },
    });
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_NO_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    // 沒有來源網址：預覽區不出現、核准停用
    await expect(dialog.getByText(t('adminKnowledgeReports.noSourceUrls'))).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: t('adminKnowledgeReports.approve') }),
    ).toBeDisabled();

    await dialog.locator('#reviewer-note').fill('問題與醫療無關');
    await dialog.getByRole('button', { name: t('adminKnowledgeReports.reject') }).click();

    await expect.poll(() => rejects.length).toBe(1);
    expect(rejects[0].body).toEqual({ reviewer_note: '問題與醫療無關' });
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
  });

  test('沒有來源的回報可由管理員補上網址，補上後自動抓取預覽', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_NO_URL]);
    const { posts } = await stubPreview(authedPage, REPORT_NO_URL.report_id, 'ready');
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_NO_URL.question).click();
    const dialog = authedPage.getByRole('dialog');

    const input = dialog.getByRole('textbox', { name: t('adminKnowledgeReports.addUrlLabel') });
    const addButton = dialog.getByRole('button', { name: t('adminKnowledgeReports.addUrl') });
    await expect(addButton).toBeDisabled();
    await input.fill('https://www.hpa.gov.tw/diabetes');
    await addButton.click();

    await expect(dialog).toContainText(t('adminKnowledgeReports.adminAddedUrl'));
    await expect(
      dialog.getByRole('checkbox', {
        name: t('adminKnowledgeReports.selectUrl', { url: 'https://www.hpa.gov.tw/diabetes' }),
      }),
    ).toBeChecked();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toEqual({ urls: ['https://www.hpa.gov.tw/diabetes'] });
    await expect(input).toHaveValue('');
  });

  test('駁回失敗時錯誤顯示在 dialog 內', async ({ authedPage }) => {
    await stubQueue(authedPage, [REPORT_NO_URL]);
    await stubApi(authedPage, {
      path: `/api/admin/knowledge-reports/${REPORT_NO_URL.report_id}/reject`,
      method: 'POST',
      status: 500,
      body: { detail: '寫入失敗' },
    });
    await openAsAdmin(authedPage);

    await rowButton(authedPage, REPORT_NO_URL.question).click();
    const dialog = authedPage.getByRole('dialog');
    await dialog.getByRole('button', { name: t('adminKnowledgeReports.reject') }).click();

    await expect(dialog.getByText('寫入失敗')).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
