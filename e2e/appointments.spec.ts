import type { Page } from '@playwright/test';

import { LINE_USER_ID, expect, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  appointment,
  stubAppointmentStore,
  stubFamily,
  stubSettings,
  type AppointmentDto,
} from './stubs';

/**
 * 掛號提醒：列表的兩個分區（即將到來／過去）、新增與編輯的 API 契約、
 * 出發與到診的狀態轉移、畫面過期時的 409、取消與刪除、過去紀錄的分頁，
 * 以及只有讀取權的家人看到的樣子。
 *
 * 「現在」固定在 2026-09-15 08:00（台灣時間），見 stubAppointmentStore。
 * 表單第一步的院所搜尋不在這裡（要另外 stub 院所 API），一律手動輸入醫院名稱。
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** 卡片上的日期與時間寫法：「9/15（週二）」與「10:30」 */
function when(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return {
    date: t('appt.dateDisplay', { month, day, weekday: t(`weekday.${weekday}`) }),
    time: iso.slice(11, 16),
  };
}

const TODAY = appointment({
  id: 'appt-today',
  appointment_at: '2026-09-15T10:30:00+08:00',
  hospital_name: '臺大醫院',
  department: '心臟內科',
});
const NEXT_WEEK = appointment({
  id: 'appt-next-week',
  appointment_at: '2026-09-22T14:00:00+08:00',
  hospital_name: '馬偕紀念醫院',
  department: '眼科',
  doctor_name: '陳醫師',
});
const LAST_MONTH = appointment({
  id: 'appt-last-month',
  appointment_at: '2026-08-11T09:00:00+08:00',
  hospital_name: '榮民總醫院',
  department: '骨科',
  status: 'attended',
  attended_at: '2026-08-11T09:10:00+08:00',
  attended_by_user_id: LINE_USER_ID,
});
const EARLIER = appointment({
  id: 'appt-earlier',
  appointment_at: '2026-07-07T09:00:00+08:00',
  hospital_name: '三軍總醫院',
  department: '家醫科',
  status: 'attended',
});

/** n 筆已到診的過去門診，由新到舊：8/31、8/30… */
function pastVisits(count: number): AppointmentDto[] {
  return Array.from({ length: count }, (_, i) =>
    appointment({
      id: `appt-past-${i + 1}`,
      appointment_at: `2026-08-${String(31 - i).padStart(2, '0')}T09:00:00+08:00`,
      hospital_name: `第${i + 1}次的醫院`,
      status: 'attended',
    }),
  );
}

/** ItemGroup 是 role=list，但卡片（Item）沒有 listitem 角色，只能用直接子元素取 */
const CARD = ':scope > *';
const upcomingList = (page: Page) => page.getByRole('list', { name: t('appt.listLabel') });
const pastList = (page: Page) => page.getByRole('list', { name: t('appt.past.listLabel') });
const pastToggle = (page: Page, count: number) =>
  page.getByRole('button', { name: t('appt.past.toggle', { count }) });
/** 不論筆數的「過去的門診（n）」：取文案裡筆數之前的那一段做子字串比對 */
const anyPastToggle = (page: Page) =>
  page.getByRole('button', { name: t('appt.past.toggle', { count: 0 }).split('0')[0] });
const editButton = (page: Page, item: AppointmentDto) =>
  page.getByRole('button', {
    name: t('appt.editAria', { ...when(item.appointment_at), hospital: item.hospital_name }),
  });

async function openPage(page: Page) {
  await page.goto('/reminders/appointments');
  await expect(page.getByRole('heading', { name: t('appt.title'), level: 1 })).toBeVisible();
}

test.beforeEach(async ({ authedPage }) => {
  await stubFamily(authedPage);
  await stubSettings(authedPage);
});

