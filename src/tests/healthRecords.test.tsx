import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import HealthRecordsPage from '../pages/HealthRecords';
import Home from '../pages/Home';
import FamilyPage from '../pages/Family';
import * as healthApi from '../api/healthApi';
import * as profileApi from '../api/profileApi';
import type { FamilyMember, FamilyPermissions } from '../types/family';
import type { HealthAlertThreshold, HealthMeasurement, MenstrualRecord } from '../types/health';
import i18n from '../i18n';

/**
 * 健康紀錄頁（/health-records）整合測試（9.1–9.4）。
 * 9.5（六語系 key 完全一致）與純函式的驗證規則測試在
 * `healthRecordForm.test.ts`（sibling file，同 task-9 brief 的建議）。
 */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api/healthApi', () => ({
  fetchMeasurements: vi.fn(),
  createMeasurement: vi.fn(),
  fetchAlertThresholds: vi.fn(),
  updateAlertThresholds: vi.fn(),
  fetchMenstrualRecords: vi.fn(),
  createMenstrualRecord: vi.fn(),
  updateMenstrualRecord: vi.fn(),
  fetchStepCounts: vi.fn(),
  // StepCounterPanel（isSelf 時掛載在步數分頁）用得到，即使這個測試檔案不
  // 會真的按下開始計步——useStepCounter 的預設 deps 在模組載入時就會解析
  // 到這支函式，沒有它整個 mock 模組會缺一個匯出而炸掉。
  syncStepSession: vi.fn(),
}));

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

vi.mock('../hooks/useLiff', () => ({
  useLiff: () => ({ liffReady: true }),
}));

vi.mock('@line/liff', () => ({
  default: { isApiAvailable: () => false, shareTargetPicker: vi.fn() },
}));

const familyState = {
  members: [] as FamilyMember[],
  roleAssignment: null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
};
vi.mock('../hooks/useFamily', () => ({
  useFamily: () => familyState,
}));

const EMPTY_THRESHOLD: HealthAlertThreshold = {
  user_id: 'U-me',
  systolic_high: null,
  systolic_low: null,
  diastolic_high: null,
  diastolic_low: null,
  glucose_fasting_high: null,
  glucose_nonfasting_high: null,
  glucose_low: null,
  updated_by: null,
  updated_at: null,
};

function renderHealthRecords(initialEntry = '/health-records') {
  return renderWithToaster(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/health-records" element={<HealthRecordsPage />} />
        <Route path="/personalhealth" element={<div>個人健康頁面</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CAREGIVER_PERMISSIONS: FamilyPermissions = { general: ['READ'], sensitive: ['READ'], private: [] };
const GUARDIAN_PERMISSIONS: FamilyPermissions = {
  general: ['READ', 'WRITE'],
  sensitive: ['READ', 'WRITE'],
  private: ['READ'],
};

function familyMember(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    user_id: 'U-mom',
    relationship_type: 'parent',
    display_name: '媽媽',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
  localStorage.setItem('CARE_LINE_USER_ID', 'U-me');
  familyState.members = [];
  familyState.loading = false;
  familyState.error = null;
  mockNavigate.mockClear();

  vi.mocked(healthApi.fetchMeasurements).mockResolvedValue([]);
  vi.mocked(healthApi.fetchAlertThresholds).mockResolvedValue(EMPTY_THRESHOLD);
  vi.mocked(healthApi.fetchMenstrualRecords).mockResolvedValue([]);
  vi.mocked(healthApi.fetchStepCounts).mockResolvedValue([]);
  vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ gender: 'male' });

  await i18n.changeLanguage('zh-TW');
});

afterEach(() => {
  localStorage.clear();
});

// ── 9.1 路由與入口 ─────────────────────────────────────────────────────

