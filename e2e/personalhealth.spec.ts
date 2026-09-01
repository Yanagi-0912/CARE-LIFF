import type { Page } from '@playwright/test';

import { expect, stubProfileApi, t, test } from './fixtures';

/**
 * 個人健康資料（三步驟表單）。
 *
 * 這頁在改版後換掉了兩個關鍵互動，舊測試整批失效：
 *   性別   下拉選單改用 Base UI Select → 選項是 role="option"，不再是 button
 *   慢性病 由「下拉複選 + 其他選項」改成「勾選卡片 + 獨立的自訂輸入區」
 *          （設計上刻意拿掉「先勾其他才看得到輸入框」這一步）
 *
 * 驗證錯誤一律斷言使用者看得到的結果——「下一步」停用 + 提示文字，
 * 而不是 .inputHasError 這種樣式 class。
 */

const STEP_NEXT = () => t('personalHealth.next');
const STEP_BACK = () => t('personalHealth.back');
const STEP_SAVE = () => t('personalHealth.save');

async function openPage(page: Page) {
  await page.goto('/personalhealth');
  await expect(page.locator('#personalHealthForm')).toBeVisible();
}

async function selectGender(page: Page, labelKey = 'personalHealth.gender.male') {
  await page.locator('#gender').click();
  // Base UI 的 Select 選單會 portal 到 body，所以從 page 層級找
  await page.getByRole('option', { name: t(labelKey) }).click();
  await expect(page.locator('#gender')).toContainText(t(labelKey));
}

async function fillBasicStep(page: Page) {
  await page.locator('#name').fill('測試使用者');
  await page.locator('#age').fill('40');
  await selectGender(page);
}

async function fillBodyStep(page: Page) {
  await page.locator('#height').fill('170');
  await page.locator('#weight').fill('65');
}

async function goNext(page: Page) {
  const next = page.getByRole('button', { name: STEP_NEXT() });
  await expect(next).toBeEnabled();
  await next.click();
}

/** 一路填到第三步 */
async function advanceToChronicStep(page: Page) {
  await fillBasicStep(page);
  await goNext(page);
  await fillBodyStep(page);
  await goNext(page);
  await expect(page.getByRole('button', { name: STEP_SAVE() })).toBeVisible();
}

test.describe('個人健康資料', () => {
  test.beforeEach(async ({ authedPage }) => {
    await openPage(authedPage);
  });

  test('第一步渲染標題與基本欄位', async ({ authedPage }) => {
    await expect(authedPage.getByText(t('personalHealth.title'))).toBeVisible();
    await expect(authedPage.locator('#name')).toBeVisible();
    await expect(authedPage.locator('#age')).toBeVisible();
    await expect(authedPage.locator('#gender')).toBeVisible();
  });

  test('填完三步驟可成功儲存', async ({ authedPage }) => {
    await advanceToChronicStep(authedPage);
    await authedPage.getByRole('button', { name: STEP_SAVE() }).click();
    await expect(authedPage.getByText(t('personalHealth.saveSuccess'))).toBeVisible();
  });

  test('可以回上一步修改姓名再繼續', async ({ authedPage }) => {
    await fillBasicStep(authedPage);
    await goNext(authedPage);

    await authedPage.getByRole('button', { name: STEP_BACK() }).click();
    await expect(authedPage.locator('#name')).toBeVisible();
    await authedPage.locator('#name').fill('王小芳');

    await goNext(authedPage);
    await fillBodyStep(authedPage);
    await goNext(authedPage);
    await authedPage.getByRole('button', { name: STEP_SAVE() }).click();
    await expect(authedPage.getByText(t('personalHealth.saveSuccess'))).toBeVisible();
  });

  test.describe('必填與範圍驗證', () => {
    test('只填姓名與年齡、未選性別時無法繼續', async ({ authedPage }) => {
      await authedPage.locator('#name').fill('測試使用者');
      await authedPage.locator('#age').fill('40');

      await expect(authedPage.getByRole('button', { name: STEP_NEXT() })).toBeDisabled();
      await expect(authedPage.getByText(t('personalHealth.basicRequired'))).toBeVisible();
    });

    for (const [label, age] of [
      ['負數', '-5'],
      ['超過 130', '200'],
    ] as const) {
      test(`年齡${label}時無法繼續`, async ({ authedPage }) => {
        await authedPage.locator('#name').fill('測試使用者');
        await selectGender(authedPage);
        await authedPage.locator('#age').fill(age);
        await authedPage.locator('#age').blur();

        await expect(authedPage.getByRole('button', { name: STEP_NEXT() })).toBeDisabled();
        await expect(authedPage.getByText(t('personalHealth.basicRequired'))).toBeVisible();
      });
    }

    test('身高為零時無法繼續', async ({ authedPage }) => {
      await fillBasicStep(authedPage);
      await goNext(authedPage);

      await authedPage.locator('#height').fill('0');
      await authedPage.locator('#height').blur();
      await authedPage.locator('#weight').fill('65');

      await expect(authedPage.getByRole('button', { name: STEP_NEXT() })).toBeDisabled();
      await expect(authedPage.getByText(t('personalHealth.bodyRequired'))).toBeVisible();
    });
  });

  test.describe('慢性病', () => {
    test('可勾選與取消勾選固定選項', async ({ authedPage }) => {
      await advanceToChronicStep(authedPage);

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
      await advanceToChronicStep(authedPage);

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
      await advanceToChronicStep(authedPage);

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
    await advanceToChronicStep(authedPage);

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
    // 標題會換成「{name} 的健康資料」
    await expect(
      authedPage.getByText(t('personalHealth.titleWithName', { name: '王大明' })),
    ).toBeVisible();
  });

  test('後端把性別存成 unknown 時視為尚未選擇', async ({ authedPage }) => {
    await stubProfileApi(authedPage, { name: '王大明', gender: 'unknown', age: 72 });

    await openPage(authedPage);

    await expect(authedPage.locator('#gender')).toContainText(
      t('personalHealth.genderPlaceholder'),
    );
    await expect(authedPage.getByRole('button', { name: STEP_NEXT() })).toBeDisabled();
  });
});