test.describe('掛號提醒列表', () => {
  test('完全沒有掛號時顯示空狀態與新增提示', async ({ authedPage }) => {
    await stubAppointmentStore(authedPage);
    await openPage(authedPage);

    await expect(authedPage.getByText(t('appt.empty', { name: t('meds.self') }))).toBeVisible();
    await expect(authedPage.getByText(t('appt.emptyHint'))).toBeVisible();
    await expect(anyPastToggle(authedPage)).toHaveCount(0);
  });

  test('即將到來由早到晚列出，過去的門診收起來並標出總筆數', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, {
      items: [NEXT_WEEK, EARLIER, TODAY, LAST_MONTH],
    });
    await openPage(authedPage);

    const cards = upcomingList(authedPage).locator(CARD);
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(TODAY.hospital_name);
    await expect(cards.nth(0)).toContainText(t('appt.card.today'));
    await expect(cards.nth(1)).toContainText(NEXT_WEEK.hospital_name);
    await expect(cards.nth(1)).toContainText(NEXT_WEEK.doctor_name as string);
    // 門診當天才給出發／到診，一週後的那筆沒有
    await expect(cards.nth(0).getByRole('button', { name: t('appt.action.depart') })).toBeVisible();
    await expect(cards.nth(1).getByRole('button', { name: t('appt.action.depart') })).toHaveCount(0);

    await expect(pastList(authedPage)).toHaveCount(0);
    await pastToggle(authedPage, 2).click();
    const past = pastList(authedPage).locator(CARD);
    await expect(past).toHaveCount(2);
    await expect(past.nth(0)).toContainText(LAST_MONTH.hospital_name);
    await expect(past.nth(0)).toContainText(t('appt.status.attended'));
    await expect(past.nth(1)).toContainText(EARLIER.hospital_name);

    // 本人的清單：兩個分區都帶本人的 target_user_id
    const scopes = store.gets.map((call) => call.url.searchParams.get('scope')).sort();
    expect(scopes).toEqual(['past', 'upcoming']);
    for (const call of store.gets) {
      expect(call.url.searchParams.get('target_user_id')).toBe(LINE_USER_ID);
    }
  });

  test('列表 500 時顯示錯誤與後端訊息，重新整理後恢復', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [TODAY] });
    store.state.outage = { status: 500, detail: '資料庫暫時無法連線' };
    await openPage(authedPage);

    await expect(authedPage.getByText(t('appt.loadError'))).toBeVisible({ timeout: 10_000 });
    await expect(authedPage.getByText('資料庫暫時無法連線')).toBeVisible();
    await expect(editButton(authedPage, TODAY)).toHaveCount(0);

    store.state.outage = null;
    await authedPage.reload();
    await expect(editButton(authedPage, TODAY)).toBeVisible();
    await expect(authedPage.getByText(t('appt.loadError'))).toHaveCount(0);
  });

  test('過去的門診一次 20 筆，「載入更多」帶上一頁的 cursor 接在後面', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: pastVisits(25) });
    await openPage(authedPage);

    await pastToggle(authedPage, 25).click();
    const past = pastList(authedPage).locator(CARD);
    await expect(past).toHaveCount(20);
    await expect(past.nth(0)).toContainText('第1次的醫院');

    await authedPage.getByRole('button', { name: t('appt.past.loadMore') }).click();
    await expect(past).toHaveCount(25);
    await expect(past.nth(20)).toContainText('第21次的醫院');
    await expect(past.nth(24)).toContainText('第25次的醫院');
    await expect(authedPage.getByRole('button', { name: t('appt.past.loadMore') })).toHaveCount(0);

    const pastCalls = store.gets.filter((call) => call.url.searchParams.get('scope') === 'past');
    expect(pastCalls.map((call) => call.url.searchParams.get('cursor'))).toEqual([null, '20']);
    expect(pastCalls.every((call) => call.url.searchParams.get('limit') === '20')).toBe(true);
    // 總筆數來自後端的 total_count，載入更多之後也不變
    await expect(pastToggle(authedPage, 25)).toBeVisible();
  });
});

