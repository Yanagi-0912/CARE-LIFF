import type { Page } from '@playwright/test';

import { expect, stubProfileApi, t, test } from './fixtures';
import { stubApi } from './stubs';

/** 個人健康：摘要 → 詳細資料 → 單頁編輯；驗證資料保存與錯誤保護。 */
const SAVE = () => t('personalHealth.save');
const CANCEL = () => t('personalHealth.cancel');

async function openPage(page: Page) {
  await page.goto('/personalhealth');
  await page.getByRole('button', { name: t('personalHealth.details'), exact: true }).click();
  await page.getByRole('button', { name: t('personalHealth.edit'), exact: true }).click();
  await expect(page.locator('#personalHealthForm')).toBeVisible();
}

async function selectGender(page: Page, labelKey = 'personalHealth.gender.male') {
  await page.locator('#gender').click();
  // Base UI 的 Select 選單會 portal 到 body，所以從 page 層級找
  await page.getByRole('option', { name: t(labelKey) }).click();
  await expect(page.locator('#gender')).toContainText(t(labelKey));
}

async function fillBasicFields(page: Page) {
  await page.locator('#name').fill('測試使用者');
  await page.locator('#age').fill('40');
  await selectGender(page);
}

async function fillBodyFields(page: Page) {
  await page.locator('#height').fill('170');
  await page.locator('#weight').fill('65');
}

/** 填妥必填欄位並展開病史。 */
async function fillAndExpandHistory(page: Page) {
  await fillBasicFields(page);
  await fillBodyFields(page);
  await page.getByRole('button', { name: new RegExp(t('personalHealth.step3.title')) }).click();
  await expect(page.getByRole('button', { name: SAVE() })).toBeVisible();
}

test.describe('個人健康資料', () => {
  test.beforeEach(async ({ authedPage }) => {
    await openPage(authedPage);
  });

  test('同頁顯示基本資料與身體數值', async ({ authedPage }) => {
    await expect(authedPage.getByText(t('personalHealth.edit'))).toBeVisible();
    await expect(authedPage.locator('#name')).toBeVisible();
    await expect(authedPage.locator('#age')).toBeVisible();
    await expect(authedPage.locator('#gender')).toBeVisible();
  });

  test('同頁填寫後成功儲存並回到詳細資料', async ({ authedPage }) => {
    await fillAndExpandHistory(authedPage);
    await authedPage.getByRole('button', { name: SAVE() }).click();
    await expect(authedPage.getByText(t('personalHealth.saveSuccess'))).toBeVisible();
  });

  test('取消回到詳細資料後可重新編輯', async ({ authedPage }) => {
    await fillBasicFields(authedPage);

    await authedPage.getByRole('button', { name: CANCEL() }).click();
    await authedPage.getByRole('button', { name: t('personalHealth.edit'), exact: true }).click();
    await expect(authedPage.locator('#name')).toBeVisible();
    await fillBasicFields(authedPage);
    await authedPage.locator('#name').fill('王小芳');

    await fillBodyFields(authedPage);
    await authedPage.getByRole('button', { name: SAVE() }).click();
    await expect(authedPage.getByText(t('personalHealth.saveSuccess'))).toBeVisible();
  });

  test.describe('必填與範圍驗證', () => {
    test('只填姓名與年齡、未選性別時無法儲存', async ({ authedPage }) => {
      await authedPage.locator('#name').fill('測試使用者');
      await authedPage.locator('#age').fill('40');

      await expect(authedPage.getByRole('button', { name: SAVE() })).toBeDisabled();
      await expect(authedPage.getByText(t('personalHealth.requiredHint'))).toBeVisible();
    });

    for (const [label, age] of [
      ['負數', '-5'],
      ['超過 130', '200'],
    ] as const) {
      test(`年齡${label}時無法儲存`, async ({ authedPage }) => {
        await authedPage.locator('#name').fill('測試使用者');
        await selectGender(authedPage);
        await authedPage.locator('#age').fill(age);
        await authedPage.locator('#age').blur();

        await expect(authedPage.getByRole('button', { name: SAVE() })).toBeDisabled();
        await expect(authedPage.getByText(t('personalHealth.requiredHint'))).toBeVisible();
      });
    }

    test('身高為零時無法儲存', async ({ authedPage }) => {
      await fillBasicFields(authedPage);

      await authedPage.locator('#height').fill('0');
      await authedPage.locator('#height').blur();
      await authedPage.locator('#weight').fill('65');

      await expect(authedPage.getByRole('button', { name: SAVE() })).toBeDisabled();
      await expect(authedPage.getByText(t('personalHealth.requiredHint'))).toBeVisible();
    });
  });

  test.describe('慢性病', () => {
    test('可勾選與取消勾選固定選項', async ({ authedPage }) => {
      await fillAndExpandHistory(authedPage);

      const hypertension = authedPage.getByRole('checkbox', {
        name: t('personalHealth.chronic.hypertension'),
      });
      const diabetes = authedPage.getByRole('checkbox', {
        name: t('personalHealth.chronic.diabetes'),
      });

      await hypertension.click();
      await expect(hypertension).toBeChecked();

      await diabetes.click();
      await expect(diabetes).toBeChecked();

      await hypertension.click();
      await expect(hypertension).not.toBeChecked();
      await expect(diabetes).toBeChecked();
    });

    test('自訂病名新增後變成可移除的標籤', async ({ authedPage }) => {
      await fillAndExpandHistory(authedPage);

      const draft = authedPage.locator('#chronicDiseaseOther');
      const addButton = authedPage.getByRole('button', {
        name: t('personalHealth.chronicOtherAdd'),
      });

      // 空白時不能按，避免加入空標籤
      await expect(addButton).toBeDisabled();

      await draft.fill('痛風');
      await expect(addButton).toBeEnabled();
      await addButton.click();

      const customList = authedPage.getByRole('list', {
        name: t('personalHealth.chronicOtherTitle'),
      });
      await expect(customList).toContainText('痛風');
      // 加完會清空輸入框，方便連續新增
      await expect(draft).toHaveValue('');

      await authedPage
        .getByRole('button', { name: t('personalHealth.chronicOtherRemove', { name: '痛風' }) })
        .click();
      await expect(customList).toHaveCount(0);
    });

    test('重複輸入已存在的病名會被擋下', async ({ authedPage }) => {
      await fillAndExpandHistory(authedPage);

      const draft = authedPage.locator('#chronicDiseaseOther');
      await draft.fill('痛風');
      await authedPage
        .getByRole('button', { name: t('personalHealth.chronicOtherAdd') })
        .click();

      await draft.fill('痛風');
      await authedPage
        .getByRole('button', { name: t('personalHealth.chronicOtherAdd') })
        .click();

      await expect(
        authedPage.getByText(t('personalHealth.chronicOtherDuplicate', { name: '痛風' })),
      ).toBeVisible();
    });
  });

  test('可填寫重大傷病與開刀紀錄', async ({ authedPage }) => {
    await fillAndExpandHistory(authedPage);

    await authedPage.locator('#majorIllness').fill('2020年診斷為冠心病');
    await authedPage.locator('#surgeryHistory').fill('2019年進行膽囊切除手術');

    await expect(authedPage.locator('#majorIllness')).toHaveValue('2020年診斷為冠心病');
    await expect(authedPage.locator('#surgeryHistory')).toHaveValue('2019年進行膽囊切除手術');
  });
});

