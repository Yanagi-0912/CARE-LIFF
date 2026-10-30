import type { Page } from '@playwright/test';
import { test, expect, stubProfileApi, t } from './fixtures';
import { stubApi } from './stubs';
import type { AnnotationSession, AnnotationTaskId } from '../src/api/annotationsApi';

async function stubAnnotations(page: Page, options: { task?: AnnotationTaskId; long?: boolean; failFirst?: boolean } = {}) {
  const task = options.task ?? 'health';
  await stubProfileApi(page, { name: '研究同學', role: 'admin' });
  await stubApi(page, { path: '/api/admin/annotations', body: [
    { id: 'health', title: '健康相關標註', description: '判斷 LINE 轉傳訊息是否與健康醫療相關。', question_count: 1720, total_count: 1740 },
    { id: 'claim-pairs', title: '主張配對標註', description: '判斷使用者的說法與查核報告是否在講同一件事。', question_count: 340, total_count: 360 },
  ] });
  const state: AnnotationSession = {
    task, title: task === 'health' ? '健康相關標註' : '主張配對標註', annotator: '研究同學', annotator_id: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64), version: task === 'health' ? 'health-annotator-1' : 'claim-annotator-1',
    hash_key: task === 'health' ? 'samples_sha256' : 'dataset_sha256', pilot: 100,
    started_at: '2026-10-29T00:00:00Z', revision: 0, position: 0, answers: {},
    items: task === 'health' ? [
      { id: '1', t: options.long ? '這是很長的轉傳訊息，請捲動閱讀。\n'.repeat(80) : '【健康提醒】網路轉傳「每天喝熱檸檬水就能預防癌症」，親友提醒大家趕快分享。這個說法到底有沒有根據？' },
      { id: '2', t: '第二則訊息：長庚新院區要搭哪一路公車？' },
    ] : [{ id: '1', u: '喝檸檬水可以預防癌症', r: '【錯誤】喝檸檬水可預防癌症？' }, { id: '2', u: '下一個說法', r: '下一篇報告' }],
    order: [{ id: '1', retest: false }, { id: '2', retest: false }],
  };
  await stubApi(page, { path: `/api/admin/annotations/${task}/session`, respond: () => ({ status: 200, body: state }) });
  let failures = options.failFirst ? 1 : 0;
  const saves = await stubApi(page, {
    path: `/api/admin/annotations/${task}/answers/0`, method: 'PUT', respond: call => {
      if (failures-- > 0) return { status: 503, body: { detail: '連線暫時中斷' } };
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

async function openTask(page: Page, task = '健康相關標註') {
  await page.goto('/admin/annotations');
  await page.getByRole('button', { name: `開始／繼續${task}` }).click();
  await expect(page.getByRole('group', { name: '標註卡片' })).toBeVisible();
  await page.locator('main').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)); });
}

async function swipe(page: Page, dx: number, dy = 0, zone = false, touch = false) {
  const target = zone ? page.locator('[data-swipe-zone]') : page.getByRole('group', { name: '標註卡片' });
  const box = await target.boundingBox();
  if (!box) throw new Error('找不到標註卡片');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 10, y: y + dy * step / 10 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await page.mouse.up();
  }
}

