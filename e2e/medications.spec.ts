import type { Page } from '@playwright/test';

import { LINE_USER_ID, expect, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  medication,
  reminder,
  stubApi,
  stubFamily,
  stubReminderList,
  stubSettings,
  type ReminderDto,
} from './stubs';

/**
 * 用藥提醒：列表四態（載入／錯誤／空／有資料）、開關的樂觀更新與回滾、
 * 新增／編輯／刪除三個 dialog 的表單驗證與 API 契約、對象切換、掃描入口旗標。
 *
 * 藥袋辨識（上傳影像→草稿核對）需要真實影像與辨識服務，不在這裡；
 * 這裡只驗「入口有沒有出現」。
 */

const MORNING = reminder({ id: 'rem-morning', slot_type: 'morning', scheduled_time: '08:00' });
const EVENING = reminder({
  id: 'rem-evening',
  slot_type: 'evening',
  scheduled_time: '18:00',
  enabled: false,
  end_date: '2026-12-31',
  medications: [
    medication({ id: 'med-1', name: 'AMLODIPINE 5MG', shape: '圓形', color: '白色' }),
  ],
});

const slotLabel = (slot: ReminderDto['slot_type']) => t(`meds.slot.${slot}`);
const editButton = (page: Page, r: ReminderDto) =>
  page.getByRole('button', {
    name: t('meds.editAria', { slot: slotLabel(r.slot_type), time: r.scheduled_time }),
  });
const toggle = (page: Page, r: ReminderDto) =>
  page.getByRole('switch', { name: t('meds.toggleAria', { slot: slotLabel(r.slot_type) }) });

async function openPage(page: Page) {
  await page.goto('/medications');
  await expect(page.getByRole('heading', { name: t('meds.title') })).toBeVisible();
}

test.describe('用藥提醒列表', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
  });

  test('載入中先顯示骨架屏，載入完才顯示內容', async ({ authedPage }) => {
    await stubReminderList(authedPage, [], { delayMs: 1500 });
    await openPage(authedPage);

    await expect(authedPage.getByRole('list', { name: t('meds.loading') })).toBeVisible();
    await expect(
      authedPage.getByText(t('meds.empty', { name: t('meds.self') })),
    ).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByRole('list', { name: t('meds.loading') })).toHaveCount(0);
  });

  test('沒有提醒時顯示空狀態與操作提示', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await openPage(authedPage);

    await expect(authedPage.getByText(t('meds.empty', { name: t('meds.self') }))).toBeVisible();
    await expect(authedPage.getByText(t('meds.emptyHint'))).toBeVisible();
  });

  test('後端 500 時顯示錯誤狀態與後端訊息', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/medications/reminders',
      method: 'GET',
      status: 500,
      body: { detail: '資料庫暫時無法連線' },
    });
    await openPage(authedPage);

    await expect(authedPage.getByText(t('meds.loadError'))).toBeVisible();
    await expect(authedPage.getByText('資料庫暫時無法連線')).toBeVisible();
  });

  test('網路中斷時同樣落入錯誤狀態', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/medications/reminders', method: 'GET', abort: true });
    await openPage(authedPage);

    await expect(authedPage.getByText(t('meds.loadError'))).toBeVisible();
  });

  test('有資料時依時段排序顯示卡片、開關狀態與藥品清單', async ({ authedPage }) => {
    // 刻意倒序給，畫面要依 scheduled_time 排好
    await stubReminderList(authedPage, [EVENING, MORNING]);
    await openPage(authedPage);

    const list = authedPage.getByRole('list', { name: t('meds.listLabel') });
    await expect(list).toBeVisible();

    const cards = list.getByRole('button');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('08:00');
    await expect(cards.nth(1)).toContainText('18:00');

    await expect(editButton(authedPage, MORNING)).toContainText(
      t('meds.dateRangeOpen', { start: '2026/09/01' }),
    );
    await expect(editButton(authedPage, EVENING)).toContainText(
      t('meds.dateRangeClosed', { start: '2026/09/01', end: '2026/12/31' }),
    );
    // 藥袋辨識建立的提醒會列出藥名與外觀
    await expect(editButton(authedPage, EVENING)).toContainText('AMLODIPINE 5MG');

    await expect(toggle(authedPage, MORNING)).toBeChecked();
    await expect(toggle(authedPage, EVENING)).not.toBeChecked();
    await expect(list).toContainText(t('meds.statusOn'));
    await expect(list).toContainText(t('meds.statusOff'));
  });
});

test.describe('啟用開關', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
    await stubReminderList(authedPage, [MORNING]);
  });

  test('關閉提醒會送 PUT enabled=false，且卡片保留藥品資訊', async ({ authedPage }) => {
    const puts = await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'PUT',
      body: { ...MORNING, enabled: false, medications: undefined },
    });
    await openPage(authedPage);

    await toggle(authedPage, MORNING).click();

    await expect(toggle(authedPage, MORNING)).not.toBeChecked();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0].body).toEqual({ enabled: false });
  });

  test('後端失敗時開關回滾並跳出錯誤 toast', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'PUT',
      status: 500,
      body: { detail: '更新失敗，請稍後再試' },
    });
    await openPage(authedPage);

    await toggle(authedPage, MORNING).click();

    await expect(authedPage.getByText('更新失敗，請稍後再試')).toBeVisible();
    await expect(toggle(authedPage, MORNING)).toBeChecked();
  });
});

