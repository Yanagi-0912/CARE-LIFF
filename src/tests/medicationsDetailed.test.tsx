import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as medicationApi from '../api/medicationApi';
import MedicationsPage from '../pages/Medications';
import type { Medication, MedicationReminder } from '../types/medication';
import { todayLocalDateString } from '../utils/date';
import i18n from '../i18n';

vi.mock('../api/medicationApi', () => ({
  fetchReminders: vi.fn(),
  createReminders: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  fetchMedications: vi.fn(),
  createMedication: vi.fn(),
}));

// 這份測試不驗證藥袋掃描入口，開關固定回傳 false（不顯示掃描入口）
vi.mock('../api/settingsApi', () => ({
  getPrescriptionScanEnabled: vi.fn().mockResolvedValue(false),
}));

// 這份測試多數不驗證家人切換，成員清單預設為空——對象只有「我自己」；
// 用 vi.hoisted 包一層可覆寫的 mock，讓「切換對象」的回歸測試能在單一
// 測試裡改成有其他成員可切，其餘測試不受影響（beforeEach 會重置回預設）。
const { mockUseFamily } = vi.hoisted(() => ({ mockUseFamily: vi.fn() }));
vi.mock('../hooks/useFamily', () => ({
  useFamily: mockUseFamily,
}));