test('手機直接右滑標註，備註與匯出收起，重新進入接續', async ({ authedPage: page }, testInfo) => {
  const saves = await stubAnnotations(page);
  await openTask(page);
  await expect(page.getByRole('button', { name: '健康相關（J）', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: '匯出我的結果' })).toHaveCount(0);
  await expect(page.getByPlaceholder(/你的名字/)).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
  await expect(page.locator('[data-swipe-zone]')).toBeInViewport();
  const noteButton = await page.getByRole('button', { name: '補充備註' }).boundingBox();
  const nav = await page.getByRole('navigation', { name: t('sidebar.mainNavAriaLabel') }).boundingBox();
  expect(noteButton && nav && noteButton.y + noteButton.height <= nav.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('annotation-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '補充備註' }).click();
  await page.getByLabel('備註（選填）').fill('這是在討論健康效果。');
  await page.getByRole('button', { name: '回到卡片' }).click();
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  await swipe(page, 135, 0, false, testInfo.project.name.includes('chrome'));
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeInViewport();
  expect(saves).toHaveLength(1);
  expect(saves[0].body).toMatchObject({ label: 1, note: '這是在討論健康效果。' });
  expect(saves[0].body).not.toHaveProperty('annotator');
  await page.reload();
  await page.getByRole('button', { name: '開始／繼續健康相關標註' }).click();
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
});

test('左滑為無關，短滑動與取消手勢不送出', async ({ authedPage: page }) => {
  const saves = await stubAnnotations(page);
  await openTask(page);
  await swipe(page, -25);
  expect(saves).toHaveLength(0);
  const card = page.getByRole('group', { name: '標註卡片' });
  await card.dispatchEvent('pointerdown', { pointerId: 50, isPrimary: true, button: 0, clientX: 180, clientY: 300 });
  await card.dispatchEvent('pointercancel', { pointerId: 50 });
  expect(saves).toHaveLength(0);
  await swipe(page, -135);
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  expect(saves[0].body).toMatchObject({ label: 0 });
});

test('健康分類從底部上滑標成無法判斷', async ({ authedPage: page }, testInfo) => {
  const saves = await stubAnnotations(page);
  await openTask(page);
  await swipe(page, 0, -120, true, testInfo.project.name.includes('chrome'));
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  expect(saves[0].body).toMatchObject({ label: null });
});

test('長文可以直向捲動，閱讀不會觸發標記', async ({ authedPage: page }, testInfo) => {
  const saves = await stubAnnotations(page, { long: true });
  await openTask(page);
  const content = page.getByTestId('annotation-card-content');
  if (testInfo.project.name.includes('chrome')) await swipe(page, 0, -130, false, true);
  else {
    // Playwright 的 mobile WebKit 沒有原生 wheel／touchMove 介面。
    // 先驗證直向拖動不標記，再確認內容區可獨立捲動。
    await swipe(page, 0, -130);
    await content.evaluate(el => { el.scrollTop = 240; });
  }
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
  expect(saves).toHaveLength(0);
  await expect(page.locator('[data-swipe-zone]')).toBeInViewport();
  await swipe(page, 135);
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0);
});

test('連線失敗保留卡片，可再次滑動重試', async ({ authedPage: page }) => {
  const saves = await stubAnnotations(page, { failFirst: true });
  await openTask(page);
  await swipe(page, 135);
  await expect(page.getByRole('alert')).toContainText('連線暫時中斷');
  await expect(page.getByText(/【健康提醒】網路轉傳/)).toBeVisible();
  await swipe(page, 135);
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  expect(saves).toHaveLength(2);
});

test('主張配對也能直接滑卡片作答', async ({ authedPage: page }, testInfo) => {
  const saves = await stubAnnotations(page, { task: 'claim-pairs' });
  await openTask(page, '主張配對標註');
  await expect(page.getByText('喝檸檬水可以預防癌症', { exact: true })).toBeVisible();
  await expect(page.getByText('【錯誤】喝檸檬水可預防癌症？', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('annotation-claims-mobile.png'), fullPage: true });
  await swipe(page, -135);
  await expect(page.getByText('下一個說法')).toBeVisible();
  expect(saves[0].body).toMatchObject({ label: 0 });
});

test('更多選項保留規則、帳號、次要匯出與點選作答', async ({ authedPage: page }) => {
  const saves = await stubAnnotations(page);
  await openTask(page);
  await page.getByRole('button', { name: '更多選項' }).click();
  await expect(page.getByText('標註者：研究同學')).toBeVisible();
  await expect(page.getByText('分析備份用；答案已自動儲存，不需匯出。')).toBeVisible();
  await page.getByLabel('改用點選作答').check();
  await page.getByRole('button', { name: '關閉' }).click();
  await page.getByRole('button', { name: '健康相關（J）', exact: true }).click();
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  expect(saves[0].body).toMatchObject({ label: 1 });
});

test('桌面側欄入口與鍵盤操作仍可使用', async ({ authedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const saves = await stubAnnotations(page);
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: t('sidebar.annotations') }).click();
  await page.getByRole('button', { name: '開始／繼續健康相關標註' }).click();
  await expect(page.getByRole('button', { name: '健康相關（J）', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('annotation-desktop.png'), fullPage: true });
  await page.keyboard.press('j');
  await expect(page.getByText('第二則訊息：長庚新院區要搭哪一路公車？')).toBeVisible();
  expect(saves).toHaveLength(1);
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