test.describe('新增提醒 dialog', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
  });

  async function openAddDialog(page: Page) {
    await page.getByRole('button', { name: t('meds.addButton') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(t('meds.add.title'))).toBeVisible();
    return dialog;
  }

  test('未勾選時段就送出會被擋下', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    await expect(dialog).toContainText(t('meds.self'));
    await dialog.getByRole('button', { name: t('meds.add.submit') }).click();

    await expect(dialog.getByText(t('meds.add.needSlot'))).toBeVisible();
  });

  test('勾選時段後建立成功：送出正確 payload、關閉 dialog、更新列表', async ({ authedPage }) => {
    let current: ReminderDto[] = [];
    await stubReminderList(authedPage, () => current);
    const posts = await stubApi(authedPage, {
      path: '/api/medications/reminders',
      method: 'POST',
      respond: () => {
        current = [MORNING];
        return { status: 200, body: [MORNING] };
      },
    });
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    await dialog.getByRole('checkbox', { name: new RegExp(slotLabel('morning')) }).click();
    await dialog.getByRole('button', { name: t('meds.add.submit') }).click();

    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toMatchObject({
      user_id: LINE_USER_ID,
      slots: ['morning'],
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect((posts[0].body as { end_date?: string }).end_date).toBeUndefined();

    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(authedPage.getByText(t('meds.add.success', { n: 1 }))).toBeVisible();
    await expect(editButton(authedPage, MORNING)).toBeVisible();
  });

  test('已設定的時段停用並標示「已設定」', async ({ authedPage }) => {
    await stubReminderList(authedPage, [MORNING]);
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    await expect(
      dialog.getByRole('checkbox', { name: new RegExp(slotLabel('morning')) }),
    ).toBeDisabled();
    await expect(dialog.getByText(t('meds.add.slotExists'))).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', { name: new RegExp(slotLabel('noon')) }),
    ).toBeEnabled();
  });

  test('四個時段都設定過時無法再新增', async ({ authedPage }) => {
    await stubReminderList(authedPage, [
      MORNING,
      reminder({ id: 'n', slot_type: 'noon', scheduled_time: '12:00' }),
      reminder({ id: 'e', slot_type: 'evening', scheduled_time: '18:00' }),
      reminder({ id: 'b', slot_type: 'bedtime', scheduled_time: '21:30' }),
    ]);
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    await expect(dialog.getByText(t('meds.add.allSlotsUsed'))).toBeVisible();
    await expect(dialog.getByRole('button', { name: t('meds.add.submit') })).toBeDisabled();
  });

  test('結束日期早於開始日期會顯示欄位錯誤', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    const posts = await stubApi(authedPage, {
      path: '/api/medications/reminders',
      method: 'POST',
      body: [MORNING],
    });
    await dialog.getByRole('checkbox', { name: new RegExp(slotLabel('morning')) }).click();
    await dialog.locator('#startDate').fill('2026-09-10');
    await dialog.locator('#endDate').fill('2026-09-01');
    await dialog.getByRole('button', { name: t('meds.add.submit') }).click();

    // 結束日期欄位帶 min={startDate}，瀏覽器的原生約束驗證會先擋下送出，
    // zod 的 dateOrderError 文案因此永遠到不了畫面（見報告的發現）。
    // 這裡守的是「不能送出」這個結果，而不是哪一層擋的。
    await expect(dialog).toBeVisible();
    expect(
      await dialog.locator('#endDate').evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow),
    ).toBe(true);
    await authedPage.waitForTimeout(300);
    expect(posts).toHaveLength(0);
  });

  test('後端建立失敗時錯誤留在表單內、dialog 不關閉', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await stubApi(authedPage, {
      path: '/api/medications/reminders',
      method: 'POST',
      status: 400,
      body: { detail: '該時段已有提醒' },
    });
    await openPage(authedPage);
    const dialog = await openAddDialog(authedPage);

    await dialog.getByRole('checkbox', { name: new RegExp(slotLabel('morning')) }).click();
    await dialog.getByRole('button', { name: t('meds.add.submit') }).click();

    await expect(dialog.getByText('該時段已有提醒')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('取消與 Escape 都能關閉 dialog', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await openPage(authedPage);

    let dialog = await openAddDialog(authedPage);
    await dialog.getByRole('button', { name: t('meds.cancel') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);

    dialog = await openAddDialog(authedPage);
    await authedPage.keyboard.press('Escape');
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('編輯與刪除 dialog', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
    await stubReminderList(authedPage, [MORNING]);
  });

  async function openEditDialog(page: Page) {
    await editButton(page, MORNING).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(t('meds.edit.title'))).toBeVisible();
    return dialog;
  }

  test('修改時間後儲存，只送出變動的欄位', async ({ authedPage }) => {
    const puts = await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'PUT',
      body: { ...MORNING, scheduled_time: '09:30', medications: undefined },
    });
    await openPage(authedPage);
    const dialog = await openEditDialog(authedPage);

    await expect(dialog.locator('#edit-time')).toHaveValue('08:00');
    await dialog.locator('#edit-time').fill('09:30');
    await dialog.getByRole('button', { name: t('meds.edit.save') }).click();

    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0].body).toEqual({ scheduled_time: '09:30' });
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(authedPage.getByText(t('meds.edit.saveSuccess'))).toBeVisible();
    await expect(
      editButton(authedPage, { ...MORNING, scheduled_time: '09:30' }),
    ).toBeVisible();
  });

  test('沒有任何變更時按儲存直接關閉，不打 API', async ({ authedPage }) => {
    const puts = await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'PUT',
      body: MORNING,
    });
    await openPage(authedPage);
    const dialog = await openEditDialog(authedPage);

    await dialog.getByRole('button', { name: t('meds.edit.save') }).click();

    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    expect(puts).toHaveLength(0);
  });

  test('刪除要先經過確認框；取消不會打 API', async ({ authedPage }) => {
    const deletes = await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'DELETE',
      body: { ok: true },
    });
    await openPage(authedPage);
    const dialog = await openEditDialog(authedPage);

    await dialog.getByRole('button', { name: t('meds.edit.delete') }).click();
    const confirm = authedPage.getByRole('alertdialog');
    await expect(confirm.getByText(t('meds.edit.deleteConfirm'))).toBeVisible();

    await confirm.getByRole('button', { name: t('meds.edit.deleteConfirmNo') }).click();
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(deletes).toHaveLength(0);
  });

  test('確認刪除後卡片消失並顯示成功 toast', async ({ authedPage }) => {
    const deletes = await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'DELETE',
      body: { ok: true },
    });
    await openPage(authedPage);
    const dialog = await openEditDialog(authedPage);

    await dialog.getByRole('button', { name: t('meds.edit.delete') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('meds.edit.deleteConfirmYes') })
      .click();

    await expect.poll(() => deletes.length).toBe(1);
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(authedPage.getByText(t('meds.edit.deleteSuccess'))).toBeVisible();
    await expect(editButton(authedPage, MORNING)).toHaveCount(0);
    await expect(authedPage.getByText(t('meds.empty', { name: t('meds.self') }))).toBeVisible();
  });

  test('刪除失敗時關掉確認框、錯誤顯示在編輯表單', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'DELETE',
      status: 500,
      body: { detail: '刪除失敗' },
    });
    await openPage(authedPage);
    const dialog = await openEditDialog(authedPage);

    await dialog.getByRole('button', { name: t('meds.edit.delete') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('meds.edit.deleteConfirmYes') })
      .click();

    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByText('刪除失敗')).toBeVisible();

    // 關掉編輯框後卡片仍在（沒有被樂觀移除）
    await dialog.getByRole('button', { name: t('meds.cancel') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(editButton(authedPage, MORNING)).toBeVisible();
  });
});

