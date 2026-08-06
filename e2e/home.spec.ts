import { test, expect } from '@playwright/test';

test.describe('首頁 (Home Page) 完整互動與渲染測試', () => {

  // 在這群組內的「每一個」測試開始前，都會先執行這段程式碼
  test.beforeEach(async ({ page }) => {
    // 1. 先去 /login 建立網域環境
    await page.goto('http://localhost:5173/login');
    
    // 2. 寫入假 Token 模擬已登入狀態
    await page.evaluate(() => {
      localStorage.setItem('CARE_AUTH_TOKEN', 'mock-test-token-123');
    });
    
    // 3. 正式前往首頁準備開始測試
    await page.goto('http://localhost:5173/');
  });

  test('畫面上應該要包含正確的標題與歡迎說明', async ({ page }) => {
    // 檢查 H1 標題
    await expect(page.getByRole('heading', { name: 'CARE 健康管家', level: 1 })).toBeVisible();
    
    // 檢查底下的引導文字
    await expect(page.getByText('點選下方卡片開始管理您的健康')).toBeVisible();
  });

  test('應該要渲染出四個主要功能卡片，且文字正確', async ({ page }) => {
    // 為了避免跟 Sidebar 上的按鈕撞名，我們嚴格限制只找有 feature-card class 的按鈕
    const healthCard = page.locator('button.feature-card', { hasText: '個人健康' });
    const familyCard = page.locator('button.feature-card', { hasText: '家庭介面' });
    const settingsCard = page.locator('button.feature-card', { hasText: '設定頁面' });
    const logoutCard = page.locator('button.feature-card', { hasText: '帳號登出' });

    // 驗證四張卡片都必須出現在畫面上
    await expect(healthCard).toBeVisible();
    await expect(familyCard).toBeVisible();
    await expect(settingsCard).toBeVisible();
    await expect(logoutCard).toBeVisible();

    // 也可以進一步驗證卡片內的副標題文字是否正確
    await expect(healthCard.locator('p')).toHaveText('健康紀錄與醫院預約');
    await expect(familyCard.locator('p')).toHaveText('管理長輩與家人狀況');
  });

  // 以下分別測試四個卡片的點擊跳轉行為
  test('點擊「個人健康」卡片，應該導向 /personalhealth', async ({ page }) => {
    await page.locator('button.feature-card', { hasText: '個人健康' }).click();
    await expect(page).toHaveURL(/.*\/personalhealth/);
  });

  test('點擊「家庭介面」卡片，應該導向 /family', async ({ page }) => {
    await page.locator('button.feature-card', { hasText: '家庭介面' }).click();
    await expect(page).toHaveURL(/.*\/family/);
  });

  test('點擊「設定頁面」卡片，應該導向 /settings', async ({ page }) => {
    await page.locator('button.feature-card', { hasText: '設定頁面' }).click();
    await expect(page).toHaveURL(/.*\/settings/);
  });

  test('點擊「帳號登出」卡片，應該回到 /login 頁面', async ({ page }) => {
    await page.locator('button.feature-card', { hasText: '帳號登出' }).click();
    await expect(page).toHaveURL(/.*\/login/);
  });
});