test.describe('新增與編輯', () => {
  test('新增：四步填完送出，請求帶本人 userId 與 +08:00 的時間，新卡片出現在列表', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage);
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('appt.addButton'), exact: true }).click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByText(t('appt.step.hospital'), { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: t('appt.form.manualEntry') }).click();
    await dialog.getByLabel(t('appt.form.manualHospitalLabel')).fill('亞東紀念醫院');
    await dialog.getByRole('button', { name: t('appt.form.next') }).click();

    await expect(dialog.getByText(t('appt.step.visit'), { exact: true })).toBeVisible();
    await dialog.getByLabel(t('appt.form.department'), { exact: true }).fill('腎臟科');
    await dialog.getByLabel(t('appt.form.date')).fill('2026-09-25');
    await dialog.getByRole('combobox', { name: t('appt.form.hourAria') }).click();
    await authedPage
      .getByRole('option', {
        name: t('appt.form.hourOption', {
          hour: '14',
          hint: t('appt.time.hourHint', { period: t('appt.time.period.afternoon'), hour12: 2 }),
        }),
      })
      .click();
    await dialog.getByRole('button', { name: t('appt.form.next') }).click();

    await expect(dialog.getByText(t('appt.step.details'), { exact: true })).toBeVisible();
    await dialog.getByLabel(t('appt.form.doctor')).fill('林醫師');
    await dialog.getByRole('button', { name: t('appt.form.next') }).click();

    await expect(dialog.getByText(t('appt.step.confirm'), { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: t('appt.form.submit') }).click();

    await expect(authedPage.getByText(t('appt.form.addSuccess'))).toBeVisible();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);

    expect(store.posts).toHaveLength(1);
    expect(store.posts[0].body).toEqual({
      user_id: LINE_USER_ID,
      appointment_at: '2026-09-25T14:00:00+08:00',
      facility_id: null,
      hospital_name: '亞東紀念醫院',
      hospital_address: null,
      hospital_phone: null,
      department: '腎臟科',
      doctor_name: '林醫師',
      serial_number: null,
      note: null,
    });

    const card = editButton(authedPage, {
      ...TODAY,
      appointment_at: '2026-09-25T14:00:00+08:00',
      hospital_name: '亞東紀念醫院',
    });
    await expect(card).toBeVisible();
    await expect(card).toContainText('腎臟科');
    await expect(card).toContainText('林醫師');
  });

  test('編輯：只改醫師時 PUT 只帶 doctor_name，卡片隨之更新', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [NEXT_WEEK] });
    await openPage(authedPage);

    await editButton(authedPage, NEXT_WEEK).click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog.getByText(t('appt.step.confirm'), { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: t('appt.form.editDetails') }).click();
    await dialog.getByLabel(t('appt.form.doctor')).fill('黃醫師');
    await dialog.getByRole('button', { name: t('appt.form.next') }).click();
    await dialog.getByRole('button', { name: t('appt.form.save') }).click();

    await expect(authedPage.getByText(t('appt.form.saveSuccess'))).toBeVisible();
    expect(store.puts).toHaveLength(1);
    expect(store.puts[0].url.pathname).toBe(`/api/appointments/reminders/${NEXT_WEEK.id}`);
    expect(store.puts[0].body).toEqual({ doctor_name: '黃醫師' });
    await expect(editButton(authedPage, NEXT_WEEK)).toContainText('黃醫師');
    await expect(editButton(authedPage, NEXT_WEEK)).not.toContainText('陳醫師');
  });
});

test.describe('出發、到診與取消', () => {
  test('門診當天先按「我已出發」再按「我已到診」，卡片顯示狀態與回報者', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [TODAY] });
    await openPage(authedPage);

    const card = upcomingList(authedPage).locator(CARD).first();
    await card.getByRole('button', { name: t('appt.action.depart') }).click();
    await expect(authedPage.getByText(t('appt.action.departSuccess'))).toBeVisible();
    await expect(card).toContainText(t('appt.status.departed'));
    await expect(card).toContainText(
      t('appt.reported.departed', { time: '08:00', name: t('appt.reporter.you') }),
    );
    await expect(card.getByRole('button', { name: t('appt.action.depart') })).toHaveCount(0);

    await card.getByRole('button', { name: t('appt.action.attend') }).click();
    await expect(authedPage.getByText(t('appt.action.attendSuccess'))).toBeVisible();
    await expect(card).toContainText(t('appt.status.attended'));
    await expect(card.getByRole('button', { name: t('appt.action.attend') })).toHaveCount(0);

    expect(store.actions.map((call) => call.url.pathname)).toEqual([
      `/api/appointments/reminders/${TODAY.id}/depart`,
      `/api/appointments/reminders/${TODAY.id}/attend`,
    ]);
  });

  test('畫面過期（家人已在 LINE 回報到診）時按出發：顯示後端的 409 訊息並重抓列表', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [TODAY] });
    await openPage(authedPage);
    const card = upcomingList(authedPage).locator(CARD).first();
    await expect(card.getByRole('button', { name: t('appt.action.depart') })).toBeVisible();

    const FAMILY_ID = 'Ufamily00000000000000000000000009';
    expect(store.apply('attend', TODAY.id, FAMILY_ID).status).toBe(200);
    const getsBefore = store.gets.length;

    await card.getByRole('button', { name: t('appt.action.depart') }).click();

    await expect(authedPage.getByText('e2e：這次門診的狀態已經改變，無法回報出發。')).toBeVisible();
    await expect(card).toContainText(t('appt.status.attended'));
    await expect(card).toContainText(
      t('appt.reported.attended', { time: '08:00', name: t('appt.reporter.family') }),
    );
    await expect(card.getByRole('button', { name: t('appt.action.attend') })).toHaveCount(0);
    expect(store.gets.length).toBeGreaterThan(getsBefore);
  });

  test('取消這次門診：卡片離開即將到來，出現在過去的門診並標成已取消', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [NEXT_WEEK] });
    await openPage(authedPage);

    await editButton(authedPage, NEXT_WEEK).click();
    const dialog = authedPage.getByRole('dialog');
    await dialog.getByRole('button', { name: t('appt.form.cancelVisit') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('appt.form.cancelVisit') })
      .click();

    await expect(authedPage.getByText(t('appt.form.cancelVisitSuccess'))).toBeVisible();
    expect(store.actions.map((call) => call.url.pathname)).toEqual([
      `/api/appointments/reminders/${NEXT_WEEK.id}/cancel`,
    ]);
    await expect(editButton(authedPage, NEXT_WEEK)).toHaveCount(0);
    await expect(authedPage.getByText(t('appt.emptyUpcoming', { name: t('meds.self') }))).toBeVisible();

    await pastToggle(authedPage, 1).click();
    const past = pastList(authedPage).locator(CARD);
    await expect(past).toHaveCount(1);
    await expect(past.first()).toContainText(NEXT_WEEK.hospital_name);
    await expect(past.first()).toContainText(t('appt.status.cancelled'));
  });
});

