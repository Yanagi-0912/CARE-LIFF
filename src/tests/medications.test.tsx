import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as medicationApi from '../api/medicationApi';
import MedicationsPage from '../pages/Medications';
import type { MedicationReminder } from '../types/medication';
import i18n from '../i18n';

vi.mock('../api/medicationApi', () => ({
  fetchReminders: vi.fn(),
  createReminders: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
}));

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    members: [{ user_id: 'U-mom', relationship_type: 'parent', display_name: '媽' }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function makeReminder(overrides: Partial<MedicationReminder>): MedicationReminder {
  return {
    id: 'r-1',
    creator_user_id: 'U-self',
    user_id: 'U-self',
    slot_type: 'morning',
    scheduled_time: '08:00',
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

describe('MedicationsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
    // 故意回傳時間顛倒的順序，驗證頁面會自行排序
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([evening, morning]);
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

  it('新增表單會停用已設定過的時段', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /新增/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Base UI 的 Checkbox 是 role="checkbox" 的 span，不是原生 input，
    // 停用狀態走 aria-disabled 而非 disabled 屬性（讀屏仍會唸出「已停用」）
    expect(screen.getByRole('checkbox', { name: /早/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('checkbox', { name: /晚/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('checkbox', { name: /中/ })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('checkbox', { name: /睡前/ })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('已設定')).toHaveLength(2);
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
});
