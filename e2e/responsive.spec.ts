import type { Page } from '@playwright/test';

import { expect, stubProfileApi, t, test } from './fixtures';
import {
  FACILITIES,
  FAMILY_MEMBERS,
  KNOWLEDGE_REPORTS,
  RAW_MESSAGES,
  SUMMARIES,
  medication,
  reminder,
  stubConsultations,
  stubFamily,
  stubKnowledgeReports,
  stubNearby,
  stubReminderList,
  stubSettings,
} from './stubs';

/**
 * 有資料時的版面。accessibility.spec 巡的是空狀態（fixture 兜底 404），
 * 但真正會撐破版面的是長藥名、長問題、多筆卡片——這裡補上「有資料」的那一半。
 *
 * 三種寬度 × 最大字級；另外驗 dialog 在 375px 手機直式下不超出視窗。
 */

const LONG_NAME = 'ANROKIN TABLETS (CHLORZOXAZONE) 250MG 超長藥名測試用';

async function stubWithData(page: Page) {
  await stubProfileApi(page, { name: '王大明', gender: 'male', age: 72 });
  await stubFamily(page, [
    ...FAMILY_MEMBERS,
    { user_id: 'Ulong', relationship_type: 'grandparent', display_name: '一個名字很長很長很長的家人成員' },
  ]);
  await stubSettings(page, {}, { prescriptionScanEnabled: true });
  await stubReminderList(page, [
    reminder({
      id: 'r1',
      slot_type: 'morning',
      end_date: '2026-12-31',
      medications: [
        medication({ id: 'm1', name: LONG_NAME, shape: '橢圓形', color: '白色', mark_one: 'PBF 436' }),
        medication({ id: 'm2', name: 'METFORMIN 500MG' }),
      ],
    }),
    reminder({ id: 'r2', slot_type: 'bedtime', scheduled_time: '21:30', enabled: false }),
  ]);
  await stubKnowledgeReports(page, [
    ...KNOWLEDGE_REPORTS,
    {
      ...KNOWLEDGE_REPORTS[0],
      report_id: 'long',
      question: '這是一個非常非常長的問題，用來測試在手機直式最大字級下是否會把卡片撐破而造成橫向捲動？',
      user_source_urls: ['https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=1234567890&pid=0987654321'],
    },
  ]);
  await stubConsultations(page, { summaries: SUMMARIES, raw: RAW_MESSAGES });
  await stubNearby(page, FACILITIES);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * 已知的版面問題（特大字級 24px 下量到的）。修好後對應的測試會從 fail 變 pass，
 * Playwright 會把「預期失敗卻通過」標成失敗，提醒把這裡的項目拿掉。
 */
const KNOWN_OVERFLOW = [
  {
    path: '/medications',
    width: 375,
    reason: '提醒卡片的「08:00」(text-2xl) + 時段徽章 + 84px 開關欄的 min-content 超過 375px，頁面多 5px 橫向捲動；藥名欄被壓到每行 4 字、日期範圍被省略號截斷',
  },
  {
    path: '/knowledge-reports',
    width: 768,
    reason: '篩選 TabsList 在 ≥640px 改為 w-fit，四個分頁+徽章寬 526px 超出側欄旁的內容欄，與排序 Select 重疊並撐出 22px 橫向捲動',
  },
  {
    path: '/personalhealth/consult',
    width: 768,
    reason: '底部「下載所有摘要」「返回個人健康資料」在 sm 以上改成 flex-row 但不換行，內容欄放不下時溢出 4px',
  },
] as const;

const VIEWPORTS = [
  { name: '手機直式 375px', width: 375, height: 667 },
  { name: '平板 768px', width: 768, height: 1024 },
  { name: '桌面 1280px', width: 1280, height: 900 },
] as const;

const PAGES = [
  { path: '/medications', ready: (p: Page) => p.getByText(LONG_NAME) },
  { path: '/family', ready: (p: Page) => p.getByText(FAMILY_MEMBERS[0].display_name) },
  { path: '/knowledge-reports', ready: (p: Page) => p.getByText('糖尿病患者的飲食建議') },
  { path: '/personalhealth/consult', ready: (p: Page) => p.locator('#summary-select') },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const { path, ready } of PAGES) {
      test(`${path} 有資料且字級最大時不橫向溢出`, async ({ authedPage }) => {
        const known = KNOWN_OVERFLOW.find((k) => k.path === path && k.width === viewport.width);
        if (known) test.fail(true, `已知版面問題：${known.reason}`);
        await authedPage.addInitScript(() => {
          localStorage.setItem('care-settings', JSON.stringify({ language: 'zh-TW', fontSize: 'xlarge' }));
        });
        await stubWithData(authedPage);

        await authedPage.goto(path);
        await expect(ready(authedPage).first()).toBeVisible();

        expect(await overflow(authedPage), `${path} 在 ${viewport.name} 溢出`).toBe(0);
      });
    }
  });
}

test.describe('手機直式 375px 的 dialog', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ authedPage }) => {
    await authedPage.addInitScript(() => {
      localStorage.setItem('care-settings', JSON.stringify({ language: 'zh-TW', fontSize: 'xlarge' }));
    });
    await stubWithData(authedPage);
  });

  async function expectDialogFits(page: Page) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667 + 1);
  }

  test('新增用藥提醒表單：整個 dialog 在視窗內，底部按鈕看得到', async ({ authedPage }) => {
    await authedPage.goto('/medications');
    await authedPage.getByRole('button', { name: t('meds.addButton') }).click();

    await expectDialogFits(authedPage);
    await expect(
      authedPage.getByRole('dialog').getByRole('button', { name: t('meds.add.submit') }),
    ).toBeInViewport();
  });

  test('編輯用藥提醒表單：刪除／取消／儲存三顆按鈕都在視窗內', async ({ authedPage }) => {
    await authedPage.goto('/medications');
    await authedPage.getByText('08:00').first().click();

    await expectDialogFits(authedPage);
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: t('meds.edit.save') })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: t('meds.edit.delete') })).toBeInViewport();
  });

  test('知識回報表單 dialog 在視窗內', async ({ authedPage }) => {
    // 已知 bug：ReportFormDialog 沒有像其他 dialog 那樣設 max-h-[calc(100dvh-2rem)]
    // 與內容區捲動，特大字級下高 791px > 667px，置中後標題與關閉鈕跑到視窗上方。
    test.fail(true, '已知 bug：回報表單 dialog 沒有限高，特大字級在 375px 手機上被切掉');
    await authedPage.goto('/knowledge-reports/new');
    await expectDialogFits(authedPage);
  });

  test('知識回報詳情 dialog 在視窗內', async ({ authedPage }) => {
    await authedPage.goto('/knowledge-reports');
    await authedPage
      .getByRole('button', {
        name: t('knowledgeReports.viewReport', { question: '高血壓可以喝咖啡嗎？' }),
      })
      .click();
    await expectDialogFits(authedPage);
  });
});