test.describe('已有健康檔案時', () => {
  test('欄位以伺服器資料預先填好', async ({ authedPage }) => {
    await stubProfileApi(authedPage, {
      name: '王大明',
      // 後端存的是 GENDER_OPTIONS 的 value（'male'/'female'），不是顯示用的中文
      gender: 'male',
      age: 72,
      height: 168,
      weight: 60,
      chronic_diseases: ['hypertension'],
      chronic_custom: ['痛風'],
      major_illness_history: '心導管手術',
      surgery_history: '白內障手術',
    });

    await openPage(authedPage);

    await expect(authedPage.locator('#name')).toHaveValue('王大明');
    await expect(authedPage.locator('#age')).toHaveValue('72');
    await expect(authedPage.locator('#gender')).toContainText(t('personalHealth.gender.male'));
    // 編輯頁標題固定，姓名由欄位呈現。
    await expect(
      authedPage.getByText(t('personalHealth.edit')),
    ).toBeVisible();
  });

  test('後端把性別存成 unknown 時視為尚未選擇', async ({ authedPage }) => {
    await stubProfileApi(authedPage, { name: '王大明', gender: 'unknown', age: 72 });

    await openPage(authedPage);

    await expect(authedPage.locator('#gender')).toContainText(
      t('personalHealth.genderPlaceholder'),
    );
    await expect(authedPage.getByRole('button', { name: SAVE() })).toBeDisabled();
  });

  test('後端只有佔位值（age 0、height 1、weight 1）時欄位是空白，不帶入 0 與 1', async ({ authedPage }) => {
    await stubProfileApi(authedPage, {
      name: '王大明',
      gender: 'unknown',
      age: 0,
      height: 1,
      weight: 1,
    });

    await openPage(authedPage);

    await expect(authedPage.locator('#name')).toHaveValue('王大明');
    await expect(authedPage.locator('#age')).toHaveValue('');
    await authedPage.locator('#age').fill('72');
    await selectGender(authedPage);

    await expect(authedPage.locator('#height')).toHaveValue('');
    await expect(authedPage.locator('#weight')).toHaveValue('');
  });
});

