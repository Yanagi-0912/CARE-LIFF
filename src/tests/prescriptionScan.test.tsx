import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import * as medicationApi from '../api/medicationApi';
import { PrescriptionScanError } from '../api/medicationApi';
import MedicationsPage from '../pages/Medications';
import { PrescriptionScanDialog } from '../pages/Medications/PrescriptionScanDialog';
import { PrescriptionDraftForm } from '../pages/Medications/PrescriptionDraftForm';
import type { PrescriptionDraft, RecognizedDrug } from '../types/prescription';
import i18n from '../i18n';

// PrescriptionScanError 是真正的 class（保留 actual），其餘 API 一律換成可控制的 mock，
// 這樣 PrescriptionScanDialog 內的 `err instanceof PrescriptionScanError` 才會成立。
vi.mock('../api/medicationApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/medicationApi')>();
  return {
    ...actual,
    fetchReminders: vi.fn(),
    createReminders: vi.fn(),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn(),
    checkPrescriptionScanEnabled: vi.fn(),
    scanPrescription: vi.fn(),
    commitPrescriptionDraft: vi.fn(),
    getPrescriptionDraft: vi.fn(),
  };
});

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    members: [{ user_id: 'U-mom', relationship_type: 'parent', display_name: '媽' }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function makeDrug(overrides: Partial<RecognizedDrug>): RecognizedDrug {
  return {
    name: '脈優錠',
    generic_name: 'Amlodipine',
    unit_content: '5mg',
    total_quantity: 30,
    usage_raw: '每日一次，早上飯後服用',
    frequency_code: 'QD',
    dose_per_time: '1顆',
    timing: 'after_meal',
    duration_days: 30,
    indication: '高血壓',
    license_number: '衛署藥製字第000001號',
    name_confidence: 'high',
    ...overrides,
  };
}

function makeDraft(overrides: Partial<PrescriptionDraft> = {}): PrescriptionDraft {
  return {
    draft_id: 'draft-1',
    creator_user_id: 'U-self',
    recognition: {
      institution: '測試藥局',
      patient_name: '王小明',
      dispensed_date: '2026-08-01',
      drugs: [makeDrug({})],
      multiple_bags_suspected: false,
    },
    confidence_level: 'high',
    suggested_user_id: 'U-self',
    created_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-08-01T00:30:00.000Z',
    committed_at: null,
    committed_medication_ids: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
  localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
  await i18n.changeLanguage('zh-TW');
});

describe('藥袋掃描入口的功能開關', () => {
  it('後端關閉功能時，不顯示掃描入口', async () => {
    vi.mocked(medicationApi.checkPrescriptionScanEnabled).mockResolvedValue(false);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('用藥提醒')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /掃描藥袋/ })).not.toBeInTheDocument();
  });

  it('後端開啟功能時，顯示掃描入口並可開啟拍照畫面', async () => {
    vi.mocked(medicationApi.checkPrescriptionScanEnabled).mockResolvedValue(true);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    const entryButton = await screen.findByRole('button', { name: /掃描藥袋/ });
    fireEvent.click(entryButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /拍照或選擇照片/ })).toBeInTheDocument();
  });
});

describe('PrescriptionScanDialog：辨識失敗的三種原因與上傳錯誤', () => {
  const file = new File(['fake-image'], 'bag.jpg', { type: 'image/jpeg' });

  const renderDialog = () =>
    renderWithToaster(
      <PrescriptionScanDialog onScanned={vi.fn()} onManualFallback={vi.fn()} onClose={vi.fn()} />,
    );

  const selectFile = () => {
    const input = screen.getByLabelText('拍照或選擇照片', { selector: 'input' });
    fireEvent.change(input, { target: { files: [file] } });
  };

  it.each([
    ['unreadable', '照片看不清楚'],
    ['not_prescription', '這張照片不像藥袋'],
    ['service_unavailable', '辨識服務暫時無法使用'],
  ] as const)('reason=%s 顯示「%s」', async (reason, expectedTitle) => {
    vi.mocked(medicationApi.scanPrescription).mockRejectedValue(
      new PrescriptionScanError(reason, '辨識失敗'),
    );
    renderDialog();

    selectFile();

    expect(await screen.findByText(expectedTitle)).toBeInTheDocument();
    // 每種失敗都要能落回手動建立的路徑
    expect(screen.getByRole('button', { name: '改為手動建立' })).toBeInTheDocument();
  });

  it('上傳過大的檔案（413）顯示專屬的錯誤訊息', async () => {
    vi.mocked(medicationApi.scanPrescription).mockRejectedValue(
      new PrescriptionScanError('too_large', '影像檔案過大，請重新拍攝或壓縮後再試'),
    );
    renderDialog();

    selectFile();

    expect(await screen.findByText('照片檔案太大')).toBeInTheDocument();
  });

  it('不支援的檔案格式（415）顯示專屬的錯誤訊息', async () => {
    vi.mocked(medicationApi.scanPrescription).mockRejectedValue(
      new PrescriptionScanError('unsupported_type', '僅接受影像檔案'),
    );
    renderDialog();

    selectFile();

    expect(await screen.findByText('檔案格式不支援')).toBeInTheDocument();
  });

  it('辨識成功時呼叫 onScanned 並帶回草稿', async () => {
    const draft = makeDraft();
    vi.mocked(medicationApi.scanPrescription).mockResolvedValue(draft);
    const onScanned = vi.fn();
    renderWithToaster(
      <PrescriptionScanDialog onScanned={onScanned} onManualFallback={vi.fn()} onClose={vi.fn()} />,
    );

    selectFile();

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(draft));
  });
});

describe('PrescriptionDraftForm：信心度分級與安全規則', () => {
  it('medium 信心度時不提供一鍵確認', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name_confidence: 'low' })],
        multiple_bags_suspected: false,
      },
      suggested_user_id: null,
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByText('確認藥袋辨識結果');
    expect(screen.queryByRole('button', { name: /一鍵建立/ })).not.toBeInTheDocument();
    // 名稱未通過藥證庫校驗要有視覺標記
    expect(screen.getByText('藥名未通過核對，請確認')).toBeInTheDocument();
  });

  it('high 信心度時提供一鍵確認', async () => {
    const draft = makeDraft();
    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByRole('button', { name: /一鍵建立/ })).toBeInTheDocument();
  });

  it('PRN 藥品顯示「不會建立定時提醒」的說明', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'PRN', name: '普拿疼', name_confidence: 'high' })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('這項藥不會建立定時提醒')).toBeInTheDocument();
    expect(screen.getByText(/需要時才吃/)).toBeInTheDocument();
  });

  it('OTHER 頻次未選時段時會擋下送出，不會呼叫 commitPrescriptionDraft', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'OTHER', name: '每週一三五各一顆的藥', name_confidence: 'high' })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const submitButton = await screen.findByRole('button', { name: '確認並送出' });
    fireEvent.click(submitButton);

    expect(await screen.findByText('這項藥的用法無法自動判斷時段，請至少選擇一個服藥時段')).toBeInTheDocument();
    expect(medicationApi.commitPrescriptionDraft).not.toHaveBeenCalled();
  });

  it('勾選時段後即可送出 OTHER 頻次的藥品', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
    });
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'OTHER', name: '每週一三五各一顆的藥', name_confidence: 'high' })],
        multiple_bags_suspected: false,
      },
    });
    const onCommitted = vi.fn();

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={onCommitted} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: '早' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    expect(onCommitted).toHaveBeenCalledWith({ medication_ids: ['m-1'], prn_medication_ids: [] });
  });
});
