import type { Page } from '@playwright/test';

import { expect, t, test } from './fixtures';
import { FACILITIES, stubNearby } from './stubs';

/**
 * 附近醫院：定位授權後搜尋、結果列表（距離／電話／地圖連結）、
 * 空結果、503 與其他失敗、定位被拒的提示。
 *
 * 定位由 Playwright 的 context 假造（geolocation + permissions），
 * 不需要真 GPS；LINE WebView 的權限限制只能真機驗（見 docs/manual-test-checklist.md）。
 */

const TAIPEI = { latitude: 25.033, longitude: 121.5654 };

async function openPage(page: Page) {
  await page.goto('/nearby-hospitals');
  await expect(page.getByRole('heading', { name: t('nearby.title') })).toBeVisible();
}

async function search(page: Page) {
  const input = page.getByRole('search').getByRole('searchbox');
  await input.click();
  await input.press('Enter');
}

test.describe('已授權定位', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] });

  test('搜尋後顯示目前位置與院所清單，含距離、電話與地圖連結', async ({ authedPage }) => {
    const calls = await stubNearby(authedPage, FACILITIES);
    await openPage(authedPage);

    await search(authedPage);

    await expect(authedPage.getByText(t('nearby.currentLocation'))).toBeVisible();
    await expect(
      authedPage.getByText(
        t('nearby.coords', { lat: '25.03300', lng: '121.56540', accuracy: 0 }),
      ),
    ).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get('lat')).toBe('25.033');
    expect(calls[0].url.searchParams.get('lng')).toBe('121.5654');
    expect(calls[0].url.searchParams.get('radius_meters')).toBe('5000');

    const list = authedPage.getByRole('region', { name: t('nearby.listTitle') });
    await expect(list).toContainText('象山中醫診所');
    await expect(list).toContainText('99 m');
    await expect(list).toContainText('1.2 km');
    await expect(list.getByRole('link', { name: '(02)27201234' })).toHaveAttribute(
      'href',
      'tel:(02)27201234',
    );
    await expect(list.getByRole('link', { name: t('nearby.openMap') })).toHaveCount(2);
    await expect(list.getByRole('link', { name: t('nearby.openMap') }).first()).toHaveAttribute(
      'href',
      /google\.com\/maps\/search/,
    );
  });

  test('搜尋中輸入框停用並顯示搜尋中', async ({ authedPage }) => {
    await stubNearby(authedPage, FACILITIES, { delayMs: 1500 });
    await openPage(authedPage);

    await search(authedPage);

    const input = authedPage.getByRole('search').getByRole('searchbox');
    await expect(input).toBeDisabled();
    await expect(input).toHaveAttribute('placeholder', t('nearby.searching'));
    await expect(input).toBeEnabled({ timeout: 5000 });
  });

  test('附近沒有院所時顯示空狀態', async ({ authedPage }) => {
    await stubNearby(authedPage, []);
    await openPage(authedPage);

    await search(authedPage);

    await expect(authedPage.getByText(t('nearby.emptyTitle'))).toBeVisible();
    await expect(authedPage.getByText(t('nearby.emptyDesc'))).toBeVisible();
  });

  test('服務暫停（503）顯示專屬訊息；其他失敗顯示狀態碼', async ({ authedPage }) => {
    await stubNearby(authedPage, { status: 503 });
    await openPage(authedPage);
    await search(authedPage);
    await expect(authedPage.getByText('醫療院所查詢暫時不可用，請稍後再試')).toBeVisible();

    await stubNearby(authedPage, { status: 500 });
    await search(authedPage);
    await expect(authedPage.getByText('搜尋附近醫院失敗：500')).toBeVisible();
    await expect(authedPage.getByText('醫療院所查詢暫時不可用，請稍後再試')).toHaveCount(0);
  });
});

test.describe('定位被拒', () => {
  test.use({ permissions: [] });

  test('顯示權限被拒的說明，且不會打 API', async ({ authedPage }) => {
    const calls = await stubNearby(authedPage, FACILITIES);
    await openPage(authedPage);

    await search(authedPage);

    await expect(authedPage.getByText(t('nearby.hintPermission'))).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(t('nearby.currentLocation'))).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });
});
