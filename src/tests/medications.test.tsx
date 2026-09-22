import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as medicationApi from '../api/medicationApi';
import MedicationsPage from '../pages/Medications';
import { MedicationIndicationSection } from '../pages/Medications/MedicationIndicationSection';
import type { Medication, MedicationReminder } from '../types/medication';
import i18n from '../i18n';

vi.mock('../api/medicationApi', () => ({
  fetchReminders: vi.fn(),
  createReminders: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  fetchMedications: vi.fn(),
  createMedication: vi.fn(),
}));

// 這份既有測試不驗證藥袋掃描入口，開關固定回傳 false（不顯示掃描入口）
vi.mock('../api/settingsApi', () => ({
  getPrescriptionScanEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    // my_permissions 不能省：familyPermissions 是 fail-closed 的，少了它這位
    // 家人不會出現在對象清單裡。這裡給的是 GUARDIAN 等級（可讀可寫）。
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
  }),
}));

function makeReminder(overrides: Partial<MedicationReminder>): MedicationReminder {
  // entries／timeout_anchor_time 是派生欄位：這裡沒有多條目情境，固定用單一
  // none 條目、時刻跟著 scheduled_time 走，overrides 若自己帶了 scheduled_time
  // 也會反映到條目裡，不會出現條目時刻與 scheduled_time 對不上的假資料。
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

const morning = makeReminder({
  id: 'r-morning',
  slot_type: 'morning',
  scheduled_time: '08:00',
  end_date: '2026-08-31',
});

const evening = makeReminder({
  id: 'r-evening',
  slot_type: 'evening',
  scheduled_time: '18:00',
});

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'm-1',
    user_id: 'U-self',
    created_by_user_id: 'U-self',
    name: '脈優錠5毫克',
    generic_name: null,
    license_number: '衛署藥製字第000001號',
    shape: '圓形',
    color: '白色',
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
    source: 'prescription_ocr',
    start_date: '2026-08-01',
    end_date: null,
    enabled: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MedicationsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
    // 故意回傳時間顛倒的順序，驗證頁面會自行排序
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([evening, morning]);
    // 只有切到詳細檢視才會用到（DetailedSetupView 內的 useMedicationList），
    // 給個安全預設值，避免其他測試因為 query 回傳 undefined 而炸開。
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () =>
    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

  it('依提醒時間升冪列出提醒，並顯示日期區間', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(['08:00', '18:00']);

    expect(screen.getByText('2026/08/01 ~ 2026/08/31')).toBeInTheDocument();
    expect(screen.getByText('2026/08/01 起 · 長期')).toBeInTheDocument();
  });

  it('切換提醒對象後，會以該成員的 user_id 重新查詢', async () => {
    renderPage();

    await waitFor(() => {
      expect(medicationApi.fetchReminders).toHaveBeenCalledWith('U-self');
    });

    fireEvent.click(screen.getByRole('button', { name: '媽' }));

    await waitFor(() => {
      expect(medicationApi.fetchReminders).toHaveBeenLastCalledWith('U-mom');
    });
  });

  it('按「新增」直接切到詳細設定（沒有簡易新增視窗），返回鈕可以切回清單', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /新增/ }));

    // 不開 dialog，直接換成整頁的詳細檢視（第一層：四張時段卡）
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '詳細設定' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /返回/ }));

    expect(screen.queryByRole('heading', { name: '詳細設定' })).not.toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('啟用開關送出失敗時，畫面回滾並顯示錯誤訊息', async () => {
    vi.mocked(medicationApi.updateReminder).mockRejectedValue(new Error('無權限修改此用藥提醒'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    const morningSwitch = screen.getAllByRole('switch')[0];
    expect(morningSwitch).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(morningSwitch);

    await waitFor(() => {
      expect(screen.getByText('無權限修改此用藥提醒')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'true');
    expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', { enabled: false });
  });

  it('切換啟用開關後，該時段的藥品清單不會消失', async () => {
    // PUT /reminders/{id} 的回應刻意不帶 medications，如同真正的後端
    // （response_model=MedicationReminder，藥品清單只有 GET 才會附上）。
    // 快取若用回應整筆取代，藥品清單就會被洗掉——使用者停用某個時段後，
    // 畫面同時失去「剛剛關掉的是哪些藥」這個唯一線索，要重新整理才回得來。
    const med = makeMedication();
    const morningWithMeds: MedicationReminder = {
      ...morning,
      medications: [med],
      // entries 的 medication_ids 要跟 medications 對上，否則這筆假資料自相矛盾
      // （提醒說有一顆藥，條目卻宣稱聯集是空的）
      entries: [{ meal_timing: 'none', scheduled_time: morning.scheduled_time, medication_ids: [med.id] }],
    };
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([evening, morningWithMeds]);
    const withoutMedications: MedicationReminder = { ...morningWithMeds };
    delete withoutMedications.medications;
    vi.mocked(medicationApi.updateReminder).mockResolvedValue({
      ...withoutMedications,
      enabled: false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('脈優錠5毫克')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('switch')[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'false');
    });
    // 開關切換完成後藥名仍在——沒有重新整理，也沒有再打一次 GET。
    expect(screen.getByText('脈優錠5毫克')).toBeInTheDocument();
    expect(medicationApi.fetchReminders).toHaveBeenCalledTimes(1);
  });

  it('提醒卡片的藥丸照片以 160px 呈現，不是縮到與時段色票同大小', async () => {
    // 這個功能的用途是「靠外觀認出手上這顆藥」。照片與時段色票同為 size-11
    // 時，長輩根本看不出藥丸的顏色與刻痕，等於功能沒生效。160px（size-40，
    // 10rem）剛好用滿落地縮圖的原始解析度（resources/drug_appearance 全部
    // 是 160×160），再大就是放大模糊。
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      {
        ...morning,
        medications: [makeMedication({ thumbnail_url: 'https://static.example/pill.jpg' })],
      },
    ]);

    renderPage();

    const img = await screen.findByRole('img', { name: '脈優錠5毫克' });
    expect(img).toHaveClass('size-40');
    // 尺規是分辨同名同形藥品的關鍵線索，不能被裁掉
    expect(img).toHaveClass('object-contain');
  });

  it('entries 缺席時（部署順序：前端先於後端上線）卡片與詳細設定編輯面仍能渲染，不拋錯', async () => {
    // final-review fix 1 的回歸測試：entries 型別上必填，但實際部署時前後端
    // 不保證同時上線；用 cast 模擬舊後端回應少了這個欄位。少了防呆的話，
    // ReminderCard／SlotEntryEditor 讀 .length／.find 會直接拋錯，
    // 被 ErrorBoundary 接住後整頁空白，而不是只有這一張卡片降級。
    const { entries: _omit, ...reminderWithoutEntries } = morning;
    void _omit;
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      reminderWithoutEntries as unknown as MedicationReminder,
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /編輯「早」/ }));

    expect(screen.getByRole('heading', { name: '早', level: 2 })).toBeInTheDocument();
  });

  it('多條目提醒（飯前飯後）在卡片上分別列出每個時機、時刻與藥名', async () => {
    // Task 11：scheduled_time／timeout_anchor_time 是派生欄位，卡片標題只能
    // 顯示最早的那個時刻（07:30），使用者無從得知這其實是兩個時間點——
    // 需要在標題下方把每個條目攤開列出。
    const medA = makeMedication({ id: 'm-a', name: '心得安錠' });
    const medB = makeMedication({ id: 'm-b', name: '脈優錠5毫克' });
    const multi = makeReminder({
      id: 'r-multi',
      slot_type: 'morning',
      scheduled_time: '07:30',
      timeout_anchor_time: '08:30',
      entries: [
        { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: [medA.id] },
        { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: [medB.id] },
      ],
      medications: [medA, medB],
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([multi]);

    renderPage();

    const entriesList = await screen.findByRole('list', { name: '服藥時機' });
    expect(within(entriesList).getByText('飯前')).toBeInTheDocument();
    expect(within(entriesList).getByText('07:30')).toBeInTheDocument();
    expect(within(entriesList).getByText('心得安錠')).toBeInTheDocument();
    expect(within(entriesList).getByText('飯後')).toBeInTheDocument();
    expect(within(entriesList).getByText('08:30')).toBeInTheDocument();
    expect(within(entriesList).getByText('脈優錠5毫克')).toBeInTheDocument();

    // 藥名允許斷行：不能斷行的一長串英文藥名（例如
    // CHLORPHENIRAMINE MALEATE）在 24px 字級的 375px 手機上會把整張卡片
    // 撐寬，見 MedicationAppearanceRow 的既有作法——時刻與藥名要包在
    // ItemContent（提供 min-w-0）裡，藥名本身要能斷行。
    expect(within(entriesList).getByText('心得安錠')).toHaveClass('break-words');

    // 標題仍顯示派生出來的最早時刻，不受下面攤開的條目影響
    const editButton = screen.getByRole('button', { name: /編輯「早」/ });
    expect(within(editButton).getByText('07:30')).toBeInTheDocument();
  });

  it('點多條目提醒（飯前飯後）的卡片，直接落在詳細設定該時段的編輯面並帶出各時機', async () => {
    const medA = makeMedication({ id: 'm-a', name: '心得安錠' });
    const medB = makeMedication({ id: 'm-b', name: '脈優錠5毫克' });
    const multi = makeReminder({
      id: 'r-multi',
      slot_type: 'morning',
      scheduled_time: '07:30',
      timeout_anchor_time: '08:30',
      entries: [
        { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: [medA.id] },
        { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: [medB.id] },
      ],
      medications: [medA, medB],
    });
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([multi]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA, medB]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /編輯「早」/ }));

    // 不開 dialog，也不先停在四張時段卡的第一層（initialSlot 由 index.tsx
    // 帶入這筆規則的 slot_type）
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '早', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '飯前' })).toBeChecked();
    expect(screen.getByRole('switch', { name: '飯後' })).toBeChecked();
    expect(screen.getByRole('switch', { name: '不分飯前後' })).not.toBeChecked();
    expect(screen.getByLabelText('飯前時間')).toHaveValue('07:30');
    expect(screen.getByLabelText('飯後時間')).toHaveValue('08:30');
  });
});