test.describe('提醒對象與功能旗標', () => {
  test('有家人時可切換對象，列表改查該家人的提醒', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await stubSettings(authedPage);
    const gets = await stubReminderList(authedPage, (call) =>
      call.url.searchParams.get('target_user_id') === FAMILY_MEMBERS[0].user_id
        ? [reminder({ id: 'grandma', slot_type: 'noon', scheduled_time: '12:00', user_id: FAMILY_MEMBERS[0].user_id })]
        : [],
    );
    await openPage(authedPage);

    const targets = authedPage.getByRole('group', { name: t('meds.targetLabel') });
    await expect(targets.getByRole('button')).toHaveCount(1 + FAMILY_MEMBERS.length);
    await expect(targets.getByRole('button', { name: t('meds.self') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await targets.getByRole('button', { name: FAMILY_MEMBERS[0].display_name }).click();

    await expect
      .poll(() => gets.map((call) => call.url.searchParams.get('target_user_id')))
      .toContain(FAMILY_MEMBERS[0].user_id);
    await expect(authedPage.getByText('12:00')).toBeVisible();

    // 沒有名字的成員退回「未設定」
    await targets.getByRole('button', { name: FAMILY_MEMBERS[1].display_name }).click();
    await expect(
      authedPage.getByText(t('meds.empty', { name: FAMILY_MEMBERS[1].display_name })),
    ).toBeVisible();
  });

  test('藥袋掃描旗標關閉時入口完全不渲染', async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage, {}, { prescriptionScanEnabled: false });
    await stubReminderList(authedPage, []);
    await openPage(authedPage);

    await expect(authedPage.getByRole('button', { name: t('meds.addButton') })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('meds.scan.entry') })).toHaveCount(0);
  });

  test('藥袋掃描旗標開啟時顯示入口並能開啟掃描 dialog', async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage, {}, { prescriptionScanEnabled: true });
    await stubReminderList(authedPage, []);
    await openPage(authedPage);

    const entry = authedPage.getByRole('button', { name: t('meds.scan.entry') });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(authedPage.getByRole('dialog').getByText(t('meds.scan.title'))).toBeVisible();
  });
});
