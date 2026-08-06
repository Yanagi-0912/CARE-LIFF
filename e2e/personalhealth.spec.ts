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
  await page.goto('http://localhost:5173/personalhealth', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#personalHealthForm')).toBeVisible({ timeout: 15000 });
}

async function selectGender(page: Page) {
  await page.locator('#gender').click();
  await page.getByRole('button', { name: '男' }).click();
  await expect(page.locator('#gender')).toContainText('男');
}

async function fillBasicFields(page: Page) {
  await page.getByLabel('姓名').fill('測試使用者');
  await page.getByLabel('年齡').fill('40');
  await selectGender(page);
}

async function fillBodyMetrics(page: Page) {
  const nextButton = page.getByRole('button', { name: '下一步' });
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await page.getByLabel('身高 (cm)').fill('170');
  await page.getByLabel('體重 (kg)').fill('65');
}

async function fillRequiredFields(page: Page) {
  await fillBasicFields(page);
  await fillBodyMetrics(page);
}

test.describe('個人健康頁面 (Personal Health Page) 完整測試', () => {
  test.beforeEach(async ({ page }) => {
    await openPersonalHealthPage(page);
  });

  test('頁面應該正確渲染標題與表單元素', async ({ page }) => {
    await expect(page.getByText('個人健康資料')).toBeVisible();
    await expect(page.getByLabel('姓名')).toBeVisible();
    await expect(page.locator('#gender')).toBeVisible();
  });

  test('應該能選擇並取消選擇慢性病史', async ({ page }) => {
    await fillBasicFields(page);
    await fillBodyMetrics(page);
    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

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
    await fillBasicFields(page);
    await fillBodyMetrics(page);
    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page.getByRole('button', { name: '儲存紀錄' })).toBeVisible();
    const chronicButton = page.locator('.multiSelectButton').first();
    await chronicButton.click();
    const chronicMenu = page.locator('.multiSelectMenu');
    await expect(chronicMenu).toBeVisible();
    await chronicMenu.getByRole('button', { name: '其他' }).click();

    const otherTextInput = page.getByPlaceholder('請輸入其他慢性病');
    await expect(otherTextInput).toBeVisible();
    await otherTextInput.fill('痛風');
    await expect(otherTextInput).toHaveValue('痛風');
  });

  test('應該能填寫重大傷病與開刀紀錄', async ({ page }) => {
    await fillBasicFields(page);
    await fillBodyMetrics(page);
    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await page.getByLabel('重大傷病紀錄').fill('2020年診斷為冠心病');
    await page.getByLabel('開刀紀錄').fill('2019年進行膽囊切除手術');

    await expect(page.getByLabel('重大傷病紀錄')).toHaveValue('2020年診斷為冠心病');
    await expect(page.getByLabel('開刀紀錄')).toHaveValue('2019年進行膽囊切除手術');
  });

  test('應該能成功提交表單', async ({ page }) => {
    await fillRequiredFields(page);
    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(page.getByText('已成功儲存個人健康資料')).toBeVisible();
  });

  test('未完成必填欄位時，下一步按鈕應保持禁用', async ({ page }) => {
    await page.getByLabel('姓名').fill('測試使用者');
    await page.getByLabel('年齡').fill('40');
    await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  test('應該能編輯已填寫的個人健康資訊', async ({ page }) => {
    await fillRequiredFields(page);
    await page.getByRole('button', { name: '上一步' }).click();
    await expect(page.getByLabel('姓名')).toBeVisible();
    await page.getByLabel('姓名').fill('王小芳');
    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByLabel('身高 (cm)')).toBeVisible();
    await page.getByLabel('體重 (kg)').fill('60');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '儲存紀錄' }).click();
    await expect(page.getByText('已成功儲存個人健康資料')).toBeVisible();
  });

  test('年齡為負數時應該顯示驗證錯誤', async ({ page }) => {
    await page.getByLabel('姓名').fill('測試使用者');
    const ageInput = page.getByLabel('年齡');
    await ageInput.fill('-5');
    await ageInput.blur();
    await selectGender(page);

    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeDisabled();
    await expect(ageInput).toHaveClass(/inputHasError/);
  });

  test('年齡超過 130 歲時應該顯示驗證錯誤', async ({ page }) => {
    await page.getByLabel('姓名').fill('測試使用者');
    const ageInput = page.getByLabel('年齡');
    await ageInput.fill('200');
    await ageInput.blur();
    await selectGender(page);

    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeDisabled();
    await expect(ageInput).toHaveClass(/inputHasError/);
  });

  test('身高為零時應該顯示驗證錯誤', async ({ page }) => {
    await fillBasicFields(page);
    const nextButton = page.getByRole('button', { name: '下一步' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    const heightInput = page.getByLabel('身高 (cm)');
    await heightInput.fill('0');
    await heightInput.blur();
    await page.getByLabel('體重 (kg)').fill('65');

    await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
    await expect(page.locator('.fieldErrorText')).toContainText(/身高|數字/);
  });

  test('沒有登入 Token 時應該重定向到登入頁', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => {
      localStorage.removeItem('CARE_AUTH_TOKEN');
    });

    await page.goto('http://localhost:5173/personalhealth', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/.*\/login/, { timeout: 15000 });
  });
});
