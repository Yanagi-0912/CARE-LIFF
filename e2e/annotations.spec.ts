import type { Page } from '@playwright/test';
import { test, expect, stubProfileApi, t } from './fixtures';
import { stubApi } from './stubs';
import type { AnnotationSession } from '../src/api/annotationsApi';

async function stubAnnotations(page: Page) {
  await stubProfileApi(page, { name: '研究同學', role: 'admin' });
  await stubApi(page, { path: '/api/admin/annotations', body: [
    { id: 'health', title: '健康相關標註', description: '判斷 LINE 轉傳訊息是否與健康醫療相關。', question_count: 1720, total_count: 1740 },
    { id: 'claim-pairs', title: '主張配對標註', description: '判斷使用者的說法與查核報告是否在講同一件事。', question_count: 340, total_count: 360 },
  ] });
  const state: AnnotationSession = {
    task: 'health', title: '健康相關標註', annotator: '研究同學', annotator_id: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64), version: 'health-annotator-1', hash_key: 'samples_sha256', pilot: 100,
    started_at: '2026-10-29T00:00:00Z', revision: 0, position: 0, answers: {},
    items: [
      { id: '1', t: '【健康提醒】網路轉傳「每天喝熱檸檬水就能預防癌症」，親友提醒大家趕快分享。這個說法到底有沒有根據？' },
      { id: '2', t: '第二則訊息：長庚新院區要搭哪一路公車？' },
    ], order: [{ id: '1', retest: false }, { id: '2', retest: false }],
  };
  await stubApi(page, { path: '/api/admin/annotations/health/session', respond: () => ({ status: 200, body: state }) });
  const saves = await stubApi(page, {
    path: '/api/admin/annotations/health/answers/0', method: 'PUT', respond: call => {
      const body = call.body as { label: 0 | 1 | null; unsure: boolean; note: string; ms: number };
      const answer = { ...body, id: '1', retest: false, at: '2026-10-29T01:00:00Z', edits: 0 };
      state.answers['0'] = answer;
      state.position = 1;
      state.revision = 1;
      return { status: 200, body: { revision: 1, position: 1, answer } };
    },
  });
  return saves;
}

test('管理員在手機標註、保存備註並重新進入接續，不要求輸入姓名', async ({ authedPage: page }, testInfo) => {
  const saves = await stubAnnotations(page);
  await page.goto('/admin/annotations');
  await expect(page.getByRole('heading', { name: t('sidebar.annotations'), exact: true })).toBeVisible();
  await page.getByRole('button', { name: '開始／繼續健康相關標註' }).click();
  await expect(page.getByText('標註者：研究同學（目前登入帳號）')).toBeVisible();
  await expect(page.getByPlaceholder(/你的名字/)).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
  await page.locator('main').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)); });
  await page.screenshot({ path: testInfo.outputPath('annotation-mobile.png'), fullPage: true });
  await page.getByLabel('備註（選填）').fill('這是在討論健康效果。');
  await page.getByRole('button', { name: '健康相關（J）', exact: true }).click();
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeInViewport();
  expect(saves).toHaveLength(1);
  expect(saves[0].body).toMatchObject({ label: 1, note: '這是在討論健康效果。' });
  expect(saves[0].body).not.toHaveProperty('annotator');
  await page.reload();
  await page.getByRole('button', { name: '開始／繼續健康相關標註' }).click();
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
});

test('桌面管理員可以從側欄進入標記頁面', async ({ authedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubAnnotations(page);
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: t('sidebar.annotations') }).click();
  await expect(page).toHaveURL(/\/admin\/annotations$/);
  await page.getByRole('button', { name: '開始／繼續健康相關標註' }).click();
  await expect(page.getByText('標註者：研究同學（目前登入帳號）')).toBeVisible();
  await page.locator('main').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)); });
  await page.screenshot({ path: testInfo.outputPath('annotation-desktop.png'), fullPage: true });
});

test('一般帳號看不到標記入口，也不能直接開啟頁面', async ({ authedPage: page }) => {
  await stubProfileApi(page, { name: '一般使用者', role: 'user' });
  await page.goto('/');
  await expect(page.getByTestId('home-features')).toBeVisible();
  await expect(page.getByRole('button', { name: t('sidebar.annotations'), exact: true })).toHaveCount(0);
  await page.goto('/admin/annotations');
  await expect(page.getByRole('heading', { name: t('sidebar.annotations'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '開始／繼續健康相關標註' })).toHaveCount(0);
});
