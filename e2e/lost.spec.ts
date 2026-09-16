import type { Page } from '@playwright/test';

import { expect, t, test } from './fixtures';
import { stubApi } from './stubs';

/**
 * 走失求救的兩個頁面在真瀏覽器裡的樣子：定位由 Playwright 假造、API 全部 stub、
 * 地圖圖磚回空白圖，不連外部圖磚伺服器。
 *
 * 真實 LINE WebView 裡的持續定位、鎖屏後停止、螢幕常亮只能在真機驗
 * （docs/manual-test-checklist.md）。
 */

const TAIPEI = { latitude: 25.0339, longitude: 121.5645 };

/** 1×1 透明 PNG：圖磚請求一律回它，測試不依賴外部網路 */
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64',
);

async function stubTiles(page: Page) {
  await page.route(/wmts\.nlsc\.gov\.tw/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }),
  );
}

const ACTIVE_SELF = {
  active: true,
  status: 'active',
  started_at: '2026-09-16T08:00:00Z',
  ended_at: null,
};

test.describe('長輩定位頁', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] });

  test('打開就上傳位置，沒有導覽列，可以撥 110', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/lost/me', body: ACTIVE_SELF });
    const uploads = await stubApi(authedPage, {
      path: '/api/lost/me/location',
      method: 'POST',
      body: ACTIVE_SELF,
    });

    await authedPage.goto('/lost/share');

    await expect(authedPage.getByRole('heading', { name: t('lost.share.title') })).toBeVisible({
      timeout: 10000,
    });
    await expect.poll(() => uploads.length).toBeGreaterThan(0);
    expect(uploads[0].body).toMatchObject({ latitude: 25.0339, longitude: 121.5645 });
    await expect(
      authedPage.getByText(t('lost.share.lastSent', { time: t('lost.time.justNow') })),
    ).toBeVisible();
    await expect(authedPage.getByRole('link', { name: t('lost.share.call110') })).toHaveAttribute(
      'href',
      'tel:110',
    );
    // 獨立頁：長輩不會誤點導覽列離開定位頁
    await expect(authedPage.getByRole('navigation')).toHaveCount(0);
  });

  test('按「我已經安全了」並確認後結束', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/lost/me', body: ACTIVE_SELF });
    await stubApi(authedPage, { path: '/api/lost/me/location', method: 'POST', body: ACTIVE_SELF });
    const ends = await stubApi(authedPage, {
      path: '/api/lost/me/end',
      method: 'POST',
      body: { ended: true, status: 'safe' },
    });

    await authedPage.goto('/lost/share');
    await authedPage.getByRole('button', { name: t('lost.share.safeButton') }).click({ timeout: 10000 });
    await authedPage.getByRole('button', { name: t('lost.share.safeConfirm') }).click();

    await expect(authedPage.getByText(t('lost.share.endedSafe'))).toBeVisible();
    expect(ends).toHaveLength(1);
  });
});

test.describe('長輩定位頁（沒允許定位）', () => {
  test.use({ permissions: [] });

  test('請他回聊天室改傳一次位置，不上傳', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/lost/me', body: ACTIVE_SELF });
    const uploads = await stubApi(authedPage, {
      path: '/api/lost/me/location',
      method: 'POST',
      body: ACTIVE_SELF,
    });

    await authedPage.goto('/lost/share');

    await expect(authedPage.getByText(t('lost.share.permissionTitle'))).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(t('lost.share.permissionBody'))).toBeVisible();
    expect(uploads).toHaveLength(0);
  });
});

function sessionBody(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    session_id: 's1',
    status: 'active',
    intent: 'lost',
    patient_name: '林秀琴',
    patient_words: '我迷路了，旁邊有一間全聯',
    started_at: now,
    auto_end_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    ended_at: null,
    ended_by_name: null,
    last_location: {
      latitude: 25.0339,
      longitude: 121.5645,
      accuracy: 24,
      source: 'liff',
      received_at: now,
    },
    last_seen_at: now,
    stale: false,
    stale_after_seconds: 180,
    trail: [
      { latitude: 25.0331, longitude: 121.5638, at: now },
      { latitude: 25.0335, longitude: 121.5642, at: now },
      { latitude: 25.0339, longitude: 121.5645, at: now },
    ],
    server_time: now,
    ...overrides,
  };
}

test.describe('家人地圖頁', () => {
  test('地圖、原話、導航，按已找到後停止', async ({ authedPage }) => {
    await stubTiles(authedPage);
    let status = 'active';
    await stubApi(authedPage, {
      path: '/api/lost/Uelder',
      respond: () => ({
        status: 200,
        body: sessionBody(status === 'found' ? { status, ended_by_name: '陳志明' } : {}),
      }),
    });
    const found = await stubApi(authedPage, {
      path: '/api/lost/Uelder/found',
      method: 'POST',
      respond: () => {
        status = 'found';
        return { status: 200, body: { ended: true, status: 'found' } };
      },
    });

    await authedPage.goto('/lost/watch?user=Uelder');

    await expect(
      authedPage.getByRole('heading', { name: t('lost.watch.title', { name: '林秀琴' }) }),
    ).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText('我迷路了，旁邊有一間全聯')).toBeVisible();
    const map = authedPage.getByRole('region', { name: t('lost.watch.mapLabel', { name: '林秀琴' }) });
    await expect(map).toBeVisible();
    // Leaflet 真的畫出了路線與目前位置
    await expect(map.locator('path.leaflet-interactive')).toHaveCount(3);
    await expect(authedPage.getByRole('link', { name: t('lost.watch.navigate') })).toHaveAttribute(
      'href',
      /destination=25\.0339%2C121\.5645/,
    );

    await authedPage.getByRole('button', { name: t('lost.watch.foundButton') }).click();
    await authedPage.getByRole('button', { name: t('lost.watch.foundConfirm') }).click();

    await expect(
      authedPage.getByText(t('lost.watch.endedFound', { finder: '陳志明', name: '林秀琴' })),
    ).toBeVisible();
    expect(found).toHaveLength(1);
    await expect(authedPage.getByRole('button', { name: t('lost.watch.foundButton') })).toHaveCount(0);
  });

  test('沒有權限的人看不到', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/lost/Uelder', status: 403, body: { detail: 'x' } });

    await authedPage.goto('/lost/watch?user=Uelder');

    await expect(authedPage.getByText(t('lost.watch.forbidden'))).toBeVisible({ timeout: 10000 });
  });
});
