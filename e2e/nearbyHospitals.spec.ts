import type { Page } from '@playwright/test';

import { expect, t, test } from './fixtures';
import { FACILITIES, nearbyResponse, stubFacilitySearch, stubNearby } from './stubs';

/**
 * 附近醫院：兩種查詢方式（附近／名稱）、篩選條件如何進到 query string、
 * 結果卡片（距離／營業狀態／急診／撥號／導航）、後端事實如何變成說明句、
 * 空結果的三種原因、503 與其他失敗、定位被拒。
 *
 * 定位由 Playwright 的 context 假造，不需要真 GPS；營業狀態的分級判斷在後端，
 * 這裡只驗「後端說 open 就顯示營業中」。
 */

const TAIPEI = { latitude: 25.033, longitude: 121.5654 };

async function openPage(page: Page) {
  await page.goto('/nearby-hospitals');
  // lazy 頁面在多 worker 並行下偶爾超過 5 秒，放寬到 10 秒
  await expect(page.getByRole('heading', { name: t('nearby.title') })).toBeVisible({ timeout: 10000 });
}

const searchButton = (page: Page) => page.getByRole('button', { name: t('nearby.searchButton') });
const resultList = (page: Page) => page.getByRole('region', { name: t('nearby.listTitle') });

test.describe('附近搜尋（已授權定位）', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] });

  test('預設條件搜尋：不帶半徑、顯示目前位置、結果卡片有距離／狀態／撥號／導航', async ({ authedPage }) => {
    const calls = await stubNearby(authedPage, nearbyResponse(FACILITIES));
    await openPage(authedPage);

    await searchButton(authedPage).click();

    await expect(authedPage.getByText(t('nearby.currentLocation'))).toBeVisible();
    await expect(
      authedPage.getByText(t('nearby.coords', { lat: '25.03300', lng: '121.56540', accuracy: 0 })),
    ).toBeVisible();

    expect(calls).toHaveLength(1);
    const params = calls[0].url.searchParams;
    expect(params.get('lat')).toBe('25.033');
    expect(params.get('lng')).toBe('121.5654');
    // 半徑交給後端的階梯放寬，前端不得寫死
    expect(params.has('radius_meters')).toBe(false);
    expect(params.has('open_now')).toBe(false);
    expect(params.has('department')).toBe(false);

    const list = resultList(authedPage);
    await expect(list).toContainText(t('nearby.summary.foundWithin', { radiusKm: 5, count: 2 }));
    await expect(list).toContainText('象山中醫診所');
    await expect(list).toContainText('99 m');
    await expect(list).toContainText('1.2 km');
    await expect(list).toContainText(t('nearby.status.open'));
    // 午休中且設有急診：兩者並存
    await expect(list).toContainText(t('nearby.status.break'));
    await expect(list).toContainText(t('nearby.status.nextOpenToday', { time: '14:00' }));
    await expect(list).toContainText(t('nearby.status.emergency'));

    // 撥號：非數字要去掉；沒電話的院所沒有撥號鈕
    await expect(list.getByRole('link', { name: t('nearby.call') })).toHaveCount(1);
    await expect(list.getByRole('link', { name: t('nearby.call') })).toHaveAttribute('href', 'tel:0227201234');
    // 導航用座標而不是地址
    const navigate = list.getByRole('link', { name: t('nearby.navigate') });
    await expect(navigate).toHaveCount(2);
    await expect(navigate.first()).toHaveAttribute('href', /maps\/dir\/.*destination=25\.0297%2C121\.5603/);
  });

  test('篩選條件（類型、科別、營業中）以中文原文進 query string', async ({ authedPage }) => {
    const calls = await stubNearby(
      authedPage,
      nearbyResponse([FACILITIES[1]], {
        open_now_requested: true,
        department: { requested: '內科', canonical: '內科', is_alias: false },
        facility_type: { requested: '醫院', category: '醫院', is_alias: false },
      }),
    );
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('nearby.typeHospital') }).click();
    await authedPage.getByRole('button', { name: t('nearby.dept.internal') }).click();
    await authedPage.getByRole('switch').click();
    await searchButton(authedPage).click();

    await expect.poll(() => calls.length).toBe(1);
    const params = calls[0].url.searchParams;
    expect(params.get('facility_type')).toBe('醫院');
    expect(params.get('department')).toBe('內科');
    expect(params.get('open_now')).toBe('true');
    await expect(resultList(authedPage)).toContainText(
      t('nearby.summary.openNowFound', { count: 1 }),
    );
  });

  test('科別可自由輸入；後端回報別名對應時要誠實揭露', async ({ authedPage }) => {
    const calls = await stubNearby(
      authedPage,
      nearbyResponse(FACILITIES, {
        department: { requested: '腸胃科', canonical: '內科', is_alias: true },
      }),
    );
    await openPage(authedPage);

    await authedPage.locator('#department-input').fill('腸胃科');
    await searchButton(authedPage).click();

    await expect.poll(() => calls.map((c) => c.url.searchParams.get('department'))).toContain('腸胃科');
    await expect(resultList(authedPage)).toContainText(
      t('nearby.summary.departmentAlias', { requested: '腸胃科', canonical: '內科' }),
    );
  });

  test('放寬範圍才湊滿、以及湊不滿，說明句分別報最遠距離與搜尋上限', async ({ authedPage }) => {
    await stubNearby(
      authedPage,
      nearbyResponse(FACILITIES, { expanded: true, reached_meters: 20000, furthest_meters: 12600 }),
    );
    await openPage(authedPage);
    await searchButton(authedPage).click();
    await expect(resultList(authedPage)).toContainText(
      t('nearby.summary.expanded', { radiusKm: 13, count: 2 }),
    );

    await stubNearby(
      authedPage,
      nearbyResponse([FACILITIES[0]], { satisfied: false, reached_meters: 50000 }),
    );
    await searchButton(authedPage).click();
    await expect(resultList(authedPage)).toContainText(
      t('nearby.summary.partial', { radiusKm: 50, count: 1 }),
    );
  });

  test('搜尋中按鈕停用並顯示搜尋中', async ({ authedPage }) => {
    await stubNearby(authedPage, nearbyResponse(FACILITIES), { delayMs: 1500 });
    await openPage(authedPage);

    await searchButton(authedPage).click();

    const busy = authedPage.getByRole('button', { name: t('nearby.searching') });
    await expect(busy).toBeDisabled();
    await expect(searchButton(authedPage)).toBeEnabled({ timeout: 5000 });
  });

  test('查無結果時依原因說明：範圍內沒有、看不懂科別、藥局收錄有限', async ({ authedPage }) => {
    await stubNearby(authedPage, nearbyResponse([]));
    await openPage(authedPage);
    await searchButton(authedPage).click();
    await expect(authedPage.getByText(t('nearby.emptyTitle'))).toBeVisible();
    await expect(authedPage.getByText(t('nearby.empty.none', { radiusKm: 50 }))).toBeVisible();

    await stubNearby(authedPage, nearbyResponse([], { unresolved_department: '塔羅科' }));
    await searchButton(authedPage).click();
    await expect(
      authedPage.getByText(t('nearby.empty.unknownDepartment', { department: '塔羅科' })),
    ).toBeVisible();

    await stubNearby(
      authedPage,
      nearbyResponse([], { facility_type: { requested: '藥局', category: '藥局', is_alias: false } }),
    );
    await searchButton(authedPage).click();
    await expect(authedPage.getByText(t('nearby.empty.pharmacyNone', { radiusKm: 50 }))).toBeVisible();
  });

  test('服務暫停（503）顯示專屬訊息；其他失敗顯示狀態碼', async ({ authedPage }) => {
    await stubNearby(authedPage, { status: 503 });
    await openPage(authedPage);
    await searchButton(authedPage).click();
    await expect(authedPage.getByText('醫療院所查詢暫時不可用，請稍後再試')).toBeVisible();

    await stubNearby(authedPage, { status: 500 });
    await searchButton(authedPage).click();
    await expect(authedPage.getByText('搜尋附近醫院失敗：500')).toBeVisible();
    await expect(authedPage.getByText('醫療院所查詢暫時不可用，請稍後再試')).toHaveCount(0);
  });
});

