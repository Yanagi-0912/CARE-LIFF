import { test, expect } from '@playwright/test';

test.describe('個人健康頁面 (Personal Health Page) 完整測試', () => {

    // 每個測試開始前都會執行這個 hook，透過 API 登入並導航到個人健康頁面
    test.beforeEach(async ({ page }) => {
        // 步驟 1：導航到應用首頁
        await page.goto('http://localhost:5173/');

        // 步驟 2：攔截登入 API 並模擬成功回應
        await page.route('**/api/auth/login', async (route) => {
            // 模擬後端回傳的登入成功響應，包含 token 和使用者資訊
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    token: 'mock-jwt-token-12345',
                    user: {
                        id: 'user-001',
                        name: 'Test User',
                        email: 'test@example.com',
                    },
                }),
            });
        });

        // 步驟 3：執行登入操作（透過頁面上的登入表單或直接調用 API）
        await page.evaluate(() => {
            // 使用 fetch API 發送登入請求
            fetch('http://localhost:5173/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'testuser', password: 'password123' }),
            });
        });

        // 步驟 4：導航到個人健康頁面
        await page.goto('http://localhost:5173/personalhealth');

        // 步驟 5：等待頁面加載完成（等待主要表單元素出現）
        await expect(page.getByTestId('personalHealthForm')).toBeVisible();
    });

    // 測試 1：驗證頁面標題與基本元素是否正確顯示
    test('頁面應該正確渲染標題與表單元素', async ({ page }) => {
        // 檢查頁面是否包含「個人健康」標題
        const pageTitle = page.getByRole('heading', { name: /個人健康|Personal Health/i });
        await expect(pageTitle).toBeVisible();

        // 檢查是否存在姓名輸入欄位
        const nameInput = page.getByLabel(/姓名|名前|Name/i);
        await expect(nameInput).toBeVisible();

        // 檢查是否存在年齡輸入欄位
        const ageInput = page.getByLabel(/年齡|年齢|Age/i);
        await expect(ageInput).toBeVisible();

        // 檢查是否存在性別選擇欄位（通常是下拉選單或單選按鈕）
        const genderSelect = page.getByLabel(/性別|性|Gender/i);
        await expect(genderSelect).toBeVisible();
    });

    // 測試 2：驗證慢性病史多選框功能
    test('應該能選擇並取消選擇慢性病史', async ({ page }) => {
        // 查找並點擊「高血壓」複選框
        const hypertensionCheckbox = page.getByRole('checkbox', { name: /高血壓|高血圧/i });

        // 檢查初始狀態是否未被選中
        await expect(hypertensionCheckbox).not.toBeChecked();

        // 點擊勾選「高血壓」
        await hypertensionCheckbox.check();
        await expect(hypertensionCheckbox).toBeChecked();

        // 查找並勾選「糖尿病」
        const diabetesCheckbox = page.getByRole('checkbox', { name: /糖尿病|糖尿病/i });
        await diabetesCheckbox.check();
        await expect(diabetesCheckbox).toBeChecked();

        // 取消勾選「高血壓」
        await hypertensionCheckbox.uncheck();
        await expect(hypertensionCheckbox).not.toBeChecked();

        // 驗證「糖尿病」仍然被勾選（單獨操作不影響其他選項）
        await expect(diabetesCheckbox).toBeChecked();
    });

    // 測試 3：驗證「其他」慢性病選項的文字輸入功能
    test('選擇「其他」慢性病時應該顯示文字輸入欄位', async ({ page }) => {
        // 找到並勾選「其他」複選框
        const otherCheckbox = page.getByRole('checkbox', { name: /其他|Other/i });
        await otherCheckbox.check();

        // 應該出現一個文字輸入欄位讓使用者說明其他疾病
        const otherTextInput = page.getByPlaceholder(/請輸入其他疾病|其他病名|other disease/i);
        await expect(otherTextInput).toBeVisible();

        // 在文字欄位中輸入「痛風」
        await otherTextInput.fill('痛風');
        await expect(otherTextInput).toHaveValue('痛風');
    });

    // 測試 4：驗證主要疾病與手術歷史欄位
    test('應該能填寫主要疾病與手術歷史', async ({ page }) => {
        // 填寫主要疾病（通常是文字區域）
        const majorIllnessInput = page.getByLabel(/主要疾病|Main Illness/i);
        if (await majorIllnessInput.isVisible()) {
            await majorIllnessInput.fill('2020年診斷為冠心病');
            await expect(majorIllnessInput).toHaveValue('2020年診斷為冠心病');
        }

        // 填寫手術歷史
        const surgeryInput = page.getByLabel(/手術|Surgery/i);
        if (await surgeryInput.isVisible()) {
            await surgeryInput.fill('2019年進行膽囊切除手術');
            await expect(surgeryInput).toHaveValue('2019年進行膽囊切除手術');
        }
    });

    // 測試 5：驗證表單提交功能
    test('應該能成功提交表單', async ({ page }) => {
        // 填寫最少的必填欄位
        const nameInput = page.getByLabel(/姓名|名前|Name/i);
        await nameInput.fill('測試使用者');

        const ageInput = page.getByLabel(/年齡|年齢|Age/i);
        await ageInput.fill('40');

        // 找到提交按鈕（可能的按鈕名稱有：保存、提交、確定等）
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });

        // 確保按鈕可見且未被禁用
        await expect(submitButton).toBeVisible();
        await expect(submitButton).toBeEnabled();

        // 點擊提交按鈕
        await submitButton.click();

        // 等待 API 回應（通常會顯示成功訊息或頁面重定向）
        // 這裡假設成功後會顯示成功提示訊息
        const successMessage = page.getByText(/成功|保存完成|Success/i);
        await expect(successMessage).toBeVisible({ timeout: 5000 });
    });

    // 測試 6：驗證表單驗證（例如必填欄位檢查）
    test('空白提交應該顯示驗證錯誤訊息', async ({ page }) => {
        // 直接點擊提交按鈕，不填寫任何欄位
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });
        await submitButton.click();

        // 檢查是否出現錯誤訊息（通常會標記哪些欄位是必填）
        const errorMessage = page.getByText(/必填|請填寫|required|error/i);
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });


    // 測試 7：驗證個人健康數據的編輯功能（從已保存的資料中編輯）
    test('應該能編輯已保存的個人健康資訊', async ({ page }) => {
        // 假設頁面已經載入了某些預填的資料

        // 修改姓名
        const nameInput = page.getByLabel(/姓名|名前|Name/i);
        await nameInput.clear();
        await nameInput.fill('王小芳');
        await expect(nameInput).toHaveValue('王小芳');

        // 修改體重
        const weightInput = page.getByLabel(/體重|重|Weight/i);
        await weightInput.clear();
        await weightInput.fill('60');
        await expect(weightInput).toHaveValue('60');

        // 提交修改
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });
        await submitButton.click();

        // 等待成功訊息
        const successMessage = page.getByText(/成功|保存完成|Success/i);
        await expect(successMessage).toBeVisible({ timeout: 5000 });
    });

    // 測試 10：驗證 Validation Edge Cases - 無效年齡（負數）
    test('年齡為負數時應該顯示驗證錯誤', async ({ page }) => {
        // 填寫無效的年齡（負數）
        const ageInput = page.getByLabel(/年齡|年齢|Age/i);
        await ageInput.fill('-5');

        // 點擊提交
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });
        await submitButton.click();

        // 應該顯示年齡驗證錯誤訊息
        const ageErrorMessage = page.getByText(/年齡|年齡不能為負|invalid age/i);
        await expect(ageErrorMessage).toBeVisible({ timeout: 5000 });
    });

    // 測試 11：驗證 Validation Edge Cases - 超出年齡範圍（大於 150）
    test('年齡超過 150 歲時應該顯示驗證錯誤', async ({ page }) => {
        // 填寫超出範圍的年齡
        const ageInput = page.getByLabel(/年齡|年齢|Age/i);
        await ageInput.fill('200');

        // 點擊提交
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });
        await submitButton.click();

        // 應該顯示年齡範圍錯誤訊息
        const ageRangeError = page.getByText(/年齡超出範圍|age out of range|最大年齡/i);
        await expect(ageRangeError).toBeVisible({ timeout: 5000 });
    });

    // 測試 12：驗證 Validation Edge Cases - 身高為零
    test('身高為零時應該顯示驗證錯誤', async ({ page }) => {
        // 填寫身高為 0
        const heightInput = page.getByLabel(/身高|身長|Height/i);
        await heightInput.fill('0');

        // 點擊提交
        const submitButton = page.getByRole('button', { name: /保存|提交|確定|Save|Submit/i });
        await submitButton.click();

        // 應該顯示身高驗證錯誤
        const heightError = page.getByText(/身高|身高必須大於|height must be/i);
        await expect(heightError).toBeVisible({ timeout: 5000 });
    });

    // 測試 13：驗證未授權流程 - 無效的登入 Token
    test('無效 Token 應該重定向到登入頁', async ({ page }) => {
        // 清除已有的 localStorage token
        await page.evaluate(() => {
            localStorage.removeItem('CARE_AUTH_TOKEN');
        });

        // 嘗試直接訪問個人健康頁面
        await page.goto('http://localhost:5173/personalhealth');

        // 攔截並模擬 API 返回 401 Unauthorized
        await page.route('**/api/personalhealth', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized' }),
            });
        });

        // 刷新頁面以觸發 API 呼叫
        await page.reload();

        // 應該被重定向到登入頁
        await expect(page).toHaveURL(/.*\/login/);
    });

    // 測試 14：驗證未授權流程 - Token 過期
    test('過期的 Token 應該顯示重新登入提示', async ({ page }) => {
        // 設定一個過期的 token
        await page.evaluate(() => {
            localStorage.setItem('CARE_AUTH_TOKEN', 'expired-token-xyz');
        });

        // 攔截 API 並返回 401 (Token 已過期)
        await page.route('**/api/personalhealth', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                }),
            });
        });

        // 導航到個人健康頁面
        await page.goto('http://localhost:5173/personalhealth');

        // 應該顯示重新登入提示
        const reloginPrompt = page.getByText(/重新登入|登入已過期|please login again/i);
        await expect(reloginPrompt).toBeVisible({ timeout: 5000 });
    });

    // 測試 15：驗證未授權流程 - 缺少必要權限
    test('缺少必要權限應該顯示錯誤訊息', async ({ page }) => {
        // 攔截 API 並返回 403 Forbidden
        await page.route('**/api/personalhealth', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Forbidden',
                    message: '您沒有權限訪問此頁面'
                }),
            });
        });

        // 導航到個人健康頁面
        await page.goto('http://localhost:5173/personalhealth');

        // 應該顯示權限錯誤訊息
        const permissionError = page.getByText(/沒有權限|permission denied|forbidden/i);
        await expect(permissionError).toBeVisible({ timeout: 5000 });
    });

});