describe('MedicationIndicationSection', () => {
  it('兩個來源分開呈現，仿單顯示摘要且可展開原文', async () => {
    renderWithToaster(
      <MedicationIndicationSection
        medication={makeMedication({
          indication: '降血壓',
          spc_indication: '1.本態性高血壓。2.治療左心室射出分率≦40%之心臟衰竭病患。',
          spc_indication_summary: '高血壓、心臟衰竭',
        })}
      />,
    );

    // 藥袋那行與仿單各自標示來源，不合併
    expect(screen.getByText(i18n.t('meds.indication.bagLabel'))).toBeInTheDocument();
    expect(screen.getByText('降血壓')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('meds.indication.spcLabel'))).toBeInTheDocument();
    expect(screen.getByText('高血壓、心臟衰竭')).toBeInTheDocument();

    // 原文預設收合，展開後才出現
    expect(screen.queryByText(/本態性高血壓/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(i18n.t('meds.indication.expand')));
    await waitFor(() => {
      expect(screen.getByText(/本態性高血壓/)).toBeInTheDocument();
    });
  });

  it('摘要為空時直接顯示原文，且不出現展開鈕', () => {
    renderWithToaster(
      <MedicationIndicationSection
        medication={makeMedication({
          indication: '緩解便祕',
          spc_indication: '緩解便祕。',
          spc_indication_summary: null,
        })}
      />,
    );

    // spec「摘要缺席時的降級」：顯示原文，而不是整段不顯示
    expect(screen.getByText('緩解便祕。')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('meds.indication.expand'))).not.toBeInTheDocument();
  });

  it('證號未確定（查無仿單）時只顯示藥袋那行，不留空白區塊', () => {
    renderWithToaster(
      <MedicationIndicationSection
        medication={makeMedication({
          license_number: null,
          indication: '降血壓',
          spc_indication: null,
          spc_indication_summary: null,
        })}
      />,
    );

    expect(screen.getByText('降血壓')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('meds.indication.spcLabel'))).not.toBeInTheDocument();
  });

  it('兩個來源都沒有時整段不渲染', () => {
    const { container } = renderWithToaster(
      <MedicationIndicationSection medication={makeMedication()} />,
    );
    expect(container.textContent).toBe('');
  });
});
