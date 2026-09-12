import { AUTH_TOKEN, expect, t, test } from './fixtures';

/**
 * 全域導覽：Header / Sidebar / BottomNav。
 *
 * 三者都用語意角色定位，不再綁 CSS class：
 *   Header    → <header>  = role banner
 *   Sidebar   → <aside>   = role complementary（僅 md 以上顯示）
 *   BottomNav → <nav aria-label="主要導覽"> = role navigation（僅 md 以下顯示）
 *
 * Sidebar 與 BottomNav 共用同一組 aria-label，但角色不同（list vs navigation），
 * 所以兩者不會互相命中。
 */

/** 桌面版側欄的項目，順序即畫面順序（非管理員） */
const SIDEBAR_ITEMS = [
  { labelKey: 'sidebar.home', path: '/' },
  { labelKey: 'sidebar.nearbyHospitals', path: '/nearby-hospitals' },
  { labelKey: 'sidebar.health', path: '/personalhealth' },
  { labelKey: 'sidebar.medications', path: '/medications' },
  { labelKey: 'sidebar.knowledgeReports', path: '/knowledge-reports' },
  { labelKey: 'sidebar.family', path: '/family' },
  { labelKey: 'sidebar.settings', path: '/settings' },
] as const;

/** 手機底部導覽的五個 tab */
const BOTTOM_TABS = [
  { labelKey: 'nav.home', path: '/' },
  { labelKey: 'nav.health', path: '/personalhealth' },
  { labelKey: 'nav.meds', path: '/medications' },
  { labelKey: 'nav.family', path: '/family' },
  { labelKey: 'nav.settings', path: '/settings' },
] as const;

test.describe('Header 頂部列', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/');
    await expect(authedPage.getByRole('banner')).toBeVisible();
  });

  test('顯示 CARE Logo', async ({ authedPage }) => {
    await expect(
      authedPage.getByRole('banner').getByRole('button', { name: 'CARE' }),
    ).toBeVisible();
  });

  test('點擊 Logo 導回首頁', async ({ authedPage }) => {
    await authedPage.goto('/personalhealth');
    await authedPage.getByRole('banner').getByRole('button', { name: 'CARE' }).click();
    await expect(authedPage).toHaveURL(/\/$/);
  });

  test('主題切換鈕會在淺色／深色之間翻轉', async ({ authedPage }) => {
    // Header 右側的 <nav> 裡只有這一顆按鈕
    const toggle = authedPage.getByRole('banner').getByRole('navigation').getByRole('button');

    const before = await toggle.getAttribute('aria-label');
    expect([t('header.themeToggleToLight'), t('header.themeToggleToDark')]).toContain(before);

    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-label', before!);
  });

  test('Header 不再提供登出（已移至設定頁）', async ({ authedPage }) => {
    await expect(
      authedPage.getByRole('banner').getByRole('button', { name: t('settings.logout') }),
    ).toHaveCount(0);
  });
});

test.describe('Sidebar 側邊導覽（桌面版面）', () => {
  // Sidebar 是 `hidden md:block`，手機視窗下不在無障礙樹裡，必須撐開視窗才測得到
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/');
  });

  test('列出全部項目，且當前頁面標記 aria-current', async ({ authedPage }) => {
    const sidebar = authedPage.getByRole('complementary');
    await expect(sidebar.getByRole('button')).toHaveCount(SIDEBAR_ITEMS.length);
    await expect(
      sidebar.getByRole('button', { name: t('sidebar.home') }),
    ).toHaveAttribute('aria-current', 'page');
  });

  for (const item of SIDEBAR_ITEMS.filter((i) => i.path !== '/')) {
    test(`點擊「${item.labelKey}」導向 ${item.path} 並標記為當前頁`, async ({ authedPage }) => {
      const sidebar = authedPage.getByRole('complementary');
      const button = sidebar.getByRole('button', { name: t(item.labelKey) });

      await button.click();
      await expect(authedPage).toHaveURL(new RegExp(`${item.path}$`));
      await expect(button).toHaveAttribute('aria-current', 'page');
    });
  }
});

test.describe('BottomNav 底部導覽（手機版面）', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/');
  });

  test('列出五個 tab，且當前頁面標記 aria-current', async ({ authedPage }) => {
    const bottomNav = authedPage.getByRole('navigation', {
      name: t('sidebar.mainNavAriaLabel'),
    });

    await expect(bottomNav.getByRole('button')).toHaveCount(BOTTOM_TABS.length);
    await expect(
      bottomNav.getByRole('button', { name: t('nav.home') }),
    ).toHaveAttribute('aria-current', 'page');
  });

  for (const tab of BOTTOM_TABS.filter((item) => item.path !== '/')) {
    test(`點擊「${tab.labelKey}」導向 ${tab.path} 並標記為當前頁`, async ({ authedPage }) => {
      const bottomNav = authedPage.getByRole('navigation', {
        name: t('sidebar.mainNavAriaLabel'),
      });
      const button = bottomNav.getByRole('button', { name: t(tab.labelKey) });

      await button.click();
      await expect(authedPage).toHaveURL(new RegExp(`${tab.path}$`));
      await expect(button).toHaveAttribute('aria-current', 'page');
    });
  }
});

test.describe('登出', () => {
  test('從設定頁登出會清掉 token 並回到登入頁', async ({ authedPage }) => {
    await authedPage.goto('/settings');

    await authedPage.getByRole('button', { name: t('settings.logout') }).click();

    await expect(authedPage).toHaveURL(/\/login(\?|$)/);
    await expect
      .poll(() => authedPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')))
      .toBeNull();
  });

  test('未登入時進入受保護頁面會被導到登入頁', async ({ anonymousPage }) => {
    await anonymousPage.goto('/personalhealth');
    await expect(anonymousPage).toHaveURL(/\/login(\?|$)/);
  });
});

test.describe('假登入狀態', () => {
  test('fixture 已在頁面腳本執行前寫入 token', async ({ authedPage }) => {
    await authedPage.goto('/');
    const token = await authedPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN'));
    expect(token).toBe(AUTH_TOKEN);
  });
});
