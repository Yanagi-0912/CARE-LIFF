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

// 這份測試不驗證家人切換，成員清單固定為空——對象只有「我自己」
vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    members: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
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

  /** 開新增視窗、切到詳細設定第一層 */
  const openDetailed = async () => {
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /新增/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /新增/ }));
    fireEvent.click(screen.getByRole('button', { name: '詳細設定' }));
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

    fireEvent.click(screen.getByRole('button', { name: '早' }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: '提醒飯前' }));
    fireEvent.change(screen.getByLabelText('飯前時間'), { target: { value: '07:30' } });

    fireEvent.click(screen.getByRole('switch', { name: '提醒飯後' }));
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
      expect(screen.getByText('07:30')).toBeInTheDocument();
    });

    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: '早' }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    // 開關、時間、指派都照既有條目帶出
    expect(screen.getByRole('switch', { name: '提醒飯前' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '提醒飯後' })).toHaveAttribute('aria-checked', 'true');
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

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        entries: [
          { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a', 'm-b'] },
          { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: [] },
        ],
      });
    });
  });

  it('沒有開啟任何服藥時機時顯示錯誤，不呼叫任何 API', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([]);

    renderPage();
    await openDetailed();

    fireEvent.click(screen.getByRole('button', { name: '早' }));

    await waitFor(() => {
      expect(screen.getByText('目前沒有藥品，可在下方新增')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(screen.getByText('請至少開啟一個服藥時機')).toBeInTheDocument();
    });
    expect(medicationApi.createReminders).not.toHaveBeenCalled();
    expect(medicationApi.updateReminder).not.toHaveBeenCalled();
  });

  it('新增藥品：輸入名稱送出後呼叫 createMedication，新藥品出現在清單', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const medA = makeMedication({ id: 'm-a', name: '脈優錠5毫克' });
    vi.mocked(medicationApi.fetchMedications).mockResolvedValue([medA]);
    const medNew = makeMedication({ id: 'm-new', name: '普拿疼', source: 'manual' });
    vi.mocked(medicationApi.createMedication).mockResolvedValue(medNew);

    renderPage();
    await openDetailed();
    fireEvent.click(screen.getByRole('button', { name: '早' }));

    await waitFor(() => {
      expect(screen.getByText(medA.name)).toBeInTheDocument();
    });

    // 空白輸入不該送出
    fireEvent.click(screen.getByRole('button', { name: '新增藥品' }));
    expect(medicationApi.createMedication).not.toHaveBeenCalled();

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
});
