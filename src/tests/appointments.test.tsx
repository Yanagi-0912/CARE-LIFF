import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import * as appointmentApi from '../api/appointmentApi';
import { AppointmentApiError } from '../api/appointmentApi';
import * as medicalApi from '../api/medicalApi';
import AppointmentsPage from '../pages/Appointments';
import { appointmentFeatureMessages } from '../i18n/appointmentMessages';
import type { AppointmentPage, AppointmentReminder } from '../types/appointment';
import type { ClinicDaySchedule, MedicalFacility } from '../types/medical';
import i18n from '../i18n';

// AppointmentApiError 要用真的類別：頁面靠 instanceof 判斷狀態碼
vi.mock('../api/appointmentApi', async () => {
  const actual = await vi.importActual<typeof import('../api/appointmentApi')>(
    '../api/appointmentApi',
  );
  return {
    ...actual,
    fetchAppointmentList: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    deletePastAppointments: vi.fn(),
    departAppointment: vi.fn(),
    attendAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  };
});

vi.mock('../api/medicalApi', () => ({
  searchFacilitiesByName: vi.fn(),
  fetchNearbyHospitals: vi.fn(),
  fetchFacilityById: vi.fn(),
}));

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    // 權限欄位不能省：familyPermissions 是 fail-closed 的。
    // 媽媽是 GUARDIAN（可讀可寫）。爸爸是 MEMBER，家庭在影子模式：my_permissions
    // 仍回報 GENERAL WRITE（legacy），嚴格判定只有 READ——掛號的寫入看的是後者。
    members: [
      {
        user_id: 'U-mom',
        relationship_type: 'parent',
        display_name: '媽媽',
        my_role: 'GUARDIAN',
        my_permissions: {
          general: ['READ', 'WRITE'],
          sensitive: ['READ', 'WRITE'],
          private: ['READ'],
        },
        my_strict_permissions: {
          general: ['READ', 'WRITE'],
          sensitive: ['READ', 'WRITE'],
          private: ['READ'],
        },
      },
      {
        user_id: 'U-dad',
        relationship_type: 'parent',
        display_name: '爸爸',
        my_role: 'MEMBER',
        my_permissions: { general: ['READ', 'WRITE'], sensitive: ['READ'], private: ['READ'] },
        my_strict_permissions: { general: ['READ'], sensitive: [], private: [] },
      },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

/** 門診當天早上 08:40（台灣時間） */
const NOW = new Date('2026-09-15T08:40:00+08:00');

const weekdaySchedule: ClinicDaySchedule = {
  isClosed: false,
  slots: [
    { open: '08:30', close: '12:00' },
    { open: '13:30', close: '17:30' },
  ],
};

const facility: MedicalFacility = {
  id: 'fac-1',
  name: '國立臺灣大學醫學院附設醫院',
  latitude: 25.0408,
  longitude: 121.5188,
  address: '臺北市中正區中山南路7號',
  phone: '02-23123456',
  type: '醫院',
  distance_meters: null,
  clinic_time: {
    monday: weekdaySchedule,
    tuesday: weekdaySchedule,
    wednesday: weekdaySchedule,
    thursday: weekdaySchedule,
    friday: weekdaySchedule,
    saturday: { isClosed: false, slots: [{ open: '08:30', close: '12:00' }] },
    sunday: { isClosed: true, slots: [] },
  },
  departments: ['心臟內科', '家庭醫學科', '急診醫學科'],
  notes: null,
  business_status: { status: 'open', next_open: null, note: null, has_emergency: true },
};

function makeAppointment(overrides: Partial<AppointmentReminder> = {}): AppointmentReminder {
  return {
    id: 'a-today',
    user_id: 'U-self',
    creator_user_id: 'U-self',
    appointment_at: '2026-09-15T09:30:00+08:00',
    facility_id: 'fac-1',
    hospital_name: '臺大醫院',
    hospital_address: '臺北市中正區中山南路7號',
    hospital_phone: '0223123456',
    department: '心臟內科',
    doctor_name: '林建宏',
    serial_number: '23',
    note: null,
    status: 'scheduled',
    departed_at: null,
    departed_by_user_id: null,
    attended_at: null,
    attended_by_user_id: null,
    enabled: true,
    notify_at: [
      '2026-09-15T08:30:00+08:00',
      '2026-09-15T09:30:00+08:00',
      '2026-09-15T10:00:00+08:00',
    ],
    created_at: '2026-09-14T10:00:00+08:00',
    updated_at: '2026-09-14T10:00:00+08:00',
    ...overrides,
  };
}

const today = makeAppointment();
const later = makeAppointment({
  id: 'a-later',
  creator_user_id: 'U-mom',
  appointment_at: '2026-09-18T14:10:00+08:00',
  facility_id: null,
  hospital_name: '仁愛診所',
  hospital_address: null,
  hospital_phone: null,
  department: '家庭醫學科',
  doctor_name: null,
  serial_number: null,
  notify_at: [
    '2026-09-18T13:10:00+08:00',
    '2026-09-18T14:10:00+08:00',
    '2026-09-18T14:40:00+08:00',
  ],
});
/** 上個月去過的臺大醫院心臟內科，已到診 */
const pastVisit = makeAppointment({
  id: 'a-past',
  appointment_at: '2026-08-25T10:00:00+08:00',
  serial_number: '8',
  note: '記得帶上次的抽血報告',
  status: 'attended',
  attended_at: '2026-08-25T09:52:00+08:00',
  attended_by_user_id: 'U-self',
  notify_at: [],
});
/** 5 天前沒去成的馬偕骨科：未到診，還在「需要處理」的 7 天內 */
const missedVisit = makeAppointment({
  id: 'a-missed',
  appointment_at: '2026-09-10T10:00:00+08:00',
  facility_id: 'fac-2',
  hospital_name: '馬偕紀念醫院',
  hospital_address: null,
  hospital_phone: null,
  department: '骨科',
  doctor_name: '陳志明',
  serial_number: null,
  status: 'missed',
  notify_at: [],
});

const page = (
  items: AppointmentReminder[],
  nextCursor: string | null = null,
  totalCount = items.length,
): AppointmentPage => ({ items, next_cursor: nextCursor, total_count: totalCount });

let lists: { upcoming: AppointmentReminder[]; past: AppointmentReminder[] } = {
  upcoming: [],
  past: [],
};
/**
 * 兩區各回什麼。後端已經分好區、排好序（即將到來由早到晚、過去由新到舊），
 * 頁面照順序顯示，不再自己分區。在 mock 裡改它，下一次重抓就會拿到新的內容。
 */
const mockLists = (next: { upcoming?: AppointmentReminder[]; past?: AppointmentReminder[] }) => {
  lists = { upcoming: next.upcoming ?? [], past: next.past ?? [] };
};
const upcomingCalls = () =>
  vi.mocked(appointmentApi.fetchAppointmentList).mock.calls.filter(([, scope]) => scope === 'upcoming')
    .length;

describe('AppointmentsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 只假 Date：計時器維持真的，waitFor 與 TanStack Query 的排程才不會卡住
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
    vi.mocked(appointmentApi.fetchAppointmentList).mockImplementation(async (_target, scope) =>
      page(scope === 'upcoming' ? lists.upcoming : lists.past),
    );
    mockLists({ upcoming: [today, later] });
    vi.mocked(medicalApi.fetchFacilityById).mockResolvedValue(facility);
    vi.mocked(medicalApi.searchFacilitiesByName).mockResolvedValue({
      facilities: [facility],
      count: 1,
      total_count: 1,
    });
    vi.mocked(appointmentApi.createAppointment).mockImplementation(async (req) =>
      makeAppointment({ id: 'a-new', ...req }),
    );
    await i18n.changeLanguage('zh-TW');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderPage = () =>
    renderWithToaster(
      <MemoryRouter>
        <AppointmentsPage />
      </MemoryRouter>,
    );

  const openCreateDialog = async () => {
    renderPage();
    // 等清單載入：常去的醫院與衝突檢查都靠它
    await screen.findByLabelText('掛號提醒列表');
    fireEvent.click(screen.getByRole('button', { name: '新增' }));
    return screen.findByRole('dialog');
  };

  const nextStep = (dialog: HTMLElement) =>
    fireEvent.click(within(dialog).getByRole('button', { name: '下一步' }));

  /** 第一步：搜尋並點選院所。點選後自動進到第二步 */
  const pickFacility = async (dialog: HTMLElement, name = /國立臺灣大學醫學院附設醫院/) => {
    fireEvent.change(within(dialog).getByLabelText('院所名稱'), { target: { value: '臺大' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '查詢' }));
    fireEvent.click(await within(dialog).findByRole('button', { name }));
    await within(dialog).findByLabelText('門診日期');
  };

  /** 第一步：手動輸入院所名稱，按下一步 */
  const enterHospitalManually = async (dialog: HTMLElement, name: string) => {
    fireEvent.click(within(dialog).getByRole('button', { name: '找不到？手動輸入醫院名稱' }));
    fireEvent.change(within(dialog).getByLabelText('醫院名稱'), { target: { value: name } });
    nextStep(dialog);
    await within(dialog).findByLabelText('門診日期');
  };

  /** 第二步 → 第三步 → 確認頁 */
  const goToConfirm = async (dialog: HTMLElement) => {
    nextStep(dialog);
    await within(dialog).findByLabelText('醫師（選填）');
    nextStep(dialog);
    await within(dialog).findByRole('button', { name: '建立提醒' });
  };

  const setDate = (dialog: HTMLElement, value: string) =>
    fireEvent.change(within(dialog).getByLabelText('門診日期'), { target: { value } });

  // 門診時間是兩個 24 小時制的選單（Base UI Select）：trigger 是 combobox、
  // 選項是 option，彈出層在 portal 裡，所以選項用 screen 找。
  const hourSelect = (dialog: HTMLElement) =>
    within(dialog).getByRole('combobox', { name: '門診時間：幾點' });
  const minuteSelect = (dialog: HTMLElement) =>
    within(dialog).getByRole('combobox', { name: '門診時間：幾分' });
  const choose = async (trigger: HTMLElement, option: string | RegExp) => {
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: option }));
  };
  const setTime = async (dialog: HTMLElement, hour: string | RegExp, minute: string) => {
    await choose(hourSelect(dialog), hour);
    await choose(minuteSelect(dialog), minute);
  };

  const openEdit = async () => {
    fireEvent.click(
      await screen.findByRole('button', { name: '編輯 9/15（週二） 09:30 臺大醫院 的掛號提醒' }),
    );
    return screen.findByRole('dialog');
  };

  // ── 列表 ───────────────────────────────────────────────────────────

  it('卡片顯示院所、科別、醫師、看診號與推播時間', async () => {
    renderPage();

    const list = await screen.findByLabelText('掛號提醒列表');
    expect(within(list).getByText('9/15（週二）')).toBeInTheDocument();
    // 科別、醫師、看診號各自一列、各有標籤，不再擠成一行灰字
    const first = within(list).getAllByRole('button', { name: /的掛號提醒$/ })[0];
    expect(within(first).getByText('今天')).toBeInTheDocument();
    expect(within(first).getByText('科別')).toBeInTheDocument();
    expect(within(first).getByText('心臟內科')).toBeInTheDocument();
    expect(within(first).getByText('醫師')).toBeInTheDocument();
    expect(within(first).getByText('林建宏')).toBeInTheDocument();
    expect(within(first).getByText('看診號')).toBeInTheDocument();
    expect(within(first).getByText('23')).toBeInTheDocument();
    expect(within(list).getAllByText('待看診')).toHaveLength(2);
    // 第三個時間點只發給家屬，文案必須講清楚是「通知家人」
    expect(
      within(list).getByText('會在 08:30、09:30 提醒；到 10:00 還沒回報到診，會通知家人。'),
    ).toBeInTheDocument();
  });

  it('每張卡片都是同一個白底（不交錯底色），備註放在自己的區塊', async () => {
    mockLists({
      upcoming: [
        { ...today, note: '記得帶上次的抽血報告' },
        later,
        makeAppointment({ id: 'a-third', appointment_at: '2026-09-20T10:00:00+08:00' }),
      ],
    });
    renderPage();

    const list = await screen.findByLabelText('掛號提醒列表');
    // 交錯底色試過、效果很亂，使用者要求統一白底
    const cards = Array.from(list.children);
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card).toHaveClass('bg-card');
      expect(card).not.toHaveClass('bg-surface-2');
    }
    expect(within(list).getByText('備註')).toBeInTheDocument();
    expect(within(list).getByText('記得帶上次的抽血報告')).toBeInTheDocument();
    // 9/16 是明天的話才有「明天」；9/18、9/20 都不是
    expect(within(list).queryByText('明天')).not.toBeInTheDocument();
  });

  it('只有門診當天才出現回報按鈕，按下「我已到診」後以回應更新卡片', async () => {
    vi.mocked(appointmentApi.attendAppointment).mockResolvedValue({
      ...today,
      status: 'attended',
      attended_at: '2026-09-15T08:40:00+08:00',
      attended_by_user_id: 'U-self',
      notify_at: [],
    });
    renderPage();
    await screen.findByLabelText('掛號提醒列表');

    // 今天那一筆有兩顆；9/18 那一筆一顆都沒有（後端在門診當天以前一律回 409）
    expect(screen.getAllByRole('button', { name: '我已出發' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '我已到診' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '我已到診' }));

    await waitFor(() => expect(appointmentApi.attendAppointment).toHaveBeenCalledWith('a-today'));
    expect(await screen.findByText('08:40 由您回報到診')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '我已到診' })).not.toBeInTheDocument();
    expect(
      await screen.findByText('已記錄到診，這次門診後續的提醒已全部停止'),
    ).toBeInTheDocument();
  });

  it('已出發的門診只剩「我已到診」，並寫出是誰代為回報', async () => {
    mockLists({
      upcoming: [
        {
          ...today,
          status: 'departed',
          departed_at: '2026-09-15T08:35:00+08:00',
          departed_by_user_id: 'U-mom',
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('08:35 由媽媽回報出發')).toBeInTheDocument();
    expect(screen.getByText('已出發')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '我已出發' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我已到診' })).toBeInTheDocument();
  });

  it('只有讀取權的家人：影子模式下 my_permissions 仍說可寫，照嚴格權限一個寫入入口都不給', async () => {
    vi.mocked(appointmentApi.fetchAppointmentList).mockImplementation(async (target, scope) => {
      if (target !== 'U-dad') return page([]);
      return scope === 'upcoming'
        ? page([{ ...today, id: 'a-dad', user_id: 'U-dad' }])
        : page([
            { ...missedVisit, id: 'a-dad-missed', user_id: 'U-dad' },
            { ...pastVisit, id: 'a-dad-past', user_id: 'U-dad' },
          ]);
    });
    renderPage();
    expect(await screen.findByRole('button', { name: '新增' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '爸爸' }));

    await waitFor(() =>
      expect(appointmentApi.fetchAppointmentList).toHaveBeenCalledWith('U-dad', 'upcoming'),
    );
    expect(await screen.findByText('臺大醫院')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '我已到診' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /的掛號提醒$/ })).not.toBeInTheDocument();
    // 需要處理只給能處理的人：爸爸的未到診照樣在過去的門診裡，但不會出現在上方
    expect(screen.queryByText('需要處理')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '過去的門診（2）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    expect(within(pastList).getByText('馬偕紀念醫院')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^再掛一次/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^刪除/ })).not.toBeInTheDocument();
  });

  it('回報撞到 409 時顯示後端的說明並重抓清單', async () => {
    vi.mocked(appointmentApi.attendAppointment).mockRejectedValue(
      new AppointmentApiError(409, '這個門診的當天已經結束，無法再回報出發或到診。'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '我已到診' }));

    expect(
      await screen.findByText('這個門診的當天已經結束，無法再回報出發或到診。'),
    ).toBeInTheDocument();
    await waitFor(() => expect(upcomingCalls()).toBe(2));
  });

  it('非繁中語系不顯示後端的中文 detail，改用依狀態碼的譯文', async () => {
    await i18n.changeLanguage('en');
    vi.mocked(appointmentApi.attendAppointment).mockRejectedValue(
      new AppointmentApiError(409, '這個門診的當天已經結束，無法再回報出發或到診。'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: "I've arrived" }));

    expect(
      await screen.findByText(
        'This appointment was updated. The list has been refreshed; please check again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/當天已經結束/)).not.toBeInTheDocument();
  });

  // ── 新增：四個步驟 ─────────────────────────────────────────────────

  it('新增分四步：找醫院 → 科別與時間 → 醫師與備註 → 確認，送出帶 offset 的時間', async () => {
    const dialog = await openCreateDialog();
    expect(within(dialog).getByText('第 1 步，共 4 步')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '找醫院' })).toBeInTheDocument();

    await pickFacility(dialog);
    // 點選院所就直接進到第二步，不必再按一次「下一步」
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '科別與時間' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '心臟內科' }));
    setDate(dialog, '2026-09-16');
    // 9/16 是週三，院所資料的週三有上午、下午兩段
    fireEvent.click(within(dialog).getByRole('button', { name: '08:30–12:00' }));
    expect(hourSelect(dialog)).toHaveTextContent('08 時（上午 8 點）');
    expect(minuteSelect(dialog)).toHaveTextContent('30 分');
    await setTime(dialog, '09 時（上午 9 點）', '47 分');
    expect(within(dialog).queryByText(/不在我們查到的門診時段內/)).not.toBeInTheDocument();

    nextStep(dialog);
    expect(await within(dialog).findByText('這一頁都可以不填，直接按「下一步」。')).toBeInTheDocument();
    expect(within(dialog).getByText('第 3 步，共 4 步')).toBeInTheDocument();
    nextStep(dialog);

    // 確認頁跟列表上的卡片同一個樣子
    await within(dialog).findByRole('button', { name: '建立提醒' });
    expect(within(dialog).getByText('第 4 步，共 4 步')).toBeInTheDocument();
    expect(within(dialog).getByText('9/16（週三）')).toBeInTheDocument();
    expect(within(dialog).getByText('09:47')).toBeInTheDocument();
    expect(within(dialog).getByText('國立臺灣大學醫學院附設醫院')).toBeInTheDocument();
    expect(within(dialog).getByText('心臟內科')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));

    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    const req = vi.mocked(appointmentApi.createAppointment).mock.calls[0][0];
    expect(req).toMatchObject({
      user_id: 'U-self',
      facility_id: 'fac-1',
      hospital_name: '國立臺灣大學醫學院附設醫院',
      hospital_address: '臺北市中正區中山南路7號',
      hospital_phone: '02-23123456',
      department: '心臟內科',
      doctor_name: null,
      serial_number: null,
      note: null,
    });
    // offset 取自裝置時區，測試機不一定在台灣，只驗格式
    expect(req.appointment_at).toMatch(/^2026-09-16T09:47:00[+-]\d{2}:\d{2}$/);
    expect(await screen.findByText('已建立掛號提醒')).toBeInTheDocument();
  });

  it('沒選醫院就按下一步：就地說明，停在第一步', async () => {
    const dialog = await openCreateDialog();

    nextStep(dialog);

    expect(await within(dialog).findByText('請選擇或輸入醫院')).toBeInTheDocument();
    expect(within(dialog).getByText('第 1 步，共 4 步')).toBeInTheDocument();
  });

  it('按「上一步」回去，已經填的內容都還在', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '心臟內科' }));
    setDate(dialog, '2026-09-16');
    await setTime(dialog, '10 時（上午 10 點）', '15 分');
    nextStep(dialog);
    fireEvent.change(await within(dialog).findByLabelText('醫師（選填）'), {
      target: { value: '林建宏' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: '上一步' }));

    expect(await within(dialog).findByLabelText('門診日期')).toHaveValue('2026-09-16');
    expect(hourSelect(dialog)).toHaveTextContent('10 時');
    expect(minuteSelect(dialog)).toHaveTextContent('15 分');
    expect(within(dialog).getByRole('button', { name: '心臟內科' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    nextStep(dialog);
    expect(await within(dialog).findByLabelText('醫師（選填）')).toHaveValue('林建宏');
  });

  it('時間落在查到的門診時段外只提示，確認頁再講一次，仍然可以送出', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: '心臟內科' }));
    setDate(dialog, '2026-09-16');
    // 先選時，分鐘自動帶 00
    await choose(hourSelect(dialog), '19 時（晚上 7 點）');
    expect(minuteSelect(dialog)).toHaveTextContent('00 分');
    expect(within(dialog).getByText(/不在我們查到的門診時段內/)).toBeInTheDocument();

    await goToConfirm(dialog);
    expect(within(dialog).getByText(/不在我們查到的門診時段內/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));

    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(appointmentApi.createAppointment).mock.calls[0][0].appointment_at).toMatch(
      /^2026-09-16T19:00:00/,
    );
  });

  it('查不到院所時可以手動輸入，facility_id 與地址電話送 null', async () => {
    const dialog = await openCreateDialog();
    await enterHospitalManually(dialog, '仁愛診所');

    fireEvent.change(within(dialog).getByLabelText('科別'), { target: { value: '家庭醫學科' } });
    setDate(dialog, '2026-09-18');
    // 14:20 而不是 14:10：清單裡已經有一筆 9/18 14:10 仁愛診所家庭醫學科，
    // 同一時間會被當成重複擋下（那是另一條測試要驗的事）
    await setTime(dialog, '14 時（下午 2 點）', '20 分');
    // 手動輸入的院所沒有門診表：不提示休診，也不說查不到
    expect(within(dialog).queryByText(/休診/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/查不到這家院所/)).not.toBeInTheDocument();

    await goToConfirm(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));

    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(appointmentApi.createAppointment).mock.calls[0][0]).toMatchObject({
      facility_id: null,
      hospital_name: '仁愛診所',
      hospital_address: null,
      hospital_phone: null,
      department: '家庭醫學科',
    });
  });

  it('門診時間已經過了：第二步就擋下，不往下走', async () => {
    const dialog = await openCreateDialog();
    await enterHospitalManually(dialog, '仁愛診所');
    fireEvent.change(within(dialog).getByLabelText('科別'), { target: { value: '家庭醫學科' } });
    // 「今天、但比現在早幾分鐘」：日期欄的 min 是今天，填前一天會被瀏覽器原生的
    // 範圍驗證擋在送出之前（jsdom 也一樣），那不是這裡要驗的東西。
    // 用裝置的本地時間組字串，無論測試機在哪個時區都成立。
    const earlier = new Date(NOW.getTime() - 5 * 60_000);
    const pad = (n: number) => `${n}`.padStart(2, '0');
    setDate(
      dialog,
      `${earlier.getFullYear()}-${pad(earlier.getMonth() + 1)}-${pad(earlier.getDate())}`,
    );
    await setTime(
      dialog,
      new RegExp(`^${pad(earlier.getHours())} 時`),
      `${pad(earlier.getMinutes())} 分`,
    );

    nextStep(dialog);

    expect(
      await within(dialog).findByText('門診時間已經過了，請確認日期與時間。'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('醫師（選填）')).not.toBeInTheDocument();
    expect(appointmentApi.createAppointment).not.toHaveBeenCalled();
  });

  it('點下午、晚上的時段，時間欄顯示 24 小時制，不會被讀成 2:00、7:00', async () => {
    // 回報的診所：08:00–12:00、14:00–18:00、19:00–21:00
    const split = {
      isClosed: false,
      slots: [
        { open: '08:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
        { open: '19:00', close: '21:00' },
      ],
    };
    vi.mocked(medicalApi.searchFacilitiesByName).mockResolvedValue({
      facilities: [
        { ...facility, id: 'fac-2', name: '安心家庭醫學科診所', clinic_time: { wednesday: split } },
      ],
      count: 1,
      total_count: 1,
    });
    const dialog = await openCreateDialog();
    await pickFacility(dialog, /安心家庭醫學科診所/);
    setDate(dialog, '2026-09-16');

    fireEvent.click(within(dialog).getByRole('button', { name: '14:00–18:00' }));
    expect(hourSelect(dialog)).toHaveTextContent('14 時（下午 2 點）');
    expect(minuteSelect(dialog)).toHaveTextContent('00 分');

    fireEvent.click(within(dialog).getByRole('button', { name: '19:00–21:00' }));
    expect(hourSelect(dialog)).toHaveTextContent('19 時（晚上 7 點）');
  });

  it('院所那天休診時明講（確認頁也講），但不擋送出', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog);
    // 9/20 是週日，院所資料標成休診
    setDate(dialog, '2026-09-20');

    const closed =
      '我們查到的資料顯示，這家院所週日休診。請再對一次掛號單上的日期，確認沒錯仍可建立。';
    expect(within(dialog).getByText(closed)).toBeInTheDocument();
    expect(within(dialog).queryByText(/這天查到的門診時段/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '心臟內科' }));
    await choose(hourSelect(dialog), '09 時（上午 9 點）');
    await goToConfirm(dialog);
    expect(within(dialog).getByText(closed)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));
    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
  });

  it('院所沒有那天的門診資料時說「查不到」，而不是什麼都不講', async () => {
    vi.mocked(medicalApi.searchFacilitiesByName).mockResolvedValue({
      facilities: [{ ...facility, clinic_time: null }],
      count: 1,
      total_count: 1,
    });
    const dialog = await openCreateDialog();
    await pickFacility(dialog);
    setDate(dialog, '2026-09-16');

    expect(
      within(dialog).getByText('查不到這家院所週三的門診時段，請以掛號單上的時間為準。'),
    ).toBeInTheDocument();
  });

  // ── 時段衝突：第二步就擋 ───────────────────────────────────────────

  it('同一時間、同醫院、同科別已經有一筆：講清楚是哪一筆，停在第二步', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog); // fac-1，與清單裡 9/15 09:30 那一筆同一家
    fireEvent.click(within(dialog).getByRole('button', { name: '心臟內科' }));
    setDate(dialog, '2026-09-15');
    await setTime(dialog, '09 時（上午 9 點）', '30 分');

    const message =
      '這個時間已經有一筆同醫院、同科別的掛號提醒（9/15（週二） 09:30），不需要重複建立。';
    // 一選到衝突的時間就先講，不等按下一步
    expect(within(dialog).getByText(message)).toBeInTheDocument();

    nextStep(dialog);
    // 按下一步後訊息移到時間欄位的錯誤上，上方的提示收起來，同一句話只出現一次
    await waitFor(() =>
      expect(
        within(dialog).getByText(message).closest('[data-slot="field-error"]'),
      ).not.toBeNull(),
    );
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
    expect(appointmentApi.createAppointment).not.toHaveBeenCalled();
  });

  it('同一時間但不同科別也算撞時段：一樣擋下', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '家庭醫學科' }));
    setDate(dialog, '2026-09-15');
    await setTime(dialog, '09 時（上午 9 點）', '30 分');

    const message =
      '這個時間已經有另一筆掛號：臺大醫院 心臟內科（9/15（週二） 09:30）。同一個人不能同時看兩個門診，請改時間，或回列表修改那一筆。';
    expect(within(dialog).getByText(message)).toBeInTheDocument();

    nextStep(dialog);
    await waitFor(() =>
      expect(
        within(dialog).getByText(message).closest('[data-slot="field-error"]'),
      ).not.toBeNull(),
    );
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
  });

  it('撞時段被擋下後改一個時間就能往下走並建立', async () => {
    const dialog = await openCreateDialog();
    await pickFacility(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '家庭醫學科' }));
    setDate(dialog, '2026-09-15');
    await setTime(dialog, '09 時（上午 9 點）', '30 分');
    nextStep(dialog);
    await within(dialog).findByText(/同一個人不能同時看兩個門診/);

    await choose(minuteSelect(dialog), '45 分');
    await waitFor(() =>
      expect(within(dialog).queryByText(/同一個人不能同時看兩個門診/)).not.toBeInTheDocument(),
    );

    await goToConfirm(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));
    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(appointmentApi.createAppointment).mock.calls[0][0].appointment_at).toMatch(
      /^2026-09-15T09:45:00/,
    );
  });

  it('後端擋下重複（清單過期）時，非繁中語系顯示「重複」而不是「狀態已更新」', async () => {
    await i18n.changeLanguage('en');
    vi.mocked(appointmentApi.createAppointment).mockRejectedValue(
      new AppointmentApiError(409, '這個時間已經有一筆掛號提醒，同一個時間只能有一筆。'),
    );
    renderPage();
    await screen.findByLabelText('Appointment reminders');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(
      within(dialog).getByRole('button', { name: "Can't find it? Enter the hospital name yourself" }),
    );
    fireEvent.change(within(dialog).getByLabelText('Hospital name'), { target: { value: '仁愛診所' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    fireEvent.change(await within(dialog).findByLabelText('Department'), {
      target: { value: '眼科' },
    });
    fireEvent.change(within(dialog).getByLabelText('Visit date'), {
      target: { value: '2026-09-18' },
    });
    await choose(within(dialog).getByRole('combobox', { name: 'Visit time: hour' }), '14h (2 PM)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await within(dialog).findByLabelText('Doctor (optional)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Create reminder' }));

    expect(
      await within(dialog).findByText(
        'There is already another appointment reminder at this time, so this one cannot be added. Please change the time.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(upcomingCalls()).toBe(2));
  });

  // ── 編輯：直接打開確認頁 ───────────────────────────────────────────

  it('編輯直接打開確認頁；改醫師那一段、清空後送出 null，沒改的欄位一個都不送', async () => {
    vi.mocked(appointmentApi.updateAppointment).mockImplementation(async (_id, patch) => ({
      ...today,
      ...patch,
    }));
    renderPage();
    const dialog = await openEdit();

    expect(within(dialog).getByText('第 4 步，共 4 步')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '刪除這筆紀錄' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '取消這次門診' })).toBeInTheDocument();
    // 只存了 facility_id，科別與門診時段要依 id 重抓
    await waitFor(() => expect(medicalApi.fetchFacilityById).toHaveBeenCalledWith('fac-1'));

    fireEvent.click(within(dialog).getByRole('button', { name: '修改醫師、看診號與備註' }));
    const doctor = await within(dialog).findByLabelText('醫師（選填）');
    expect(doctor).toHaveValue('林建宏');
    fireEvent.change(doctor, { target: { value: '' } });
    nextStep(dialog);
    fireEvent.click(await within(dialog).findByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(appointmentApi.updateAppointment).toHaveBeenCalledWith('a-today', {
        doctor_name: null,
      }),
    );
  });

  it('已到診的掛號只能改備註：醫院、科別、時間、醫師都沒有入口', async () => {
    const attended: AppointmentReminder = {
      ...today,
      status: 'attended',
      attended_at: '2026-09-15T08:40:00+08:00',
      attended_by_user_id: 'U-self',
      notify_at: [],
    };
    mockLists({ upcoming: [attended] });
    vi.mocked(appointmentApi.updateAppointment).mockImplementation(async (_id, patch) => ({
      ...attended,
      ...patch,
    }));
    renderPage();
    const dialog = await openEdit();

    expect(
      within(dialog).getByText(
        '已經回報到診，醫院、科別、門診時間與醫師都不能再改，只能修改備註。如果是另一次門診，請新增一筆掛號提醒。',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '修改醫院' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '修改科別與時間' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: '修改醫師、看診號與備註' }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '修改備註' }));
    expect(await within(dialog).findByLabelText('備註（選填）')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('醫師（選填）')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('看診號（選填）')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('推播提醒')).not.toBeInTheDocument();

    // 「上一步」直接回確認頁，不會走到科別與時間
    fireEvent.click(within(dialog).getByRole('button', { name: '上一步' }));
    expect(await within(dialog).findByRole('button', { name: '修改備註' })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('門診日期')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '修改備註' }));
    fireEvent.change(await within(dialog).findByLabelText('備註（選填）'), {
      target: { value: '醫師說三個月後回診' },
    });
    nextStep(dialog);
    fireEvent.click(await within(dialog).findByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(appointmentApi.updateAppointment).toHaveBeenCalledWith('a-today', {
        note: '醫師說三個月後回診',
      }),
    );
  });

  // ── 回診 ───────────────────────────────────────────────────────────

  it('常去的醫院：從既有的掛號整理出來，點一下就帶入並進到第二步', async () => {
    mockLists({ upcoming: [today, later], past: [pastVisit] });
    const dialog = await openCreateDialog();

    const frequent = within(dialog).getByRole('group', { name: '常去的醫院' });
    const options = within(frequent).getAllByRole('button');
    // 臺大醫院出現兩次（今天、8/25）只列一次，而且排在只去過一次的仁愛診所前面
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('臺大醫院');
    expect(options[1]).toHaveTextContent('仁愛診所');

    fireEvent.click(options[0]);
    expect(await within(dialog).findByText('第 2 步，共 4 步')).toBeInTheDocument();
    // 只知道 facility_id，科別與門診時段依 id 重抓
    await waitFor(() => expect(medicalApi.fetchFacilityById).toHaveBeenCalledWith('fac-1'));

    fireEvent.click(await within(dialog).findByRole('button', { name: '家庭醫學科' }));
    setDate(dialog, '2026-09-22');
    await setTime(dialog, '10 時（上午 10 點）', '00 分');
    await goToConfirm(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '建立提醒' }));

    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(appointmentApi.createAppointment).mock.calls[0][0]).toMatchObject({
      facility_id: 'fac-1',
      hospital_name: '臺大醫院',
      hospital_address: '臺北市中正區中山南路7號',
      hospital_phone: '0223123456',
      department: '家庭醫學科',
    });
  });

  it('過去的門診預設收起；展開後「再掛一次」帶入醫院、科別、醫師，不帶看診號與備註', async () => {
    mockLists({ upcoming: [today], past: [pastVisit] });
    renderPage();

    const list = await screen.findByLabelText('掛號提醒列表');
    // 過去的門診不混在接下來的門診裡
    expect(within(list).queryByText('8/25（週二）')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^再掛一次/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '過去的門診（1）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    expect(within(pastList).getByText('8/25（週二）')).toBeInTheDocument();
    expect(within(pastList).getByText('已到診')).toBeInTheDocument();

    fireEvent.click(within(pastList).getByRole('button', { name: '再掛一次：臺大醫院 心臟內科' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: '再掛一次' })).toBeInTheDocument();
    // 醫院已經帶好，從第二步開始
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
    expect(await within(dialog).findByRole('button', { name: '心臟內科' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    setDate(dialog, '2026-09-22');
    await setTime(dialog, '10 時（上午 10 點）', '00 分');
    nextStep(dialog);
    expect(await within(dialog).findByLabelText('醫師（選填）')).toHaveValue('林建宏');
    expect(within(dialog).getByLabelText('看診號（選填）')).toHaveValue('');
    expect(within(dialog).getByLabelText('備註（選填）')).toHaveValue('');
    nextStep(dialog);
    fireEvent.click(await within(dialog).findByRole('button', { name: '建立提醒' }));

    await waitFor(() => expect(appointmentApi.createAppointment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(appointmentApi.createAppointment).mock.calls[0][0]).toMatchObject({
      facility_id: 'fac-1',
      hospital_name: '臺大醫院',
      department: '心臟內科',
      doctor_name: '林建宏',
      serial_number: null,
      note: null,
    });
  });

  it('過去的紀錄可以單筆刪除：先確認，確認後才真的刪', async () => {
    mockLists({ upcoming: [today], past: [pastVisit] });
    vi.mocked(appointmentApi.deleteAppointment).mockResolvedValue({ ok: true });
    renderPage();
    await screen.findByLabelText('掛號提醒列表');

    fireEvent.click(screen.getByRole('button', { name: '過去的門診（1）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    fireEvent.click(
      within(pastList).getByRole('button', {
        name: '刪除 8/25（週二） 臺大醫院 心臟內科 的紀錄',
      }),
    );

    // 確認框沒按之前不會刪
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/刪除後無法復原/)).toBeInTheDocument();
    expect(appointmentApi.deleteAppointment).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: '確定刪除' }));

    await waitFor(() => expect(appointmentApi.deleteAppointment).toHaveBeenCalledWith('a-past'));
    expect(await screen.findByText('已刪除這筆紀錄')).toBeInTheDocument();
  });

  it('刪除失敗時顯示後端的說明，紀錄留在畫面上', async () => {
    mockLists({ upcoming: [today], past: [pastVisit] });
    vi.mocked(appointmentApi.deleteAppointment).mockRejectedValue(
      new AppointmentApiError(403, '您沒有權限替這位使用者設定掛號提醒。'),
    );
    renderPage();
    await screen.findByLabelText('掛號提醒列表');

    fireEvent.click(screen.getByRole('button', { name: '過去的門診（1）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    fireEvent.click(
      within(pastList).getByRole('button', {
        name: '刪除 8/25（週二） 臺大醫院 心臟內科 的紀錄',
      }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '確定刪除' }),
    );

    expect(
      await screen.findByText('您沒有權限替這位使用者設定掛號提醒。'),
    ).toBeInTheDocument();
    expect(within(await screen.findByLabelText('過去的門診')).getByText('8/25（週二）')).toBeInTheDocument();
  });

  it('只有過去的門診時，空狀態說「目前沒有要去的門診」而不是「還沒有設定」', async () => {
    mockLists({ past: [pastVisit] });
    renderPage();

    expect(await screen.findByText('「我自己」目前沒有要去的門診')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '過去的門診（1）' })).toBeInTheDocument();
  });

  // ── 取消這次門診 ───────────────────────────────────────────────────

  it('取消這次門診：確認後才送出，卡片移到過去的門診，提示講清楚它去了哪裡', async () => {
    const cancelled: AppointmentReminder = {
      ...today,
      status: 'cancelled',
      cancelled_at: '2026-09-15T08:40:00+08:00',
      cancelled_by_user_id: 'U-self',
      notify_at: [],
    };
    vi.mocked(appointmentApi.cancelAppointment).mockImplementation(async () => {
      mockLists({ upcoming: [later], past: [cancelled] });
      return cancelled;
    });
    renderPage();
    const dialog = await openEdit();

    fireEvent.click(within(dialog).getByRole('button', { name: '取消這次門診' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/這筆紀錄會留在「過去的門診」裡/)).toBeInTheDocument();
    expect(appointmentApi.cancelAppointment).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: '取消這次門診' }));

    await waitFor(() => expect(appointmentApi.cancelAppointment).toHaveBeenCalledWith('a-today'));
    expect(await screen.findByText('已取消這次門診，紀錄移到「過去的門診」')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const list = screen.getByLabelText('掛號提醒列表');
    expect(within(list).queryByText('臺大醫院')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '過去的門診（1）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    expect(within(pastList).getByText('臺大醫院')).toBeInTheDocument();
    expect(within(pastList).getByText('已取消')).toBeInTheDocument();
  });

  it('刪除的確認框講清楚整筆會消失，並指出「只是不去了」該走取消', async () => {
    renderPage();
    const dialog = await openEdit();

    fireEvent.click(within(dialog).getByRole('button', { name: '刪除這筆紀錄' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/整筆紀錄會消失/)).toBeInTheDocument();
    expect(within(confirm).getByText(/請改用「取消這次門診」/)).toBeInTheDocument();
  });

  it('已到診的門診沒有「取消這次門診」，刪除的確認框也不會叫人改用取消', async () => {
    mockLists({
      upcoming: [
        {
          ...today,
          status: 'attended',
          attended_at: '2026-09-15T08:40:00+08:00',
          attended_by_user_id: 'U-self',
          notify_at: [],
        },
      ],
    });
    renderPage();
    const dialog = await openEdit();

    expect(within(dialog).queryByRole('button', { name: '取消這次門診' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '刪除這筆紀錄' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).queryByText(/取消這次門診/)).not.toBeInTheDocument();
  });

  // ── 需要處理 ───────────────────────────────────────────────────────

  it('未到診在 7 天內置頂顯示「需要處理」，可以改約；過去的門診照樣算進它', async () => {
    mockLists({ upcoming: [today], past: [missedVisit, pastVisit] });
    renderPage();

    const attention = await screen.findByLabelText('需要處理的門診');
    expect(screen.getByRole('heading', { name: '需要處理' })).toBeInTheDocument();
    expect(within(attention).getByText('馬偕紀念醫院')).toBeInTheDocument();
    expect(within(attention).getByText('未到診')).toBeInTheDocument();
    // 已到診的不需要處理
    expect(within(attention).queryByText('臺大醫院')).not.toBeInTheDocument();
    // 上面有需要處理時，下面那一區要有自己的標題，才分得出哪些要處理
    expect(screen.getByRole('heading', { name: '即將到來的門診' })).toBeInTheDocument();
    // 筆數要跟後端的總筆數、「刪除全部歷史紀錄」一致，所以它也留在過去的門診裡
    expect(screen.getByRole('button', { name: '過去的門診（2）' })).toBeInTheDocument();

    fireEvent.click(within(attention).getByRole('button', { name: '改約：馬偕紀念醫院 骨科' }));
    const dialog = await screen.findByRole('dialog');
    // 改約就是再掛一次：醫院已經帶好，從第二步開始
    expect(within(dialog).getByText('第 2 步，共 4 步')).toBeInTheDocument();
  });

  it('沒有未到診時不顯示「需要處理」，即將到來也不多一個標題', async () => {
    mockLists({ upcoming: [today], past: [pastVisit] });
    renderPage();

    await screen.findByLabelText('掛號提醒列表');
    expect(screen.queryByText('需要處理')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '即將到來的門診' })).not.toBeInTheDocument();
  });

  // ── 過去的門診：分頁與刪除全部 ─────────────────────────────────────

  it('過去的門診一次一頁，「載入更多」帶上一頁的 cursor，筆數用後端的總筆數', async () => {
    const older = makeAppointment({
      id: 'a-older',
      appointment_at: '2026-07-01T10:00:00+08:00',
      facility_id: 'fac-3',
      hospital_name: '國泰綜合醫院',
      department: '眼科',
      status: 'attended',
      notify_at: [],
    });
    vi.mocked(appointmentApi.fetchAppointmentList).mockImplementation(
      async (_target, scope, options) => {
        if (scope === 'upcoming') return page([today]);
        return options?.cursor === 'cursor-2'
          ? page([older], null, 2)
          : page([pastVisit], 'cursor-2', 2);
      },
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '過去的門診（2）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    expect(within(pastList).queryByText('國泰綜合醫院')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));

    expect(await within(pastList).findByText('國泰綜合醫院')).toBeInTheDocument();
    expect(appointmentApi.fetchAppointmentList).toHaveBeenCalledWith('U-self', 'past', {
      cursor: 'cursor-2',
    });
    // 最後一頁之後就沒有「載入更多」
    expect(screen.queryByRole('button', { name: '載入更多' })).not.toBeInTheDocument();
  });

  it('刪除全部歷史紀錄：確認框寫出筆數與範圍，確認後才刪，提示用實際刪除的筆數', async () => {
    mockLists({ upcoming: [today], past: [missedVisit, pastVisit] });
    vi.mocked(appointmentApi.deletePastAppointments).mockImplementation(async () => {
      mockLists({ upcoming: [today], past: [] });
      return { deleted: 2 };
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '過去的門診（2）' }));
    fireEvent.click(await screen.findByRole('button', { name: '刪除全部歷史紀錄（2 筆）' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/全部 2 筆紀錄/)).toBeInTheDocument();
    expect(within(confirm).getByText(/即將到來的門診不受影響/)).toBeInTheDocument();
    expect(appointmentApi.deletePastAppointments).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: '刪除全部 2 筆' }));

    await waitFor(() => expect(appointmentApi.deletePastAppointments).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('已刪除 2 筆紀錄')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^過去的門診/ })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('需要處理')).not.toBeInTheDocument();
    // 即將到來的一筆都不動
    expect(within(screen.getByLabelText('掛號提醒列表')).getByText('臺大醫院')).toBeInTheDocument();
  });

  it('檢視家人（即使是 GUARDIAN）時沒有「刪除全部歷史紀錄」，單筆刪除照樣可以代勞', async () => {
    vi.mocked(appointmentApi.fetchAppointmentList).mockImplementation(async (target, scope) =>
      target === 'U-mom' && scope === 'past'
        ? page([{ ...pastVisit, id: 'a-mom-past', user_id: 'U-mom' }])
        : page([]),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '媽媽' }));

    fireEvent.click(await screen.findByRole('button', { name: '過去的門診（1）' }));
    const pastList = await screen.findByLabelText('過去的門診');
    expect(
      within(pastList).getByRole('button', { name: '刪除 8/25（週二） 臺大醫院 心臟內科 的紀錄' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^刪除全部歷史紀錄/ })).not.toBeInTheDocument();
  });
});

describe('掛號提醒文案', () => {
  it('六種語言的 key 完全一致', () => {
    const zhKeys = Object.keys(appointmentFeatureMessages['zh-TW']).sort();
    for (const lang of ['en', 'id', 'vi', 'th', 'ja'] as const) {
      expect(Object.keys(appointmentFeatureMessages[lang]).sort(), lang).toEqual(zhKeys);
    }
  });

  it('非日文的譯文不會與中文相同（漏譯時畫面會靜默出現一句中文）', () => {
    // 日文與中文共用漢字，「{{month}}/{{day}}（{{weekday}}）」這類格式本來就同形，不比對
    const zh = appointmentFeatureMessages['zh-TW'];
    for (const lang of ['en', 'id', 'vi', 'th'] as const) {
      for (const [key, value] of Object.entries(appointmentFeatureMessages[lang])) {
        expect(value, `${lang} / ${key}`).not.toBe(zh[key]);
      }
    }
  });
});
