import { test, expect } from '@playwright/test';

test.describe('全域導覽列組件測試 (Header, Sidebar, BottomNav)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => {
      localStorage.setItem('CARE_AUTH_TOKEN', 'mock-test-token-123');
    });
    await page.goto('http://localhost:5173/');
    await expect(page.locator('header.app-header')).toBeVisible();
  });

  test.describe('Header 頂部導覽列', () => {
    test('應該包含 Logo 與登入按鈕', async ({ page }) => {
      await expect(page.locator('h1.header-logo')).toBeVisible();
      await expect(page.locator('button.login-btn')).toBeVisible();
    });

    test('點擊 Logo 應該導回首頁', async ({ page }) => {
      await page.goto('http://localhost:5173/personalhealth');
      await page.locator('h1.header-logo').click();
      await expect(page).toHaveURL('http://localhost:5173/');
    });

    test('點擊「登出」按鈕，應該清除 Token 並導回登入頁', async ({ page }) => {
      const logoutBtn = page.locator('button.login-btn');
      await expect(logoutBtn).toContainText(/登出|登入/);
      await logoutBtn.click();

      await expect(page).toHaveURL(/.*\/login/);
      const token = await page.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN'));
      expect(token).toBeNull();
    });
  });

  test.describe('Sidebar 側邊導覽列', () => {
    test('點擊選單應正確跳轉，並且當前頁面的按鈕應獲得 aria-current', async ({ page }) => {
      const sidebar = page.locator('aside.sidebar');

      await expect(sidebar.locator('button', { hasText: '首頁' })).toHaveAttribute('aria-current', 'page');

      await sidebar.locator('button', { hasText: '個人健康' }).click();
      await expect(page).toHaveURL(/.*\/personalhealth/);
      await expect(sidebar.locator('button', { hasText: '個人健康' })).toHaveAttribute('aria-current', 'page');

      await sidebar.locator('button', { hasText: '家庭介面' }).click();
      await expect(page).toHaveURL(/.*\/family/);
      await expect(sidebar.locator('button', { hasText: '家庭介面' })).toHaveAttribute('aria-current', 'page');

      await sidebar.locator('button', { hasText: '系統設定' }).click();
      await expect(page).toHaveURL(/.*\/settings/);
      await expect(sidebar.locator('button', { hasText: '系統設定' })).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('BottomNav 底部導覽列', () => {
    test('點擊底部導覽列應正確跳轉，並切換 active 狀態', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const bottomNav = page.locator('div.bottom-nav');
      const healthBtn = bottomNav.locator('button').filter({ hasText: /(個人健康|健康)/ });
      const familyBtn = bottomNav.locator('button').filter({ hasText: /(家庭|家人)/ });

      await expect(healthBtn).toBeVisible();
      await healthBtn.click();
      await expect(page).toHaveURL(/.*\/personalhealth/);
      await expect(healthBtn).toHaveClass(/is-active/);

      await familyBtn.click();
      await expect(page).toHaveURL(/.*\/family/);
      await expect(familyBtn).toHaveClass(/is-active/);
    });
  });
});
