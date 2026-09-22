import type { Page } from '@playwright/test';

import { LINE_USER_ID, expect, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  NO_PERMISSIONS,
  medication,
  reminder,
  stubApi,
  stubFamily,
  stubReminderList,
  stubReminderStore,
  stubSettings,
  type ReminderDto,
  type ReminderEntryDto,
} from './stubs';

/**
 * 用藥提醒：列表四態（載入／錯誤／空／有資料）、開關的樂觀更新與回滾、
 * 新增／修改／刪除（一律走詳細設定）的表單驗證與 API 契約、對象切換、
 * 掃描入口旗標，以及飯前飯後的詳細設定流程（時段時間、條目指派、手動新增藥品）。
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
    // 藥袋辨識建立的提醒會在卡片下段列出藥名與外觀（不在編輯按鈕那一列裡，
    // 藥丸照片需要整張卡片的寬度）
    await expect(list).toContainText('AMLODIPINE 5MG');
    await expect(list).toContainText('白色');
    await expect(editButton(authedPage, EVENING)).not.toContainText('AMLODIPINE 5MG');

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

test.describe('新增與修改提醒（一律走詳細設定）', () => {
  const NONE = t('meds.meal.none');
  const noneSwitch = (page: Page) => page.getByRole('switch', { name: NONE, exact: true });
  const noneTime = (page: Page) =>
    page.getByLabel(t('meds.detailed.timeFor', { meal: NONE }), { exact: true });
  const saveButton = (page: Page) => page.getByRole('button', { name: t('meds.detailed.save') });
  const slotHeading = (page: Page, slot: ReminderDto['slot_type']) =>
    page.getByRole('heading', { name: slotLabel(slot), level: 2 });

  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
  });

  /** 點提醒卡片：直接落在該時段的編輯面，藥品清單載入完才回傳 */
  async function openFromCard(page: Page, r: ReminderDto) {
    await editButton(page, r).click();
    await expect(slotHeading(page, r.slot_type)).toBeVisible();
    await expect(saveButton(page)).toBeEnabled();
  }

  test('按「新增」不開 dialog，直接進四張時段卡；點時段直接儲存就建立單一時刻提醒', async ({ authedPage }) => {
    const { posts } = await stubReminderStore(authedPage);
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('meds.addButton') }).click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    const slotCards = authedPage.getByRole('list', { name: t('meds.detailed.title') });
    await slotCards.getByRole('button', { name: new RegExp(`^${slotLabel('morning')}`) }).click();

    // 新時段預設開「不分飯前後」、時刻是該時段預設值
    await expect(noneSwitch(authedPage)).toBeChecked();
    await expect(noneTime(authedPage)).toHaveValue('08:00');
    await noneTime(authedPage).fill('07:30');
    await saveButton(authedPage).click();

    await expect(authedPage.getByText(t('meds.detailed.saveSuccess'))).toBeVisible();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toMatchObject({
      user_id: LINE_USER_ID,
      slots: ['morning'],
      slot_entries: { morning: [{ meal_timing: 'none', scheduled_time: '07:30', medication_ids: [] }] },
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect((posts[0].body as { end_date?: string }).end_date).toBeUndefined();

    // 從「新增」進來的，存完回到時段卡；再返回清單看得到新卡片
    await expect(slotCards).toContainText(
      t('meds.detailed.entrySummary', { meal: NONE, time: '07:30', count: 0 }),
    );
    await authedPage.getByRole('button', { name: t('meds.detailed.back') }).click();
    await expect(
      editButton(authedPage, reminder({ id: 'x', slot_type: 'morning', scheduled_time: '07:30' })),
    ).toBeVisible();
  });

  test('點卡片直接進該時段；改時間與結束日期後只送出變動的日期，存完回到清單', async ({ authedPage }) => {
    const { puts } = await stubReminderStore(authedPage, { reminders: [MORNING] });
    await openPage(authedPage);
    await openFromCard(authedPage, MORNING);

    await expect(noneTime(authedPage)).toHaveValue('08:00');
    await noneTime(authedPage).fill('09:30');
    await authedPage.getByLabel(t('meds.add.endDate'), { exact: true }).fill('2026-12-31');
    await saveButton(authedPage).click();

    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0].body).toEqual({
      entries: [{ meal_timing: 'none', scheduled_time: '09:30', medication_ids: [] }],
      end_date: '2026-12-31',
    });
    await expect(authedPage.getByText(t('meds.detailed.saveSuccess'))).toBeVisible();
    // 從卡片進來的，存完直接回清單，不經過時段卡
    await expect(
      editButton(authedPage, { ...MORNING, scheduled_time: '09:30' }),
    ).toBeVisible();
    await expect(authedPage.getByRole('list', { name: t('meds.detailed.title') })).toHaveCount(0);
  });

  test('結束日期早於開始日期會顯示欄位錯誤，不送出', async ({ authedPage }) => {
    const { puts } = await stubReminderStore(authedPage, { reminders: [MORNING] });
    await openPage(authedPage);
    await openFromCard(authedPage, MORNING);

    await authedPage.getByLabel(t('meds.add.startDate'), { exact: true }).fill('2026-09-10');
    await authedPage.getByLabel(t('meds.add.endDate'), { exact: true }).fill('2026-09-01');
    await saveButton(authedPage).click();

    // 日期欄位的 min 只當日期選擇器的提示，擋下送出的是 zod
    await expect(authedPage.getByText(t('meds.add.dateOrderError'))).toBeVisible();
    expect(puts).toHaveLength(0);
  });

  test('後端建立失敗時錯誤留在編輯面，不離開', async ({ authedPage }) => {
    await stubReminderList(authedPage, []);
    await stubApi(authedPage, { path: '/api/medications', method: 'GET', body: [] });
    await stubApi(authedPage, {
      path: '/api/medications/reminders',
      method: 'POST',
      status: 400,
      body: { detail: '該時段已有提醒' },
    });
    await openPage(authedPage);
    await authedPage.getByRole('button', { name: t('meds.addButton') }).click();
    await authedPage
      .getByRole('list', { name: t('meds.detailed.title') })
      .getByRole('button', { name: new RegExp(`^${slotLabel('noon')}`) })
      .click();
    await expect(saveButton(authedPage)).toBeEnabled();
    await saveButton(authedPage).click();

    await expect(authedPage.getByText('該時段已有提醒')).toBeVisible();
    await expect(slotHeading(authedPage, 'noon')).toBeVisible();
  });

  test('刪除要先確認：取消不打 API；確定後回到清單、卡片消失', async ({ authedPage }) => {
    const { deletes } = await stubReminderStore(authedPage, { reminders: [MORNING] });
    await openPage(authedPage);
    await openFromCard(authedPage, MORNING);

    await authedPage.getByRole('button', { name: t('meds.edit.delete') }).click();
    const confirm = authedPage.getByRole('alertdialog');
    await expect(confirm.getByText(t('meds.edit.deleteConfirm'))).toBeVisible();
    await confirm.getByRole('button', { name: t('meds.edit.deleteConfirmNo') }).click();
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    expect(deletes).toHaveLength(0);

    await authedPage.getByRole('button', { name: t('meds.edit.delete') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('meds.edit.deleteConfirmYes') })
      .click();

    await expect.poll(() => deletes.length).toBe(1);
    await expect(authedPage.getByText(t('meds.edit.deleteSuccess'))).toBeVisible();
    await expect(editButton(authedPage, MORNING)).toHaveCount(0);
    await expect(authedPage.getByText(t('meds.empty', { name: t('meds.self') }))).toBeVisible();
  });

  test('刪除失敗時關掉確認框、錯誤顯示在編輯面，卡片仍在', async ({ authedPage }) => {
    await stubReminderList(authedPage, [MORNING]);
    await stubApi(authedPage, { path: '/api/medications', method: 'GET', body: [] });
    await stubApi(authedPage, {
      path: `/api/medications/reminders/${MORNING.id}`,
      method: 'DELETE',
      status: 500,
      body: { detail: '刪除失敗' },
    });
    await openPage(authedPage);
    await openFromCard(authedPage, MORNING);

    await authedPage.getByRole('button', { name: t('meds.edit.delete') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('meds.edit.deleteConfirmYes') })
      .click();

    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    await expect(authedPage.getByText('刪除失敗')).toBeVisible();

    await authedPage.getByRole('button', { name: t('meds.detailed.back') }).click();
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

  test('對沒有讀取權的家人不列入對象；只有讀取權的家人看不到新增與掃描入口', async ({ authedPage }) => {
    await stubFamily(authedPage, [
      FAMILY_MEMBERS[0],
      FAMILY_MEMBERS[1],
      { user_id: 'Unoaccess', relationship_type: null, display_name: '沒權限的人', my_permissions: NO_PERMISSIONS },
    ]);
    await stubSettings(authedPage, {}, { prescriptionScanEnabled: true });
    await stubReminderList(authedPage, []);
    await openPage(authedPage);

    const targets = authedPage.getByRole('group', { name: t('meds.targetLabel') });
    await expect(targets.getByRole('button')).toHaveCount(3);
    await expect(targets.getByRole('button', { name: '沒權限的人' })).toHaveCount(0);

    // 王小明只有 general READ：看得到提醒，但新增與掃描入口整個不渲染
    await targets.getByRole('button', { name: FAMILY_MEMBERS[1].display_name }).click();
    await expect(authedPage.getByRole('button', { name: t('meds.addButton') })).toHaveCount(0);
    await expect(authedPage.getByRole('button', { name: t('meds.scan.entry') })).toHaveCount(0);

    // 林阿嬤有 general WRITE：入口回來
    await targets.getByRole('button', { name: FAMILY_MEMBERS[0].display_name }).click();
    await expect(authedPage.getByRole('button', { name: t('meds.addButton') })).toBeVisible();
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

test.describe('飯前飯後（詳細設定）', () => {
  const MED_A = medication({ id: 'm-a', name: '降血糖藥' });
  const MED_B = medication({ id: 'm-b', name: '血壓藥' });
  const BEFORE = t('meds.meal.before_meal');
  const AFTER = t('meds.meal.after_meal');

  type CreateBody = {
    slot_entries?: Record<string, ReminderEntryDto[]>;
  };

  // 開關的無障礙名稱來自旁邊接了 htmlFor 的文字（「飯前」），不是 aria-label
  const timingSwitch = (page: Page, meal: string) =>
    page.getByRole('switch', { name: meal, exact: true });
  const timingTime = (page: Page, meal: string) =>
    page.getByLabel(t('meds.detailed.timeFor', { meal }), { exact: true });
  const medRow = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
  const assignButton = (row: ReturnType<typeof medRow>, meal: string) =>
    row.getByRole('button', { name: t('meds.detailed.assignTo', { meal }) });

  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage);
    await stubSettings(authedPage);
  });

  /** 「新增」→ 四張時段卡 → 點進某個時段的編輯面；藥品清單載入完才回傳 */
  async function openSlotEditor(page: Page, slot: ReminderDto['slot_type']) {
    await page.getByRole('button', { name: t('meds.addButton') }).click();
    // 詳細設定是同一頁內切換檢視，不是 dialog（design.md 決策 8）
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('list', { name: t('meds.detailed.title') })
      .getByRole('button', { name: new RegExp(`^${slotLabel(slot)}`) })
      .click();
    await expect(page.getByRole('list', { name: t('meds.detailed.medsHeading') })).toBeVisible();
  }

  test('詳細設定：飯前飯後各自的時間與藥品，送出 slot_entries 並在卡片攤開', async ({ authedPage }) => {
    const { posts } = await stubReminderStore(authedPage, { medications: [MED_A, MED_B] });
    await openPage(authedPage);
    await openSlotEditor(authedPage, 'morning');

    // 新時段預設開著「不分飯前後」，要分飯前飯後就先關掉它
    await timingSwitch(authedPage, t('meds.meal.none')).click();
    await timingSwitch(authedPage, BEFORE).click();
    await timingTime(authedPage, BEFORE).fill('07:30');
    await timingSwitch(authedPage, AFTER).click();
    await timingTime(authedPage, AFTER).fill('08:30');

    await assignButton(medRow(authedPage, MED_A.name), BEFORE).click();
    await assignButton(medRow(authedPage, MED_B.name), AFTER).click();

    await authedPage.getByRole('button', { name: t('meds.detailed.save') }).click();
    await expect(authedPage.getByText(t('meds.detailed.saveSuccess'))).toBeVisible();

    // 儲存後回到四張時段卡，「早」的摘要列出兩個時機
    const slotCards = authedPage.getByRole('list', { name: t('meds.detailed.title') });
    await expect(slotCards).toContainText(
      t('meds.detailed.entrySummary', { meal: BEFORE, time: '07:30', count: 1 }),
    );
    await expect(slotCards).toContainText(
      t('meds.detailed.entrySummary', { meal: AFTER, time: '08:30', count: 1 }),
    );

    // 回到列表：卡片標題是最早時刻，下段把兩個時機各自的時刻與藥名攤開
    await authedPage.getByRole('button', { name: t('meds.detailed.back') }).click();
    await expect(
      editButton(authedPage, reminder({ id: 'x', slot_type: 'morning', scheduled_time: '07:30' })),
    ).toBeVisible();
    const entries = authedPage.getByRole('list', { name: t('meds.card.entriesLabel') });
    const beforeRow = entries.getByRole('listitem').filter({ hasText: BEFORE });
    await expect(beforeRow).toContainText('07:30');
    await expect(beforeRow).toContainText(MED_A.name);
    const afterRow = entries.getByRole('listitem').filter({ hasText: AFTER });
    await expect(afterRow).toContainText('08:30');
    await expect(afterRow).toContainText(MED_B.name);

    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ user_id: LINE_USER_ID, slots: ['morning'] });
    expect((posts[0].body as CreateBody).slot_entries?.morning).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: [MED_A.id] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: [MED_B.id] },
    ]);
  });

  test('詳細設定內手動新增藥品後可立即指派；時機未開啟前指派鈕停用', async ({ authedPage }) => {
    const { medPosts } = await stubReminderStore(authedPage, { medications: [MED_A] });
    await openPage(authedPage);
    await openSlotEditor(authedPage, 'morning');

    await authedPage.getByLabel(t('meds.detailed.addMedName'), { exact: true }).fill('胃藥');
    await authedPage.getByRole('button', { name: t('meds.detailed.addMed') }).click();

    await expect(authedPage.getByText(t('meds.detailed.addMedSuccess'))).toBeVisible();
    const newRow = medRow(authedPage, '胃藥');
    await expect(newRow).toBeVisible();
    expect(medPosts).toHaveLength(1);
    expect(medPosts[0].body).toEqual({ user_id: LINE_USER_ID, name: '胃藥' });

    // 飯後開關還沒開，指派鈕不可按；開了才可按
    const assignAfter = assignButton(newRow, AFTER);
    await expect(assignAfter).toBeDisabled();
    await timingSwitch(authedPage, AFTER).click();
    await expect(assignAfter).toBeEnabled();
    await assignAfter.click();
    await expect(assignAfter).toHaveAttribute('aria-pressed', 'true');
  });
});