describe('9.1 路由與入口', () => {
  it('/health-records 顯示血壓、血糖、步數三個分頁（性別未知時經期先出現，待判定為男性後才收起）', async () => {
    renderHealthRecords();
    expect(await screen.findByRole('tab', { name: /血壓/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /血糖/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /步數/ })).toBeInTheDocument();
  });

  it('首頁「健康紀錄」卡片會導向 /health-records', () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'user' });
    renderWithToaster(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('健康紀錄').closest('button')!);
    expect(mockNavigate).toHaveBeenCalledWith('/health-records');
  });

  it('族譜頁上方的「我的健康紀錄」會導向 /health-records', () => {
    renderWithToaster(
      <MemoryRouter>
        <FamilyPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /我的健康紀錄/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/health-records');
  });

  it('?tab= 選擇預設分頁', async () => {
    renderHealthRecords('/health-records?tab=blood_glucose');
    const glucoseTab = await screen.findByRole('tab', { name: /血糖/ });
    await waitFor(() => expect(glucoseTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('?tab= 帶未知值時退回第一個分頁', async () => {
    renderHealthRecords('/health-records?tab=not-a-real-tab');
    const bpTab = await screen.findByRole('tab', { name: /血壓/ });
    await waitFor(() => expect(bpTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('看家人時沒有權限：不渲染分頁、不送出任何健康資料請求', async () => {
    familyState.members = [familyMember({ my_strict_permissions: { general: [], sensitive: [], private: [] } })];
    renderHealthRecords('/health-records?user=U-mom');

    expect(await screen.findByText('您沒有查看健康狀況的權限')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /血壓/ })).not.toBeInTheDocument();
    expect(healthApi.fetchMeasurements).not.toHaveBeenCalled();
    expect(healthApi.fetchAlertThresholds).not.toHaveBeenCalled();
    expect(healthApi.fetchStepCounts).not.toHaveBeenCalled();
  });

  it('看家人時有讀取權：顯示他的名字與分頁，經期分頁一律不出現', async () => {
    familyState.members = [familyMember({ my_strict_permissions: GUARDIAN_PERMISSIONS })];
    renderHealthRecords('/health-records?user=U-mom');

    expect(await screen.findByRole('heading', { name: /媽媽 的健康紀錄/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /血壓/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /經期/ })).not.toBeInTheDocument();
  });

  it('看家人時族譜抓取失敗：講「載入失敗」並提供重試，不會誤說成沒有權限（review）', async () => {
    familyState.members = [];
    familyState.error = '載入族譜失敗';
    renderHealthRecords('/health-records?user=U-mom');

    expect(await screen.findByText('載入失敗')).toBeInTheDocument();
    expect(screen.queryByText('您沒有查看健康狀況的權限')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /血壓/ })).not.toBeInTheDocument();
    expect(healthApi.fetchMeasurements).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(familyState.refetch).toHaveBeenCalledTimes(1);
  });
});

// ── 9.2 等級呈現與輸入錯誤 ─────────────────────────────────────────────

describe('9.2 血壓／血糖：四種等級的呈現', () => {
  const records: HealthMeasurement[] = [
    {
      id: '1', user_id: 'U-me', kind: 'blood_pressure', measured_at: '2026-01-01T00:00:00Z',
      recorded_by: 'U-me', systolic: 120, diastolic: 80, pulse: null,
      glucose_mg_dl: null, meal_context: null, level: 'within_range', created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: '2', user_id: 'U-me', kind: 'blood_pressure', measured_at: '2026-01-02T00:00:00Z',
      recorded_by: 'U-me', systolic: 160, diastolic: 95, pulse: null,
      glucose_mg_dl: null, meal_context: null, level: 'above_range', created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: '3', user_id: 'U-me', kind: 'blood_pressure', measured_at: '2026-01-03T00:00:00Z',
      recorded_by: 'U-me', systolic: 85, diastolic: 55, pulse: null,
      glucose_mg_dl: null, meal_context: null, level: 'below_range', created_at: '2026-01-03T00:00:00Z',
    },
    {
      id: '4', user_id: 'U-me', kind: 'blood_pressure', measured_at: '2026-01-04T00:00:00Z',
      recorded_by: 'U-me', systolic: 118, diastolic: 76, pulse: null,
      glucose_mg_dl: null, meal_context: null, level: 'no_threshold', created_at: '2026-01-04T00:00:00Z',
    },
  ];

  it('四種等級各自以不同文字呈現，no_threshold 額外附「去設定」提示且不與正常同一種樣式', async () => {
    vi.mocked(healthApi.fetchMeasurements).mockResolvedValue(records);
    renderHealthRecords();

    expect(await screen.findByText('正常範圍')).toBeInTheDocument();
    expect(screen.getByText('高於範圍')).toBeInTheDocument();
    expect(screen.getByText('低於範圍')).toBeInTheDocument();
    expect(screen.getByText('未設定範圍')).toBeInTheDocument();
    expect(screen.getByText(/還沒有設定提醒範圍/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去設定' })).toBeInTheDocument();
  });
});

describe('9.2 新增表單：輸入錯誤訊息', () => {
  it('收縮壓不大於舒張壓時顯示前端預先檢查的錯誤，不會送出請求', async () => {
    renderHealthRecords();
    fireEvent.click(await screen.findByRole('button', { name: '新增血壓紀錄' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('收縮壓'), { target: { value: '90' } });
    fireEvent.change(within(dialog).getByLabelText('舒張壓'), { target: { value: '90' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(await within(dialog).findByText('收縮壓必須大於舒張壓')).toBeInTheDocument();
    expect(healthApi.createMeasurement).not.toHaveBeenCalled();
  });

  it('後端 422 的訊息會被原樣顯示（不是塞一串 JSON）', async () => {
    vi.mocked(healthApi.createMeasurement).mockRejectedValue(
      Object.assign(new Error('收縮壓必須大於舒張壓'), { status: 422 }),
    );
    renderHealthRecords();
    fireEvent.click(await screen.findByRole('button', { name: '新增血壓紀錄' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('收縮壓'), { target: { value: '150' } });
    fireEvent.change(within(dialog).getByLabelText('舒張壓'), { target: { value: '90' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(await within(dialog).findByText('收縮壓必須大於舒張壓')).toBeInTheDocument();
  });

  it('血糖量測情境未選擇時顯示錯誤', async () => {
    renderHealthRecords();
    fireEvent.click(await screen.findByRole('tab', { name: /血糖/ }));
    fireEvent.click(await screen.findByRole('button', { name: '新增血糖紀錄' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('血糖（mg/dL）'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(await within(dialog).findByText('請選擇量測情境')).toBeInTheDocument();
    expect(healthApi.createMeasurement).not.toHaveBeenCalled();
  });
});

// ── 9.3 提醒範圍設定 ───────────────────────────────────────────────────

describe('9.3 提醒範圍設定', () => {
  it('上限不大於下限時顯示錯誤，不送出請求', async () => {
    renderHealthRecords();
    fireEvent.click(await screen.findByRole('button', { name: '提醒範圍' }));

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText('收縮壓上限');
    fireEvent.change(within(dialog).getByLabelText('收縮壓上限'), { target: { value: '90' } });
    fireEvent.change(within(dialog).getByLabelText('收縮壓下限'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(await within(dialog).findByText('上限必須大於下限')).toBeInTheDocument();
    expect(healthApi.updateAlertThresholds).not.toHaveBeenCalled();
  });

  it('CAREGIVER（只有讀取權）看到唯讀狀態，沒有可編輯欄位', async () => {
    familyState.members = [familyMember({ my_strict_permissions: CAREGIVER_PERMISSIONS })];
    vi.mocked(healthApi.fetchAlertThresholds).mockResolvedValue({
      ...EMPTY_THRESHOLD,
      user_id: 'U-mom',
      systolic_high: 140,
      systolic_low: 90,
    });
    renderHealthRecords('/health-records?user=U-mom');

    fireEvent.click(await screen.findByRole('button', { name: '提醒範圍' }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText('僅供查看')).toBeInTheDocument();
    expect(within(dialog).getByText('140 mmHg')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '儲存' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('收縮壓上限')).not.toBeInTheDocument();
  });

  it('GUARDIAN（有寫入權）代看家人時可以編輯', async () => {
    familyState.members = [familyMember({ my_strict_permissions: GUARDIAN_PERMISSIONS })];
    renderHealthRecords('/health-records?user=U-mom');

    fireEvent.click(await screen.findByRole('button', { name: '提醒範圍' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByLabelText('收縮壓上限')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '儲存' })).toBeInTheDocument();
  });
});

// ── 9.4 經期分頁的性別限制 ─────────────────────────────────────────────

describe('9.4 經期分頁：男性、未設定、女性三種情形', () => {
  it('男性：經期分頁鈕整個不出現', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ gender: 'male' });
    renderHealthRecords();

    await screen.findByRole('tab', { name: /血壓/ });
    // 性別要等 getPersonalHealthProfile 回來才知道，一開始分頁會先出現，
    // 確定是男性後才收起——這裡等的就是那個收起的時間點。
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /經期/ })).not.toBeInTheDocument(),
    );
  });

  it('性別未設定：分頁鈕出現，內容是引導去設定性別的連結', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({});
    renderHealthRecords();

    const tab = await screen.findByRole('tab', { name: /經期/ });
    fireEvent.click(tab);

    expect(await screen.findByText('尚未設定性別')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /前往個人健康頁設定/ });
    expect(link).toHaveAttribute('href', '/personalhealth');
  });

  it('女性：顯示週期長度與經期天數', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ gender: 'female' });
    const records: MenstrualRecord[] = [
      {
        id: 'm1', user_id: 'U-me', start_date: '2026-01-01', end_date: '2026-01-05',
        flow: 'medium', note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        cycle_length_days: 28, period_length_days: 5,
      },
    ];
    vi.mocked(healthApi.fetchMenstrualRecords).mockResolvedValue(records);

    renderHealthRecords();
    const tab = await screen.findByRole('tab', { name: /經期/ });
    fireEvent.click(tab);

    expect(await screen.findByText(/週期 28 天/)).toBeInTheDocument();
    expect(screen.getByText(/經期 5 天/)).toBeInTheDocument();
  });
});

// ── 經期：事後補上／修改結束日期（menstrual-cycle-log「事後補上結束日期」）──

describe('9.4 經期分頁：事後補上結束日期', () => {
  const ongoingRecord: MenstrualRecord = {
    id: 'm-ongoing', user_id: 'U-me', start_date: '2026-01-01', end_date: null,
    flow: null, note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    cycle_length_days: null, period_length_days: null,
  };

  beforeEach(() => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ gender: 'female' });
    vi.mocked(healthApi.fetchMenstrualRecords).mockResolvedValue([ongoingRecord]);
  });

  it('進行中的紀錄可以設定結束日期，成功後失效紀錄清單並提示成功', async () => {
    vi.mocked(healthApi.updateMenstrualRecord).mockResolvedValue({
      ...ongoingRecord,
      end_date: '2026-01-05',
      period_length_days: 5,
    });
    renderHealthRecords();
    const tab = await screen.findByRole('tab', { name: /經期/ });
    fireEvent.click(tab);

    expect(await screen.findByText(/進行中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '設定結束日期' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('結束日期'), { target: { value: '2026-01-05' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(healthApi.updateMenstrualRecord).toHaveBeenCalledWith('m-ongoing', { end_date: '2026-01-05' }),
    );
    expect(await screen.findByText('已更新經期紀錄')).toBeInTheDocument();
  });

  it('結束日期早於開始日期時顯示前端預先檢查的錯誤，不會送出請求', async () => {
    renderHealthRecords();
    const tab = await screen.findByRole('tab', { name: /經期/ });
    fireEvent.click(tab);

    fireEvent.click(await screen.findByRole('button', { name: '設定結束日期' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('結束日期'), { target: { value: '2025-12-31' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(await within(dialog).findByText('結束日期不得早於開始日期')).toBeInTheDocument();
    expect(healthApi.updateMenstrualRecord).not.toHaveBeenCalled();
  });

  it('已有結束日期的紀錄改顯示「修改結束日期」，並帶出既有值', async () => {
    vi.mocked(healthApi.fetchMenstrualRecords).mockResolvedValue([
      { ...ongoingRecord, end_date: '2026-01-05', period_length_days: 5 },
    ]);
    renderHealthRecords();
    const tab = await screen.findByRole('tab', { name: /經期/ });
    fireEvent.click(tab);

    const editButton = await screen.findByRole('button', { name: '修改結束日期' });
    fireEvent.click(editButton);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('結束日期')).toHaveValue('2026-01-05');
  });
});

// ── 步數分頁：載入失敗要有重試（其餘分頁都有，步數不該是唯一沒有的） ──────

describe('步數分頁：載入失敗時提供重試', () => {
  it('載入失敗顯示錯誤與重試鈕，按下後重新查詢', async () => {
    vi.mocked(healthApi.fetchStepCounts).mockRejectedValueOnce(new Error('network'));
    renderHealthRecords('/health-records?tab=steps');

    expect(await screen.findByText('載入失敗')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '重新載入' });

    vi.mocked(healthApi.fetchStepCounts).mockResolvedValueOnce([]);
    fireEvent.click(retryButton);

    expect(await screen.findByText('還沒有步數紀錄')).toBeInTheDocument();
  });
});