test.describe('依名稱查詢', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] });

  async function openNameTab(page: Page) {
    await openPage(page);
    await page.getByRole('tab', { name: t('nearby.tabByName') }).click();
    await expect(page.locator('#keyword-input')).toBeVisible();
  }

  test('空白關鍵字不送出並提示', async ({ authedPage }) => {
    const calls = await stubFacilitySearch(authedPage, { facilities: FACILITIES });
    await openNameTab(authedPage);

    await authedPage.getByRole('button', { name: t('nearby.keywordButton') }).click();

    await expect(authedPage.getByText(t('nearby.keywordRequired'))).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  test('關鍵字查詢：未定位時不帶座標；有更多相符時提示縮小範圍', async ({ authedPage }) => {
    const calls = await stubFacilitySearch(authedPage, {
      facilities: [FACILITIES[1]],
      total_count: 12,
    });
    await openNameTab(authedPage);

    await authedPage.locator('#keyword-input').fill('北醫');
    await authedPage.getByRole('button', { name: t('nearby.keywordButton') }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].url.searchParams.get('keyword')).toBe('北醫');
    expect(calls[0].url.searchParams.has('lat')).toBe(false);

    const list = authedPage.getByRole('region', { name: t('nearby.nameResultTitle') });
    await expect(list).toContainText('臺北醫學大學附設醫院');
    await expect(list).toContainText(t('nearby.nameResultMore', { total: 12, count: 1 }));
  });

  test('先定位過再查名稱會帶座標，查無結果顯示名稱專屬空狀態', async ({ authedPage }) => {
    await stubNearby(authedPage, nearbyResponse(FACILITIES));
    const calls = await stubFacilitySearch(authedPage, { facilities: [] });
    await openPage(authedPage);
    await searchButton(authedPage).click();
    await expect(authedPage.getByText(t('nearby.currentLocation'))).toBeVisible();

    await authedPage.getByRole('tab', { name: t('nearby.tabByName') }).click();
    await authedPage.locator('#keyword-input').fill('不存在的醫院');
    await authedPage.getByRole('button', { name: t('nearby.keywordButton') }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].url.searchParams.get('lat')).toBe('25.033');
    await expect(authedPage.getByText(t('nearby.nameEmpty'))).toBeVisible();
    // 換一種查詢方式時要清掉另一種的結果
    await expect(authedPage.getByRole('region', { name: t('nearby.listTitle') })).toHaveCount(0);
  });
});

test.describe('定位被拒', () => {
  test.use({ permissions: [] });

  test('顯示權限被拒的說明，且不會打 API', async ({ authedPage }) => {
    const calls = await stubNearby(authedPage, nearbyResponse(FACILITIES));
    await openPage(authedPage);

    await searchButton(authedPage).click();

    await expect(authedPage.getByText(t('nearby.hintPermission'))).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(t('nearby.currentLocation'))).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });
});