// 後端 PUT /me/update 是整份覆寫。讀取失敗時若照樣給一張空白表單，
// 使用者按一次儲存就會清掉原本的慢性病與病史。
test.describe('讀取健康檔案失敗時', () => {
  test('不顯示表單，只有錯誤說明與重新載入；重新載入成功後才能編輯', async ({ authedPage }) => {
    // 用旗標而不是「前 N 次失敗」：這支查詢與側欄共用，頁面是 lazy 載入的，
    // 晚一步掛上的元件可能多觸發一次請求，次數算不準。
    let healthy = false;
    await stubApi(authedPage, {
      path: '/api/profiles/me',
      method: 'GET',
      respond: () =>
        healthy
          ? {
              status: 200,
              body: {
                name: '王大明',
                gender: 'male',
                age: 72,
                height: 168,
                weight: 60,
                chronic_diseases: ['hypertension'],
                chronic_custom: [],
              },
            }
          : { status: 500, body: { detail: 'e2e: profile failed' } },
    });

    await authedPage.goto('/personalhealth');

    await expect(authedPage.getByText(t('personalHealth.loadError'))).toBeVisible({
      timeout: 10000,
    });
    await expect(authedPage.getByText(t('personalHealth.loadErrorGuard'))).toBeVisible();
    await expect(authedPage.locator('#personalHealthForm')).toHaveCount(0);
    await expect(authedPage.getByRole('button', { name: SAVE() })).toHaveCount(0);

    healthy = true;
    await authedPage.getByRole('button', { name: t('personalHealth.retry') }).click();

    await authedPage.getByRole('button', { name: t('personalHealth.details'), exact: true }).click();
    await authedPage.getByRole('button', { name: t('personalHealth.edit'), exact: true }).click();
    await expect(authedPage.locator('#personalHealthForm')).toBeVisible();
    await expect(authedPage.locator('#name')).toHaveValue('王大明');
    await expect(authedPage.locator('#age')).toHaveValue('72');
  });
});

test.describe('個人健康的網址與儲存生命週期', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubProfileApi(authedPage, {
      name: '陳明德', gender: 'male', age: 65, height: 165, weight: 60,
      chronic_diseases: ['hypertension'], chronic_custom: ['痛風'],
      major_illness_history: '冠心病', surgery_history: '白內障手術',
      health_consultations: { last_consultation: '保留既有諮詢' },
    });
  });

  test('瀏覽器返回與前進保留草稿，重新整理保留編輯網址', async ({ authedPage }) => {
    await openPage(authedPage);
    await expect(authedPage).toHaveURL(/\/personalhealth\?view=edit$/);
    await authedPage.reload();
    await expect(authedPage.getByRole('heading', { name: t('personalHealth.edit'), exact: true })).toBeVisible();
    await authedPage.locator('#age').fill('70');
    await authedPage.goBack();
    await expect(authedPage).toHaveURL(/\/personalhealth\?view=details$/);
    await expect(authedPage.getByRole('heading', { name: t('personalHealth.details'), exact: true })).toBeVisible();
    await authedPage.goBack();
    await expect(authedPage).toHaveURL(/\/personalhealth$/);
    await authedPage.goForward();
    await authedPage.goForward();
    await expect(authedPage.locator('#age')).toHaveValue('70');
    await authedPage.getByRole('button', { name: CANCEL(), exact: true }).click();
    await authedPage.getByRole('button', { name: t('personalHealth.edit'), exact: true }).click();
    await expect(authedPage.locator('#age')).toHaveValue('65');
  });

  test('延遲儲存只送一次，瀏覽器返回後舊回應不改變畫面', async ({ authedPage }) => {
    let completeSave!: () => void;
    const pendingSave = new Promise<void>(resolve => { completeSave = resolve; });
    const calls = await stubApi(authedPage, {
      path: '/api/profiles/me/update', method: 'PUT',
      respond: async () => {
        await pendingSave;
        return { status: 200, body: { success: true } };
      },
    });
    await openPage(authedPage);
    await authedPage.locator('#age').fill('66');
    await authedPage.locator('#personalHealthForm').evaluate(form => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await expect.poll(() => calls.length).toBe(1);
    await expect(authedPage.getByRole('button', { name: t('personalHealth.return'), exact: true })).toBeDisabled();
    await expect(authedPage.getByRole('button', { name: CANCEL(), exact: true })).toBeDisabled();
    await authedPage.goBack();
    await expect(authedPage).toHaveURL(/\/personalhealth\?view=details$/);
    completeSave();
    await expect(authedPage.getByRole('button', { name: t('personalHealth.return'), exact: true })).toBeEnabled();
    await expect(authedPage.getByRole('heading', { name: t('personalHealth.details'), exact: true })).toBeVisible();
    await authedPage.getByRole('button', { name: t('personalHealth.edit'), exact: true }).click();
    await authedPage.locator('#age').fill('70');
    await expect(authedPage.locator('#age')).toHaveValue('70');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ age: 66, health_consultations: { last_consultation: '保留既有諮詢' } });
  });

  test('病史收合時仍有項目數，展開可看到已選慢性病摘要', async ({ authedPage }) => {
    await openPage(authedPage);
    await expect(authedPage.getByText(t('personalHealth.historyCount', { count: 4 }))).toBeVisible();
    await authedPage.getByRole('button', { name: new RegExp(t('personalHealth.step3.title')) }).click();
    await expect(authedPage.getByText(t('personalHealth.selectedChronicSummary', {
      conditions: `${t('personalHealth.chronic.hypertension')}${t('personalHealth.listSeparator')}痛風`,
    }))).toBeVisible();
  });
});
