import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import * as medicationApi from '../api/medicationApi';
import { PrescriptionScanError } from '../api/medicationApi';
import * as settingsApi from '../api/settingsApi';
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
    scanPrescription: vi.fn(),
    commitPrescriptionDraft: vi.fn(),
    getPrescriptionDraft: vi.fn(),
  };
});

// 功能開關現在由 GET /api/profiles/me/settings 提供，不再是 medicationApi 的一部分。
vi.mock('../api/settingsApi', () => ({
  getPrescriptionScanEnabled: vi.fn(),
}));

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
    vi.mocked(settingsApi.getPrescriptionScanEnabled).mockResolvedValue(false);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    // 掃描入口在查詢 pending 時也是隱藏的（預設值就是 false），單靠
    // 「按鈕不在畫面上」無法證明開關真的被讀成 false——查詢根本還沒解析
    // 也會是一樣的畫面。所以先確定 getPrescriptionScanEnabled 真的被
    // 呼叫並且它回傳的 promise 已經 resolve，才代表查詢真正落定，
    // 接下來的斷言才有意義。
    await waitFor(() => {
      expect(settingsApi.getPrescriptionScanEnabled).toHaveBeenCalled();
    });
    await expect(vi.mocked(settingsApi.getPrescriptionScanEnabled).mock.results[0]!.value).resolves.toBe(
      false,
    );

    await waitFor(() => {
      expect(screen.getByText('用藥提醒')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /掃描藥袋/ })).not.toBeInTheDocument();
  });

  it('後端開啟功能時，顯示掃描入口並可開啟拍照畫面', async () => {
    vi.mocked(settingsApi.getPrescriptionScanEnabled).mockResolvedValue(true);
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

  // 這是本輪修正的重大缺陷回歸測試：草稿的 suggested_user_id 只是預設值，
  // 使用者在 ToggleGroup 上親自改選之後，一鍵建立必須送出使用者選的對象，
  // 不能沿用渲染當下算出來的建議值——否則就是「使用者明明改選了，App 卻
  // 悄悄建到別人身上」。斷言的是送出的 payload 本身，不是「有沒有呼叫到」。
  it('一鍵建立送出的是使用者親自改選後的用藥對象，不是草稿的建議值', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
    // 建議值指向媽媽；使用者實際要記的是自己的藥
    const draft = makeDraft({ suggested_user_id: 'U-mom' });
    const onCommitted = vi.fn();

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={onCommitted} onClose={vi.fn()} />,
    );

    // 改選為本人
    fireEvent.click(await screen.findByRole('button', { name: '我自己' }));
    fireEvent.click(screen.getByRole('button', { name: /一鍵建立/ }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalledWith(
      draft.draft_id,
      expect.objectContaining({ user_id: 'U-self' }),
    );
  });

  // 對照 src/types/prescription.ts 的 FREQUENCY_TO_SLOTS：TID 對應早／中／晚
  // 三個時段，畫面上要「預先」顯示這個狀態，讓使用者看得出這顆藥等一下會
  // 建立三筆提醒，而不是三個空白核取方塊、看起來像什麼都不會建立。
  it('TID 頻次的藥品渲染時三個時段已預先勾選', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'TID', name: '一天三次的藥' })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByRole('checkbox', { name: '早' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '中' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '晚' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '睡前' })).not.toBeChecked();
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
      reminder_ids: ['r-1'],
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
    expect(onCommitted).toHaveBeenCalledWith({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
  });

  // 這是本輪修正的重大缺陷回歸測試：核對畫面現在會預先勾選時段，讓使用者
  // 看得到「等一下會建立什麼」。如果使用者把 QD 藥的「早」取消勾選，
  // 送出的 slots 必須是空陣列，不能被 toCommitDrug 悄悄改回 undefined
  // （undefined 代表「沒有覆寫」，後端會退回頻次代碼算出的預設時段，
  // 等於使用者取消勾選的操作被無聲蓋掉）。
  it('取消勾選所有時段後仍可送出，slots 送出空陣列，並顯示不會建立提醒的說明', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: [],
    });
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '脈優錠5毫克' })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const morningCheckbox = await screen.findByRole('checkbox', { name: '早' });
    expect(morningCheckbox).toBeChecked();
    fireEvent.click(morningCheckbox);
    expect(morningCheckbox).not.toBeChecked();

    expect(await screen.findByText('目前不會建立定時提醒')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.slots).toEqual([]);
  });

  // 對照組：從未取消勾選的情況下，不該出現「不會建立提醒」的說明。
  it('未取消勾選任何時段時，不顯示不會建立提醒的說明', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '脈優錠5毫克' })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByRole('checkbox', { name: '早' });
    expect(screen.queryByText('目前不會建立定時提醒')).not.toBeInTheDocument();
  });

  // 療程天數（duration_days）現在會換算成後端的 end_date，決定這顆藥何時
  // 自動停止提醒——必須讓使用者在核對畫面看得到辨識結果、也能修正它。
  it('顯示辨識到的療程天數，且使用者修改後會原樣送出', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '安莫西林', duration_days: 5 })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const durationInput = await screen.findByLabelText('療程天數');
    expect(durationInput).toHaveValue(5);

    fireEvent.change(durationInput, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.duration_days).toBe(10);
  });

  // 沒有辨識到療程天數（慢性病長期用藥是常見情形）時，欄位保持空白，
  // 送出時不帶 duration_days，後端才不會誤設一個結束日。
  it('沒有辨識到療程天數時欄位留空，送出時不帶 duration_days', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '脈優錠5毫克', duration_days: null })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const durationInput = await screen.findByLabelText('療程天數');
    expect(durationInput).toHaveValue(null);

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.duration_days).toBeUndefined();
  });

  // 藥證庫比對到的許可證字號是對著「掃描當下的藥名」比對出來的。使用者若
  // 把藥名改成別的字串，繼續沿用舊證號就是把一個名字和另一顆藥的許可證
  // 字號存在一起——必須清掉，讓下一次掃描才重新比對。
  it('編輯藥名後，送出時不再帶原本比對到的許可證字號', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            frequency_code: 'QD',
            name: '脈優錠5毫克',
            license_number: '衛署藥製字第000001號',
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const nameInput = await screen.findByLabelText('藥品名稱');
    fireEvent.change(nameInput, { target: { value: '改過的藥名' } });
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.name).toBe('改過的藥名');
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });

  // 對照組：藥名沒有被編輯過時，原本比對到的許可證字號要照樣送出，
  // 不能因為加了「編輯後清空」的規則就連沒編輯的情況也一起清掉。
  it('未編輯藥名時，原本比對到的許可證字號照樣送出', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
    });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            frequency_code: 'QD',
            name: '脈優錠5毫克',
            license_number: '衛署藥製字第000001號',
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByLabelText('藥品名稱');
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBe('衛署藥製字第000001號');
  });
});