function makeReminder(overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  const scheduled_time = overrides.scheduled_time ?? '08:00';
  return {
    id: 'r-1',
    creator_user_id: 'U-self',
    user_id: 'U-self',
    slot_type: 'morning',
    scheduled_time,
    timeout_anchor_time: scheduled_time,
    entries: [{ meal_timing: 'none', scheduled_time, medication_ids: [] }],
    start_date: '2026-08-01',
    end_date: null,
    enabled: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'm-1',
    user_id: 'U-self',
    created_by_user_id: 'U-self',
    name: '脈優錠5毫克',
    generic_name: null,
    license_number: null,
    shape: '',
    color: '',
    score_line: '',
    mark_one: '',
    mark_two: '',
    size: '',
    thumbnail_url: null,
    unit_content: null,
    total_quantity: null,
    usage_raw: null,
    frequency_code: 'QD',
    indication: null,
    spc_indication: null,
    spc_indication_summary: null,
    source: 'manual',
    start_date: '2026-08-01',
    end_date: null,
    enabled: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 找到某藥品名稱所在的 <Item role="listitem">，範圍內查詢它的指派按鈕 */
function itemFor(name: string) {
  const nameEl = screen.getByText(name);
  const item = nameEl.closest('[role="listitem"]');
  if (!item) throw new Error(`listitem not found for ${name}`);
  return within(item as HTMLElement);
}

describe('MedicationsPage 詳細設定檢視', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUseFamily.mockReturnValue({ members: [], loading: false, error: null, refetch: vi.fn() });
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () =>
    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

  /** 按清單頁的「新增」：直接進詳細設定第一層（已沒有簡易新增視窗） */
  const openDetailed = async () => {
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /新增/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /新增/ }));
  };

  it('新規則：分別開啟飯前飯後並指派藥品後儲存，帶出 slot_entries 呼叫建立', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    const medB = makeMedication({ id: 'm-b', name: '克流感膠囊' });
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);
    vi.mocked(medicationApi.createReminders).mockResolvedValue([
      makeReminder({ id: 'r-morning', slot_type: 'morning', scheduled_time: '07:30' }),
    ]);

    renderPage();
    await openDetailed();

    // 第一層四張時段卡都還沒設定過
    await waitFor(() => {
      expect(screen.getAllByText('尚未設定')).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    // 新時段預設開著「不分飯前後」，要分飯前飯後就先關掉它
    fireEvent.click(screen.getByRole('switch', { name: '不分飯前後' }));
    fireEvent.click(screen.getByRole('switch', { name: '飯前' }));
    fireEvent.change(screen.getByLabelText('飯前時間'), { target: { value: '07:30' } });

    fireEvent.click(screen.getByRole('switch', { name: '飯後' }));
    fireEvent.change(screen.getByLabelText('飯後時間'), { target: { value: '08:30' } });

    fireEvent.click(itemFor(medA.name).getByRole('button', { name: '放到飯前' }));
    fireEvent.click(itemFor(medB.name).getByRole('button', { name: '放到飯後' }));

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.createReminders).toHaveBeenCalledWith({
        user_id: 'U-self',
        slots: ['morning'],
        slot_entries: {
          morning: [
            { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
            { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
          ],
        },
        start_date: todayLocalDateString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('已儲存用藥提醒')).toBeInTheDocument();
    });
  });

  it('既有規則：帶出既有飯前飯後設定，搬動藥品後以 entries 呼叫更新', async () => {
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    const medB = makeMedication({ id: 'm-b', name: '克流感膠囊' });
    const morningReminder = makeReminder({
      id: 'r-morning',
      slot_type: 'morning',
      scheduled_time: '07:30',
      timeout_anchor_time: '08:30',
      entries: [
        { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
        { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
      ],
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([morningReminder]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);
    vi.mocked(medicationApi.updateReminder).mockResolvedValue(morningReminder);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /編輯「早」/ })).toBeInTheDocument();
    });

    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    // 開關、時間、指派都照既有條目帶出
    expect(screen.getByRole('switch', { name: '飯前' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '飯後' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('飯前時間')).toHaveValue('07:30');
    expect(screen.getByLabelText('飯後時間')).toHaveValue('08:30');
    expect(itemFor(medA.name).getByRole('button', { name: '放到飯前' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(itemFor(medB.name).getByRole('button', { name: '放到飯後' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 把 B 從飯後搬到飯前
    fireEvent.click(itemFor(medB.name).getByRole('button', { name: '放到飯前' }));

    // review fix 2 之後，飯後開著卻沒有藥（B 已經搬走）會被擋下存檔——
    // 兩個時機都改成掛在飯前，飯後索性關掉，這才是合理的最終狀態。
    fireEvent.click(screen.getByRole('switch', { name: '飯後' }));

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        entries: [{ meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a', 'm-b'] }],
      });
    });
  });

  it('關閉某個時機的開關後，原本指派在底下的藥品變成未指派，存檔後從這個時段拿掉', async () => {
    // review fix 2 的回歸測試：關掉飯後開關後 B 的指派要一起清掉，畫面標示
    // 「未指派」——不能留著停用的指派、存檔時卻悄悄消失。「不分飯前後」
    // 成為看得到的時機之後，未指派就是真的不在這個時段，不再自動落入 none。
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    const medB = makeMedication({ id: 'm-b', name: '克流感膠囊' });
    const morningReminder = makeReminder({
      id: 'r-morning',
      slot_type: 'morning',
      scheduled_time: '07:30',
      timeout_anchor_time: '08:30',
      entries: [
        { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
        { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
      ],
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([morningReminder]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);
    vi.mocked(medicationApi.updateReminder).mockResolvedValue(morningReminder);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /編輯「早」/ })).toBeInTheDocument();
    });

    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medB.name)).toBeInTheDocument();
    });

    expect(itemFor(medB.name).getByRole('button', { name: '放到飯後' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 關掉飯後開關
    fireEvent.click(screen.getByRole('switch', { name: '飯後' }));

    // B 的指派被清掉，畫面顯示未指派
    expect(itemFor(medB.name).getByText('未指派')).toBeInTheDocument();
    expect(itemFor(medB.name).getByRole('button', { name: '放到飯後' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        entries: [{ meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] }],
      });
    });
  });

  it('沒有開啟任何服藥時機時顯示錯誤，不呼叫任何 API', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);

    renderPage();
    await openDetailed();

    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText('目前沒有藥品，可在下方新增')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: '不分飯前後' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(screen.getByText('請至少開啟一個服藥時機')).toBeInTheDocument();
    });
    expect(medicationApi.createReminders).not.toHaveBeenCalled();
    expect(medicationApi.updateReminder).not.toHaveBeenCalled();
  });

  it('開啟飯前飯後但只指派飯前時擋下儲存，補上飯後的指派後才能存檔', async () => {
    // final review item 2 的回歸測試：飯後開著卻沒有藥，buildEntries 仍會老實
    // 產生一個空條目，後端會把 timeout_anchor_time 訂在它的時刻，拖慢真正
    // 有藥的飯前時機的 T+20/T+30 升級——所以要擋下存檔，而不是靜默送出。
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    const medB = makeMedication({ id: 'm-b', name: '克流感膠囊' });
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);
    vi.mocked(medicationApi.createReminders).mockResolvedValue([
      makeReminder({ id: 'r-morning', slot_type: 'morning', scheduled_time: '07:30' }),
    ]);

    renderPage();
    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: '不分飯前後' }));
    fireEvent.click(screen.getByRole('switch', { name: '飯前' }));
    fireEvent.click(screen.getByRole('switch', { name: '飯後' }));

    // 只指派飯前，飯後留空
    fireEvent.click(itemFor(medA.name).getByRole('button', { name: '放到飯前' }));

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(screen.getByText('飯後尚未指派任何藥品，請指派藥品或關閉這個時機')).toBeInTheDocument();
    });
    expect(medicationApi.createReminders).not.toHaveBeenCalled();

    // 補上飯後的指派後，儲存就會成功
    fireEvent.click(itemFor(medB.name).getByRole('button', { name: '放到飯後' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.createReminders).toHaveBeenCalledWith(
        expect.objectContaining({
          slot_entries: {
            morning: [
              { meal_timing: 'before_meal', scheduled_time: '08:00', medication_ids: ['m-a'] },
              { meal_timing: 'after_meal', scheduled_time: '08:00', medication_ids: ['m-b'] },
            ],
          },
        }),
      );
    });
  });

  it('新增藥品：輸入名稱送出後呼叫 createMedication，新藥品出現在清單', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA]);
    const medNew = makeMedication({ id: 'm-new', name: '普拿疼', source: 'manual' });
    vi.mocked(medicationApi.createMedication).mockResolvedValue(medNew);

    renderPage();
    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    // 空白與純空白輸入都不該讓按鈕變成可按——原本的斷言是「點下去沒呼叫
    // API」，但按鈕本來就是 disabled，點擊本來就不會觸發任何事，這個斷言
    // 就算按鈕沒有正確停用也一樣會通過，測不出真正想驗證的東西。
    const addButton = screen.getByRole('button', { name: '新增藥品' });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('藥品名稱'), { target: { value: '   ' } });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('藥品名稱'), { target: { value: '普拿疼' } });
    fireEvent.click(screen.getByRole('button', { name: '新增藥品' }));

    await waitFor(() => {
      expect(medicationApi.createMedication).toHaveBeenCalledWith({ user_id: 'U-self', name: '普拿疼' });
    });

    await waitFor(() => {
      expect(screen.getByText('普拿疼')).toBeInTheDocument();
    });
    expect(screen.getByText('已新增藥品')).toBeInTheDocument();
    // 輸入框清空
    expect(screen.getByLabelText('藥品名稱')).toHaveValue('');
  });

  it('已停用的藥品顯示「已停用」標籤，飯前飯後指派按鈕都停用', async () => {
    // final review item 4：已停用的藥品（療程結束或家屬手動停用）不該再被
    // 指派新的服藥時機——三重編碼（opacity 淡化＋圖示＋文字），不只靠淡化
    // 的視覺差異表達狀態。
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克', enabled: true });
    const medB = makeMedication({ id: 'm-b', name: '克流感膠囊', enabled: false });
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);

    renderPage();
    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText(medB.name)).toBeInTheDocument();
    });

    expect(itemFor(medB.name).getByText('已停用')).toBeInTheDocument();
    expect(itemFor(medA.name).queryByText('已停用')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '飯前' }));
    fireEvent.click(screen.getByRole('switch', { name: '飯後' }));

    expect(itemFor(medB.name).getByRole('button', { name: '放到飯前' })).toBeDisabled();
    expect(itemFor(medB.name).getByRole('button', { name: '放到飯後' })).toBeDisabled();
    expect(itemFor(medB.name).getByRole('button', { name: '放到不分飯前後' })).toBeDisabled();
    // 未停用的藥不受影響
    expect(itemFor(medA.name).getByRole('button', { name: '放到飯前' })).toBeEnabled();
  });

  it('藥品清單載入失敗時顯示錯誤訊息並擋住儲存，不會靜默送出殘缺的指派', async () => {
    // review fix 1 的回歸測試：GET /medications 失敗時畫面不能長得像「這個
    // 時段本來就沒有藥品」（那會讓使用者以為可以放心儲存），且儲存鈕要直接
    // 擋住，不能讓使用者在看不到完整指派畫面的狀態下按下儲存。
    const morningReminder = makeReminder({
      id: 'r-morning',
      slot_type: 'morning',
      scheduled_time: '07:30',
      entries: [{ meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] }],
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([morningReminder]);
    vi.mocked(medicationApi.fetchMedications).mockRejectedValue(new Error('網路逾時'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /編輯「早」/ })).toBeInTheDocument();
    });

    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: /^早/ }));

    await waitFor(() => {
      expect(screen.getByText('藥品清單載入失敗，請稍後再試')).toBeInTheDocument();
    });
    // 不該出現誤導性的「目前沒有藥品」
    expect(screen.queryByText('目前沒有藥品，可在下方新增')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存' })).toBeDisabled();
    expect(medicationApi.updateReminder).not.toHaveBeenCalled();
  });

  it('切換照顧對象時，若還停在詳細設定畫面會自動退回清單，避免把上一位的表單套用到新對象', async () => {
    // final review item 3 的回歸測試：詳細設定的 SlotEntryEditor 是依
    // targetUserId 載入藥品清單建構表單，換對象卻留在原地，儲存會把 A 的
    // 藥品指派套用到 B 身上。
    mockUseFamily.mockReturnValue({
      members: [
        {
          user_id: 'U-mom',
          relationship_type: 'parent',
          display_name: '媽',
          my_role: 'GUARDIAN',
          my_permissions: {
            general: ['READ', 'WRITE'],
            sensitive: ['READ', 'WRITE'],
            private: ['READ'],
          },
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);

    renderPage();
    await openDetailed();

    await waitFor(() => {
      expect(screen.getByText('詳細設定')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '媽' }));

    await waitFor(() => {
      expect(medicationApi.fetchReminders).toHaveBeenLastCalledWith('U-mom');
    });
    // 回到清單：詳細設定第一層的標題不再出現
    expect(screen.queryByText('詳細設定')).not.toBeInTheDocument();
  });

  it('提醒清單載入中時，詳細設定第一層顯示骨架屏，不呈現時段卡', async () => {
    // final review item 3 的回歸測試：載入中不能先把摘要顯示成「尚未設定」，
    // 那看起來像是這個人真的什麼都沒設定過。
    vi.mocked(medicationApi.fetchReminders).mockReturnValue(new Promise(() => {}));
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);

    renderPage();
    await openDetailed();

    expect(await screen.findByRole('list', { name: '載入中…' })).toBeInTheDocument();
    expect(screen.queryByText('尚未設定')).not.toBeInTheDocument();
  });

  it('新時段點進去直接儲存：建立單一「不分飯前後」條目，時刻是該時段預設值', async () => {
    // 取代原本的簡易新增視窗：長輩不懂飯前飯後，點時段、按儲存就完成
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);
    vi.mocked(medicationApi.createReminders).mockResolvedValue([makeReminder()]);

    renderPage();
    await openDetailed();
    fireEvent.click(await screen.findByRole('button', { name: /^睡前/ }));

    expect(await screen.findByLabelText('不分飯前後時間')).toHaveValue('21:30');
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.createReminders).toHaveBeenCalledWith({
        user_id: 'U-self',
        slots: ['bedtime'],
        slot_entries: {
          bedtime: [{ meal_timing: 'none', scheduled_time: '21:30', medication_ids: [] }],
        },
        start_date: todayLocalDateString(),
        end_date: undefined,
      });
    });
  });

  it('點提醒卡片直接進到該時段的編輯面；改時間儲存後回到清單', async () => {
    const morningReminder = makeReminder({ id: 'r-morning' });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([morningReminder]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);
    vi.mocked(medicationApi.updateReminder).mockResolvedValue(morningReminder);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /編輯「早」/ }));

    // 不經過第一層，直接是「早」的編輯面，單一時刻的提醒開在「不分飯前後」
    expect(await screen.findByRole('heading', { name: '早' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '不分飯前後' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '飯前' })).toHaveAttribute('aria-checked', 'false');

    // 藥品清單載入完才能儲存（載入中儲存鈕是停用的）
    await screen.findByText('目前沒有藥品，可在下方新增');
    fireEvent.change(screen.getByLabelText('不分飯前後時間'), { target: { value: '07:15' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        entries: [{ meal_timing: 'none', scheduled_time: '07:15', medication_ids: [] }],
      });
    });
    // 回到清單，不是詳細設定第一層
    expect(await screen.findByRole('button', { name: /編輯「早」/ })).toBeInTheDocument();
    expect(screen.queryByText('詳細設定')).not.toBeInTheDocument();
  });

  it('清空結束日期會送出 end_date: null，把療程改回長期；日期沒動就不送', async () => {
    const reminder = makeReminder({ id: 'r-morning', end_date: '2026-12-31' });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([reminder]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);
    vi.mocked(medicationApi.updateReminder).mockResolvedValue(reminder);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /編輯「早」/ }));

    await screen.findByText('目前沒有藥品，可在下方新增');
    const endDate = screen.getByLabelText('結束日期');
    expect(endDate).toHaveValue('2026-12-31');
    expect(screen.getByLabelText('開始日期')).toHaveValue('2026-08-01');
    fireEvent.change(endDate, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        entries: [{ meal_timing: 'none', scheduled_time: '08:00', medication_ids: [] }],
        end_date: null,
      });
    });
  });

  it('開始日期被清空、或結束日期早於開始日期時顯示錯誤，不呼叫 API', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([makeReminder({ id: 'r-morning' })]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /編輯「早」/ }));

    await screen.findByText('目前沒有藥品，可在下方新增');
    fireEvent.change(screen.getByLabelText('開始日期'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('請選擇開始日期')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('開始日期'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('結束日期不可早於開始日期')).toBeInTheDocument();

    expect(medicationApi.updateReminder).not.toHaveBeenCalled();
  });

  it('刪除要先確認；確認後呼叫刪除並回到清單。尚未設定的時段沒有刪除鈕', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([makeReminder({ id: 'r-morning' })]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);
    vi.mocked(medicationApi.deleteReminder).mockResolvedValue({ ok: true });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /編輯「早」/ }));

    fireEvent.click(await screen.findByRole('button', { name: '刪除此提醒' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(medicationApi.deleteReminder).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: '確定刪除' }));

    await waitFor(() => {
      expect(medicationApi.deleteReminder).toHaveBeenCalledWith('r-morning');
    });
    expect(await screen.findByText('已刪除用藥提醒')).toBeInTheDocument();
    // 回到清單
    expect(screen.queryByRole('heading', { name: '早' })).not.toBeInTheDocument();

    // 尚未設定的時段（從「新增」進去）不渲染刪除鈕
    await openDetailed();
    fireEvent.click(await screen.findByRole('button', { name: /^中/ }));
    expect(await screen.findByRole('heading', { name: '中' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刪除此提醒' })).not.toBeInTheDocument();
  });
});
