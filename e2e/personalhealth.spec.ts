import { expect, type Page, test } from '@playwright/test';

const API_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,ngrok-skip-browser-warning',
};

async function mockPersonalHealthApi(page: Page, profile = null) {
  await page.route('**/api/profiles/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: API_HEADERS });
      return;
    }

    if (profile) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: API_HEADERS,
        body: JSON.stringify(profile),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({ detail: 'Not found' }),
    });
  });

  await page.route('**/api/profiles/me/update', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: API_HEADERS });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({ ok: true }),
    });
  });
}

async function openPersonalHealthPage(page: Page, profile = null) {
  await mockPersonalHealthApi(page, profile);
  await page.goto('http://localhost:5173/login');
  await page.evaluate(() => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'mock-jwt-token-12345');
  });
  await page.goto('http://localhost:5173/personalhealth');
  await expect(page.locator('#personalHealthForm')).toBeVisible();
}

async function fillRequiredFields(page: Page) {
  await page.getByLabel('姓名').fill('測試使用者');
  await page.getByLabel('身高 (cm)').fill('170');
  await page.getByLabel('體重 (kg)').fill('65');
  await page.getByLabel('年齡').fill('40');
  await page.getByRole('button', { name: /請選擇性別|男|女/ }).click();
  await page.getByRole('button', { name: '男' }).click();
}

test.describe('個人健康頁面 (Personal Health Page) 完整測試', () => {
  test.beforeEach(async ({ page }) => {
    await openPersonalHealthPage(page);
  });

  test('頁面應該正確渲染標題與表單元素', async ({ page }) => {
    await expect(page.getByText('個人健康資料')).toBeVisible();
    await expect(page.getByLabel('姓名')).toBeVisible();
    await expect(page.getByLabel('身高 (cm)')).toBeVisible();
    await expect(page.getByLabel('體重 (kg)')).toBeVisible();
    await expect(page.getByLabel('年齡')).toBeVisible();
    await expect(page.getByRole('button', { name: /請選擇性別|男|女/ })).toBeVisible();
  });

  test('應該能選擇並取消選擇慢性病史', async ({ page }) => {
    const chronicButton = page.locator('.multiSelectButton');
    const chronicMenu = page.locator('.multiSelectMenu');

    await chronicButton.click();
    await chronicMenu.getByRole('button', { name: '高血壓' }).click();
    await expect(chronicButton).toContainText('高血壓');

    await chronicMenu.getByRole('button', { name: '糖尿病' }).click();
    await expect(chronicButton).toContainText('高血壓');
    await expect(chronicButton).toContainText('糖尿病');

    await chronicMenu.getByRole('button', { name: '高血壓' }).click();
    await expect(chronicButton).not.toContainText('高血壓');
    await expect(chronicButton).toContainText('糖尿病');
  });

  test('選擇「其他」慢性病時應該顯示文字輸入欄位', async ({ page }) => {
    await page.getByRole('button', { name: /請選擇慢性病史/ }).click();
    await page.getByRole('button', { name: /其他/ }).click();

    const otherTextInput = page.getByPlaceholder('請輸入其他慢性病');
    await expect(otherTextInput).toBeVisible();
    await otherTextInput.fill('痛風');
    await expect(otherTextInput).toHaveValue('痛風');
  });

  test('應該能填寫重大傷病與開刀紀錄', async ({ page }) => {
    await page.getByLabel('重大傷病紀錄').fill('2020年診斷為冠心病');
    await page.getByLabel('開刀紀錄').fill('2019年進行膽囊切除手術');

    await expect(page.getByLabel('重大傷病紀錄')).toHaveValue('2020年診斷為冠心病');
    await expect(page.getByLabel('開刀紀錄')).toHaveValue('2019年進行膽囊切除手術');
  });

  test('應該能成功提交表單', async ({ page }) => {
    await fillRequiredFields(page);

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(page.getByText('已成功儲存個人健康資料')).toBeVisible();
  });

  test('空白提交應該顯示瀏覽器必填驗證', async ({ page }) => {
    await page.getByLabel('姓名').fill('測試使用者');
    await page.getByLabel('姓名').clear();
    await page.getByLabel('年齡').fill('40');

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(page.getByText(/已成功儲存個人健康資料/)).not.toBeVisible();
  });

  test('應該能編輯已填寫的個人健康資訊', async ({ page }) => {
    await fillRequiredFields(page);
    await page.getByLabel('姓名').clear();
    await page.getByLabel('姓名').fill('王小芳');
    await page.getByLabel('體重 (kg)').clear();
    await page.getByLabel('體重 (kg)').fill('60');

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(page.getByText('已成功儲存個人健康資料')).toBeVisible();
  });

  test('年齡為負數時應該顯示驗證錯誤', async ({ page }) => {
    await fillRequiredFields(page);
    const ageInput = page.getByLabel('年齡');
    await ageInput.fill('-5');

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(ageInput).toHaveJSProperty('validity.valid', false);
  });

  test('年齡超過 130 歲時應該顯示驗證錯誤', async ({ page }) => {
    await fillRequiredFields(page);
    const ageInput = page.getByLabel('年齡');
    await ageInput.fill('200');

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(ageInput).toHaveJSProperty('validity.valid', false);
  });

  test('身高為零時應該顯示驗證錯誤', async ({ page }) => {
    await fillRequiredFields(page);
    const heightInput = page.getByLabel('身高 (cm)');
    await heightInput.fill('0');

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(heightInput).toHaveJSProperty('validity.valid', false);
  });

  test('沒有登入 Token 時應該重定向到登入頁', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => {
      localStorage.removeItem('CARE_AUTH_TOKEN');
    });

    await page.goto('http://localhost:5173/personalhealth');
    await expect(page).toHaveURL(/.*\/login/);
  });

});