test.describe('刪除過去的紀錄', () => {
  test('刪除一筆：確認後送出 DELETE，卡片消失、總筆數減一', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [LAST_MONTH, EARLIER] });
    await openPage(authedPage);

    await pastToggle(authedPage, 2).click();
    const which = when(EARLIER.appointment_at);
    await authedPage
      .getByRole('button', {
        name: t('appt.past.deleteAria', {
          when: which.date,
          hospital: EARLIER.hospital_name,
          department: EARLIER.department,
        }),
      })
      .click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('meds.edit.deleteConfirmYes') })
      .click();

    await expect(authedPage.getByText(t('appt.form.deleteSuccess'))).toBeVisible();
    expect(store.deletes.map((call) => call.url.pathname)).toEqual([
      `/api/appointments/reminders/${EARLIER.id}`,
    ]);
    const past = pastList(authedPage).locator(CARD);
    await expect(past).toHaveCount(1);
    await expect(past.first()).toContainText(LAST_MONTH.hospital_name);
    await expect(pastToggle(authedPage, 1)).toBeVisible();
  });

  test('刪除全部：筆數用後端的總筆數，請求不帶 target_user_id，即將到來不受影響', async ({ authedPage }) => {
    const store = await stubAppointmentStore(authedPage, { items: [NEXT_WEEK, ...pastVisits(25)] });
    await openPage(authedPage);

    await pastToggle(authedPage, 25).click();
    await expect(pastList(authedPage).locator(CARD)).toHaveCount(20);

    await authedPage.getByRole('button', { name: t('appt.past.deleteAll', { count: 25 }) }).click();
    const confirm = authedPage.getByRole('alertdialog');
    await expect(confirm).toContainText(t('appt.past.deleteAllConfirm', { count: 25 }));
    await confirm.getByRole('button', { name: t('appt.past.deleteAllYes', { count: 25 }) }).click();

    await expect(authedPage.getByText(t('appt.past.deleteAllSuccess', { count: 25 }))).toBeVisible();
    expect(store.deletePast).toHaveLength(1);
    const params = store.deletePast[0].url.searchParams;
    expect(params.get('scope')).toBe('past');
    expect(params.has('target_user_id')).toBe(false);

    await expect(anyPastToggle(authedPage)).toHaveCount(0);
    await expect(editButton(authedPage, NEXT_WEEK)).toBeVisible();
  });
});

test.describe('替家人查看', () => {
  test('只有讀取權的家人：帶對方的 target_user_id，看得到門診但沒有新增、編輯與回報', async ({ authedPage }) => {
    const GRANDMA = FAMILY_MEMBERS[0];
    await stubFamily(authedPage, [GRANDMA]);
    const store = await stubAppointmentStore(authedPage, {
      items: [TODAY, appointment({ ...TODAY, id: 'appt-grandma', user_id: GRANDMA.user_id, hospital_name: '和平醫院' })],
    });
    await openPage(authedPage);
    await expect(editButton(authedPage, TODAY)).toBeVisible();

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();

    const card = upcomingList(authedPage).locator(CARD);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('和平醫院');
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(authedPage.getByRole('button', { name: t('appt.addButton'), exact: true })).toHaveCount(0);
    expect(
      store.gets.some((call) => call.url.searchParams.get('target_user_id') === GRANDMA.user_id),
    ).toBe(true);
  });
});
