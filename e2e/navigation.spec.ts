import { test, expect } from '@playwright/test';

test.describe('全域導覽列組件測試 (Header, Sidebar, BottomNav)', () => {

  // 每次測試前，先模擬登入狀態並進入首頁
  // 因為你的 App.tsx 設定是「登入後才會顯示這些導覽列」
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => {
      localStorage.setItem('CARE_AUTH_TOKEN', 'mock-test-token-123');
    });
    // 前往首頁，這時畫面上就會出現 Header, Sidebar 和 BottomNav
    await page.goto('http://localhost:5173/');
  });

  test.describe('Header 頂部導覽列', () => {
    test('應該包含 Logo 與搜尋框', async ({ page }) => {
      // 檢查 Logo 標題
      await expect(page.locator('h1.header-logo', { hasText: 'CARE' })).toBeVisible();
      // 檢查搜尋框與搜尋按鈕
      await expect(page.locator('input.search-input')).toBeVisible();
      await expect(page.locator('button.search-btn')).toBeVisible();
    });

    test('點擊 Logo 應該導回首頁', async ({ page }) => {
      // 先刻意前往其他頁面
      await page.goto('http://localhost:5173/personalhealth');
      
      // 點擊 Logo
      await page.locator('h1.header-logo', { hasText: 'CARE' }).click();
      
      // 預期網址回到首頁
      await expect(page).toHaveURL('http://localhost:5173/');
    });

    test('點擊「登出」按鈕，應該清除 Token 並導回登入頁', async ({ page }) => {
      // 點擊 Header 內的登出按鈕 (由於使用了 i18n，文字可能是 '登出' 或 header.logout 對應的字)
      const logoutBtn = page.locator('header.app-header button.login-btn');
      await expect(logoutBtn).toContainText(/登出/); // 假設 i18n 翻譯包含登出
      await logoutBtn.click();

      // 預期網址回到 /login
      await expect(page).toHaveURL(/.*\/login/);

      // 檢查 LocalStorage 的 Token 是否真的被清除了
      const token = await page.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN'));
      expect(token).toBeNull();
    });
  });

  test.describe('Sidebar 側邊導覽列', () => {
    test('點擊選單應正確跳轉，並且當前頁面的按鈕應獲得 active class', async ({ page }) => {
      // 將範圍限制在 sidebar 內
      const sidebar = page.locator('aside.sidebar');

      // 預設在首頁，檢查首頁按鈕是否有 active 樣式
      await expect(sidebar.locator('button', { hasText: '首頁' })).toHaveClass(/active/);

      // 點擊「個人健康」
      await sidebar.locator('button', { hasText: '個人健康' }).click();
      await expect(page).toHaveURL(/.*\/personalhealth/);
      await expect(sidebar.locator('button', { hasText: '個人健康' })).toHaveClass(/active/);
      
      // 點擊「家庭介面」
      await sidebar.locator('button', { hasText: '家庭介面' }).click();
      await expect(page).toHaveURL(/.*\/family/);
      await expect(sidebar.locator('button', { hasText: '家庭介面' })).toHaveClass(/active/);
      
      // 點擊「系統設定」
      await sidebar.locator('button', { hasText: '系統設定' }).click();
      await expect(page).toHaveURL(/.*\/settings/);
      await expect(sidebar.locator('button', { hasText: '系統設定' })).toHaveClass(/active/);
    });
  });

  test.describe('BottomNav 底部導覽列', () => {
    test('點擊底部導覽列應正確跳轉，並切換 active 狀態', async ({ page }) => {
      // 為了測試，我們先將畫面寬度調窄，模擬手機版（確保 BottomNav 可以被點擊）
      await page.setViewportSize({ width: 375, height: 667 });

      // 將範圍限制在 bottom-nav 內，防止與 Sidebar 撞名
      const bottomNav = page.locator('nav.bottom-nav');

      // 由於 i18n 的關係，BottomNav 的文字可能是 '首頁', '個人健康', '家庭', '設定'
      // 這裡我們用 class 或圖標名稱輔助尋找
      const healthBtn = bottomNav.locator('button').filter({ hasText: /(個人健康|健康)/ });
      const familyBtn = bottomNav.locator('button').filter({ hasText: /(家庭|家人)/ });

      // 測試點擊個人健康
      await healthBtn.click();
      await expect(page).toHaveURL(/.*\/personalhealth/);
      await expect(healthBtn).toHaveClass(/active/);

      // 測試點擊家庭
      await familyBtn.click();
      await expect(page).toHaveURL(/.*\/family/);
      await expect(familyBtn).toHaveClass(/active/);
    });
  });
});