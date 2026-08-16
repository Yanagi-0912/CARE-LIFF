import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import * as medicationApi from '../api/medicationApi';
import { PrescriptionScanError } from '../api/medicationApi';
import * as settingsApi from '../api/settingsApi';
import MedicationsPage from '../pages/Medications';
import { PrescriptionScanDialog } from '../pages/Medications/PrescriptionScanDialog';
import { PrescriptionDraftForm } from '../pages/Medications/PrescriptionDraftForm';
import { ReminderCard } from '../pages/Medications/ReminderCard';
import type { DrugCandidate, PrescriptionDraft, RecognizedDrug } from '../types/prescription';
import type { Medication, MedicationReminder } from '../types/medication';
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
    // 大多數既有測試不關心候選外觀，預設留空陣列；需要測試消歧介面的
    // 案例會自行覆寫成對應的 DrugCandidate[]。
    candidates: [],
    name_confidence: 'high',
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<DrugCandidate> = {}): DrugCandidate {
  return {
    license_number: '衛署藥製字第000001號',
    name_zh: '脈優錠5毫克',
    shape: '圓形',
    color: '白色',
    score_line: '',
    mark_one: 'PBF 436',
    mark_two: '',
    // 真實資料集的外觀尺寸是裸數字、沒有單位（見 appearanceText.ts 的
    // formatAppearanceSize 說明）；夾具用 '8mm' 會讓「不臆測單位」這條
    // 規則測不出來，過去就是這樣漏放行的。
    size: '8',
    thumbnail_url: 'https://cdn.example.com/drug-appearance/sample.jpg',
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
    // 縮圖網址由後端就地解析（見 MedicationService.get_user_reminders_with_
    // medications），不是前端算的，測試需要縮圖時直接覆寫這個欄位即可。
    thumbnail_url: null,
    unit_content: null,
    total_quantity: null,
    usage_raw: null,
    frequency_code: 'QD',
    indication: null,
    source: 'prescription_ocr',
    start_date: '2026-06-01',
    end_date: null,
    enabled: true,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
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

function makeExistingReminder(overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  return {
    id: 'r-existing',
    creator_user_id: 'U-self',
    user_id: 'U-self',
    slot_type: 'morning',
    scheduled_time: '08:00',
    start_date: '2026-06-01',
    end_date: null,
    enabled: true,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
  localStorage.setItem('CARE_LINE_USER_ID', 'U-self');
  vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
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
      reactivated_slots: [],
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
      reactivated_slots: [],
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
    expect(onCommitted).toHaveBeenCalledWith(
      {
        medication_ids: ['m-1'],
        prn_medication_ids: [],
        reminder_ids: ['r-1'],
        reactivated_slots: [],
      },
      { totalCount: 1, noReminderCount: 0 },
    );
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
      reactivated_slots: [],
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
      reactivated_slots: [],
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
      reactivated_slots: [],
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

  // 這是本輪修正的回歸測試：timing 過去被辨識、被顯示，卻在提交時整個
  // 遺失——後端因此永遠不知道這顆藥的服用時機，QD 藥一律排到早上，即使
  // 藥袋明確標示睡前服用。toCommitDrug 現在必須把 timing 原樣帶上。
  it('送出時帶上辨識到的服用時機（timing）', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            frequency_code: 'QD',
            name: '冠脂妥膜衣錠10毫克',
            timing: 'bedtime',
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByRole('checkbox', { name: '睡前' });
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.timing).toBe('bedtime');
  });

  // 真實藥袋案例（冠脂妥膜衣錠，QD＋睡前服用）：核對畫面預先勾選的時段
  // 必須反映後端實際會建立的提醒——QD 加上 timing 為 bedtime 時，預先
  // 勾選的是「睡前」，不是頻次代碼單獨映射出的「早」。
  it('QD 且辨識出睡前服用時，預先勾選睡前而非早上', async () => {
    const draft = makeDraft({
      confidence_level: 'medium',
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            frequency_code: 'QD',
            name: '冠脂妥膜衣錠10毫克',
            timing: 'bedtime',
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const bedtimeCheckbox = await screen.findByRole('checkbox', { name: '睡前' });
    expect(bedtimeCheckbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '早' })).not.toBeChecked();
  });

  // 藥證庫比對到的許可證字號是對著「掃描當下的藥名」比對出來的。使用者若
  // 把藥名改成別的字串，繼續沿用舊證號就是把一個名字和另一顆藥的許可證
  // 字號存在一起——必須清掉，讓下一次掃描才重新比對。
  it('編輯藥名後，送出時不再帶原本比對到的許可證字號', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
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
      reactivated_slots: [],
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

describe('PrescriptionDraftForm：「這個藥不用定時提醒我」（Fix 2）', () => {
  // 這是本輪修正的重大缺陷回歸測試：修正前 toCommitDrug 對非 PRN 藥品一律
  // 送出陣列，OTHER 頻次的預設就是空陣列，後端因此永遠分不出「使用者決定
  // 不要提醒」與「使用者還沒選時段」。這個核取方塊讓意圖變成前端明確送出
  // 的訊號：勾選送空陣列（後端接受，不建立提醒），不勾選則 OTHER 沒選時段
  // 時送 undefined，讓後端的 SlotsRequiredError 擋下。
  it('OTHER 頻次勾選後可直接送出，不再需要先選時段，slots 送出空陣列', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: [],
      reactivated_slots: [],
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

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: '這個藥不用定時提醒我' }));
    // 勾選後不再顯示時段選擇欄位，也不會被必填時段的錯誤擋下
    expect(screen.queryByRole('checkbox', { name: '早' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    expect(
      screen.queryByText('這項藥的用法無法自動判斷時段，請至少選擇一個服藥時段'),
    ).not.toBeInTheDocument();
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.slots).toEqual([]);
  });

  // 對照組：勾選前，OTHER 頻次沒選時段一樣被擋下——這個核取方塊是「另一種
  // 明確表態的方式」，不是繞過必填規則的後門。
  it('OTHER 頻次未勾選、也未選時段時仍會被擋下送出', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: '確認並送出' }));

    expect(
      await screen.findByText('這項藥的用法無法自動判斷時段，請至少選擇一個服藥時段'),
    ).toBeInTheDocument();
    expect(medicationApi.commitPrescriptionDraft).not.toHaveBeenCalled();
  });

  it('一般頻次（QD）勾選後同樣送出空陣列，不受該頻次預設時段影響', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: [],
      reactivated_slots: [],
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

    // QD 預設已勾選「早」，勾選「不用定時提醒」後改送空陣列
    await screen.findByRole('checkbox', { name: '早' });
    fireEvent.click(screen.getByRole('checkbox', { name: '這個藥不用定時提醒我' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.slots).toEqual([]);
  });
});

describe('PrescriptionDraftForm：候選消歧（7.2, 7.3, 7.6）', () => {
  // 7.2：唯一候選時證號已確定，直接呈現「已確認」的外觀卡片，不需要使用者挑選。
  it('唯一候選時直接呈現已確認的縮圖與外觀描述，不需要挑選', async () => {
    const candidate = makeCandidate({ license_number: '衛署藥製字第000001號', name_zh: '脈優錠5毫克' });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            name: '脈優錠5毫克',
            license_number: '衛署藥製字第000001號',
            candidates: [candidate],
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('已確認')).toBeInTheDocument();
    // 顏色與形狀用（可設定的）分隔符接起來，不含尺寸——尺寸沒有已知單位，
    // 獨立帶標籤呈現，見 formatAppearanceSize 與下方 sizeLabel 的斷言。
    expect(screen.getByText('白色、圓形')).toBeInTheDocument();
    expect(screen.getByText('外觀尺寸：8')).toBeInTheDocument();
    expect(screen.getByText('刻痕／標示：PBF 436')).toBeInTheDocument();
    // 唯一候選不是「挑選」，畫面上不應該出現可點的候選清單
    expect(screen.queryByTestId('candidate-list')).not.toBeInTheDocument();
  });

  // 7.2：候選多於一張且未超過呈現上限時，逐筆呈現縮圖與外觀描述；挑選後
  // 該筆的證號送出時要換成使用者挑的那一張，而不是原本任何一張的預設值。
  it('候選多於一張時逐筆呈現縮圖與外觀描述，挑選後送出對應的證號', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidateA = makeCandidate({
      license_number: 'LIC-A',
      name_zh: '普拿疼膜衣錠500毫克',
      color: '白色',
      shape: '圓形',
    });
    const candidateB = makeCandidate({
      license_number: 'LIC-B',
      name_zh: '普拿疼速效膜衣錠',
      color: '白色',
      shape: '橢圓形',
    });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            name: '普拿疼',
            license_number: null,
            candidates: [candidateA, candidateB],
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('普拿疼膜衣錠500毫克')).toBeInTheDocument();
    expect(screen.getByText('普拿疼速效膜衣錠')).toBeInTheDocument();
    expect(within(screen.getByTestId('candidate-list')).getAllByRole('button')).toHaveLength(2);

    fireEvent.click(screen.getByText('普拿疼速效膜衣錠').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBe('LIC-B');
  });

  // 7.3：未挑選不得阻擋提交，介面要明講後果只是「不會顯示藥丸照片」。
  it('未挑選候選時仍可送出，證號留空；畫面已說明後果只是沒有照片', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidateA = makeCandidate({ license_number: 'LIC-A', name_zh: '普拿疼膜衣錠500毫克' });
    const candidateB = makeCandidate({ license_number: 'LIC-B', name_zh: '普拿疼速效膜衣錠' });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({ name: '普拿疼', license_number: null, candidates: [candidateA, candidateB] }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText('沒有找到相符的也沒關係，不選不會影響建立這項藥品，只是不會顯示藥丸照片。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });

  // 候選縮圖是從後端網域載入的真實 HTTP 資源，載入失敗（斷線、檔案不存在）
  // 時不能留下一個破損的圖片區塊，必須降級為純文字（見 PillThumbnail）。
  it('候選縮圖載入失敗時，隱藏圖片但仍保留候選的外觀文字描述', async () => {
    const candidateA = makeCandidate({
      license_number: 'LIC-A',
      name_zh: '某候選藥品A',
      thumbnail_url: 'https://cdn.example.com/broken.jpg',
    });
    const candidateB = makeCandidate({ license_number: 'LIC-B', name_zh: '某候選藥品B' });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({ name: '普拿疼', license_number: null, candidates: [candidateA, candidateB] }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    const img = await screen.findByAltText('某候選藥品A');
    fireEvent.error(img);

    await waitFor(() => expect(screen.queryByAltText('某候選藥品A')).not.toBeInTheDocument());
    // 圖片不見了，但名稱與外觀文字仍然在——沒有照片只是少一個輔助。
    expect(screen.getByText('某候選藥品A')).toBeInTheDocument();
  });

  // 7.6：藥名一經編輯，證號與照片一併失效——連同唯一候選時原本呈現的
  // 「已確認」外觀卡片也要立刻消失，不能讓畫面留著改名前的舊照片。
  it('編輯藥名後，藥丸外觀立即消失並顯示提示；送出時證號留空', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidate = makeCandidate({ license_number: '衛署藥製字第000001號', name_zh: '脈優錠5毫克' });
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [
          makeDrug({
            name: '脈優錠5毫克',
            license_number: '衛署藥製字第000001號',
            candidates: [candidate],
          }),
        ],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('已確認')).toBeInTheDocument();

    const nameInput = screen.getByLabelText('藥品名稱');
    fireEvent.change(nameInput, { target: { value: '改過的藥名' } });

    expect(screen.queryByText('已確認')).not.toBeInTheDocument();
    expect(
      await screen.findByText('您修改了藥名，原本比對到的證號與藥丸照片已一併清除；如需要，請重新掃描藥袋。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });
});

describe('PrescriptionDraftForm：候選過多時以外觀屬性漸進收窄（7.4）', () => {
  function buildCandidates(
    specs: Array<{ color: string; shape: string; count: number; prefix: string }>,
  ): DrugCandidate[] {
    return specs.flatMap(({ color, shape, count, prefix }) =>
      Array.from({ length: count }, (_, i) =>
        makeCandidate({
          license_number: `${prefix}-${i}`,
          name_zh: `${prefix}候選${i}`,
          color,
          shape,
        }),
      ),
    );
  }

  it('候選超過上限時先詢問顏色；選擇後若已收窄到上限內，直接呈現照片', async () => {
    const candidates = buildCandidates([
      { color: '白色', shape: '圓形', count: 4, prefix: 'W' },
      { color: '粉紅色', shape: '橢圓形', count: 3, prefix: 'P' },
    ]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText('這個藥名對應到 7 種可能的藥品，請問藥丸是什麼顏色？'),
    ).toBeInTheDocument();
    // 還沒選顏色，不該先看到任何候選卡片
    expect(screen.queryByText('W候選0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '白色' }));

    expect(await screen.findByText('W候選0')).toBeInTheDocument();
    expect(within(screen.getByTestId('candidate-list')).getAllByRole('button')).toHaveLength(4);
  });

  it('顏色收窄後仍超過上限時，接著詢問形狀；兩步驟收窄後才呈現照片', async () => {
    const candidates = buildCandidates([
      { color: '白色', shape: '圓形', count: 3, prefix: 'WR' },
      { color: '白色', shape: '橢圓形', count: 3, prefix: 'WO' },
      { color: '粉紅色', shape: '圓形', count: 3, prefix: 'PR' },
      { color: '粉紅色', shape: '橢圓形', count: 3, prefix: 'PO' },
    ]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText('這個藥名對應到 12 種可能的藥品，請問藥丸是什麼顏色？'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '白色' }));

    // 白色仍有 6 張（超過上限 5），要接著問形狀，而不是直接攤開這 6 張。
    expect(await screen.findByText('請問藥丸是什麼形狀？')).toBeInTheDocument();
    expect(screen.queryByText('WR候選0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '圓形' }));

    expect(await screen.findByText('WR候選0')).toBeInTheDocument();
    expect(within(screen.getByTestId('candidate-list')).getAllByRole('button')).toHaveLength(3);
  });

  it('顏色與形狀都無法進一步收窄、候選仍超過上限時，退回純文字、不顯示任何照片', async () => {
    const candidates = buildCandidates([{ color: '白色', shape: '圓形', count: 8, prefix: 'M' }]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText(
        '這個藥名的候選太多，且無法用顏色或形狀進一步縮小範圍，這次不提供藥丸照片可供選擇，不影響這項藥品的建立。',
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByTestId('candidate-list')).not.toBeInTheDocument();
    expect(screen.queryByText('M候選0')).not.toBeInTheDocument();
  });

  it('使用者可略過顏色詢問，直接以純文字退場，不阻擋提交', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidates = buildCandidates([
      { color: '白色', shape: '圓形', count: 4, prefix: 'W' },
      { color: '粉紅色', shape: '橢圓形', count: 3, prefix: 'P' },
    ]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '看不出來，略過' }));

    expect(
      await screen.findByText(
        '這個藥名的候選太多，且無法用顏色或形狀進一步縮小範圍，這次不提供藥丸照片可供選擇，不影響這項藥品的建立。',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });
});

describe('PrescriptionDraftForm：挑選必須隨篩選失效而清空（C1 回歸測試）', () => {
  function buildCandidates(
    specs: Array<{ color: string; shape: string; count: number; prefix: string }>,
  ): DrugCandidate[] {
    return specs.flatMap(({ color, shape, count, prefix }) =>
      Array.from({ length: count }, (_, i) =>
        makeCandidate({
          license_number: `${prefix}-${i}`,
          name_zh: `${prefix}候選${i}`,
          color,
          shape,
        }),
      ),
    );
  }

  // 候選是在某個顏色／形狀篩選之下才呈現出來的——使用者在那個篩選底下
  // 挑了一張，接著又放棄那個篩選（重新篩選或直接略過），代表他挑的那張
  // 已經不再是畫面上任何看得到的東西。若送出時仍帶著那個舊證號，等於
  // 「螢幕說不會顯示照片，實際卻用一個使用者已經放棄的篩選底下選出的
  // 證號建立藥品、掛上照片」——這正是本能力要避免的錯誤（貼錯照片比不
  // 貼危險）。
  it('在篩選下挑選候選後，重新篩選、略過後送出，證號不得殘留（重新篩選 → 略過）', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidates = buildCandidates([
      { color: '白色', shape: '圓形', count: 3, prefix: 'WR' },
      { color: '白色', shape: '橢圓形', count: 3, prefix: 'WO' },
      { color: '粉紅色', shape: '圓形', count: 3, prefix: 'PR' },
      { color: '粉紅色', shape: '橢圓形', count: 3, prefix: 'PO' },
    ]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    // 12 → 選白色 → 6 → 選圓形 → 3（WR-0/1/2），挑選 WR-0
    fireEvent.click(await screen.findByRole('button', { name: '白色' }));
    fireEvent.click(await screen.findByRole('button', { name: '圓形' }));
    fireEvent.click((await screen.findByText('WR候選0')).closest('button')!);

    // 放棄這個篩選：重新篩選（回到問顏色）
    fireEvent.click(await screen.findByRole('button', { name: '重新選擇顏色／形狀' }));
    expect(
      await screen.findByText('這個藥名對應到 12 種可能的藥品，請問藥丸是什麼顏色？'),
    ).toBeInTheDocument();

    // 再略過，直接退回純文字——畫面明講「這次不提供藥丸照片可供選擇」
    fireEvent.click(screen.getByRole('button', { name: '看不出來，略過' }));
    expect(
      await screen.findByText(
        '這個藥名的候選太多，且無法用顏色或形狀進一步縮小範圍，這次不提供藥丸照片可供選擇，不影響這項藥品的建立。',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    // 畫面已經說了「不提供照片」，送出的證號絕不能是放棄篩選前選過的 WR-0。
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });

  // 對照情境：挑選後不放棄整個篩選，而是直接改選另一個顏色——舊的挑選一樣
  // 是在已經不存在的候選集合下選出的，同樣必須被清空。
  it('挑選候選後改選另一個屬性值時，先前的挑選必須清空', async () => {
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: [],
    });
    const candidates = buildCandidates([
      { color: '白色', shape: '圓形', count: 3, prefix: 'WR' },
      { color: '白色', shape: '橢圓形', count: 3, prefix: 'WO' },
      { color: '粉紅色', shape: '圓形', count: 3, prefix: 'PR' },
      { color: '粉紅色', shape: '橢圓形', count: 3, prefix: 'PO' },
    ]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ name: '感冒液', license_number: null, candidates })],
        multiple_bags_suspected: false,
      },
    });

    renderWithToaster(
      <PrescriptionDraftForm draft={draft} onCommitted={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '白色' }));
    fireEvent.click(await screen.findByRole('button', { name: '圓形' }));
    fireEvent.click((await screen.findByText('WR候選0')).closest('button')!);

    fireEvent.click(await screen.findByRole('button', { name: '重新選擇顏色／形狀' }));
    fireEvent.click(await screen.findByRole('button', { name: '粉紅色' }));
    fireEvent.click(await screen.findByRole('button', { name: '橢圓形' }));

    // 換了顏色與形狀之後，畫面上不該有任何一張卡片顯示「已選擇」的樣子
    const poCard = (await screen.findByText('PO候選0')).closest('button')!;
    expect(poCard).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    const [, payload] = vi.mocked(medicationApi.commitPrescriptionDraft).mock.calls[0]!;
    expect(payload.drugs[0]!.license_number).toBeUndefined();
  });
});

describe('PrescriptionDraftForm：送出前揭露重新開啟提醒（Fix 1）', () => {
  // 這是本輪修正的 CRITICAL 缺陷回歸測試：find_or_create_reminder 改成
  // 命中既有規則就重新開啟它（而不是另外插入第二筆），核對畫面必須在
  // 使用者按下送出「之前」就讓他知道這件事，否則等於是靜默恢復一則
  // 他當初主動關掉的提醒。
  it('目前選定對象在該時段的提醒已停用時，送出前顯示重新開啟的警示', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      makeExistingReminder({ slot_type: 'morning', enabled: false }),
    ]);
    const draft = makeDraft({
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

    expect(await screen.findByText('送出後會重新開啟已關閉的提醒')).toBeInTheDocument();
    expect(screen.getByText('「早」目前是關閉的，確認送出後會重新開啟。')).toBeInTheDocument();
  });

  it('該時段原本還掛著其他藥時，警示會多提醒一句其他藥也會恢復', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      makeExistingReminder({
        slot_type: 'morning',
        enabled: false,
        medications: [makeMedication({ id: 'm-old', name: '舊藥', source: 'manual' })],
      }),
    ]);
    const draft = makeDraft({
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

    expect(
      await screen.findByText('這個時段原本設定的其他藥品提醒也會一併恢復發送。', { exact: false }),
    ).toBeInTheDocument();
  });

  it('該時段的提醒本來就是啟用中時，不顯示重新開啟的警示', async () => {
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      makeExistingReminder({ slot_type: 'morning', enabled: true }),
    ]);
    const draft = makeDraft({
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
    expect(screen.queryByText('送出後會重新開啟已關閉的提醒')).not.toBeInTheDocument();
  });

  it('該時段根本沒有既有提醒時，不顯示重新開啟的警示', async () => {
    const draft = makeDraft({
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
    expect(screen.queryByText('送出後會重新開啟已關閉的提醒')).not.toBeInTheDocument();
  });
});

describe('MedicationsPage：送出後的 toast 反映實際發生的事（Fix 3）', () => {
  // 這是本輪修正的重大缺陷回歸測試：修正前 toast 只看 prn_medication_ids，
  // 使用者剛在核對畫面被告知「這項藥不會建立定時提醒」（勾選了「這個藥
  // 不用定時提醒我」，不是 PRN），送出後卻看到「已建立 1 項藥品與對應
  // 提醒」，前後矛盾。
  it('使用者勾選「這個藥不用定時提醒我」（非 PRN）時，toast 仍會提到這件事', async () => {
    vi.mocked(settingsApi.getPrescriptionScanEnabled).mockResolvedValue(true);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '脈優錠5毫克' })],
        multiple_bags_suspected: false,
      },
    });
    vi.mocked(medicationApi.scanPrescription).mockResolvedValue(draft);
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: [],
      reactivated_slots: [],
    });

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /掃描藥袋/ }));
    const fileInput = screen.getByLabelText('拍照或選擇照片', { selector: 'input' });
    fireEvent.change(fileInput, {
      target: { files: [new File(['fake-image'], 'bag.jpg', { type: 'image/jpeg' })] },
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '這個藥不用定時提醒我' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    expect(await screen.findByText('已建立 1 項藥品，其中 1 項不會有定時提醒')).toBeInTheDocument();
  });

  // 迴歸防護：capture="environment" 會讓手機直接開相機並跳過檔案選擇器，
  // 使用者就選不到相簿裡既有的照片——與按鈕文案「拍照或選擇照片」矛盾。
  it('檔案輸入不帶 capture，才選得到相簿裡既有的照片', async () => {
    vi.mocked(settingsApi.getPrescriptionScanEnabled).mockResolvedValue(true);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /掃描藥袋/ }));
    const fileInput = screen.getByLabelText('拍照或選擇照片', { selector: 'input' });

    expect(fileInput.getAttribute('accept')).toBe('image/*');
    expect(fileInput.hasAttribute('capture')).toBe(false);
  });

  it('這次提交重新開啟了一個時段時，toast 也會提到這件事', async () => {
    vi.mocked(settingsApi.getPrescriptionScanEnabled).mockResolvedValue(true);
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([]);
    const draft = makeDraft({
      recognition: {
        institution: null,
        patient_name: null,
        dispensed_date: null,
        drugs: [makeDrug({ frequency_code: 'QD', name: '脈優錠5毫克' })],
        multiple_bags_suspected: false,
      },
    });
    vi.mocked(medicationApi.scanPrescription).mockResolvedValue(draft);
    vi.mocked(medicationApi.commitPrescriptionDraft).mockResolvedValue({
      medication_ids: ['m-1'],
      prn_medication_ids: [],
      reminder_ids: ['r-1'],
      reactivated_slots: ['morning'],
    });

    renderWithToaster(
      <MemoryRouter>
        <MedicationsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /掃描藥袋/ }));
    const fileInput = screen.getByLabelText('拍照或選擇照片', { selector: 'input' });
    fireEvent.change(fileInput, {
      target: { files: [new File(['fake-image'], 'bag.jpg', { type: 'image/jpeg' })] },
    });

    fireEvent.click(await screen.findByRole('button', { name: '確認並送出' }));

    await waitFor(() => expect(medicationApi.commitPrescriptionDraft).toHaveBeenCalled());
    expect(
      await screen.findByText('已建立 1 項藥品與對應提醒 「早」的提醒已重新開啟。'),
    ).toBeInTheDocument();
  });
});

describe('ReminderCard：依證號呈現藥丸照片與外觀描述（7.5）', () => {
  function makeReminderWithMedications(medications: Medication[]): MedicationReminder {
    return {
      id: 'r-1',
      creator_user_id: 'U-self',
      user_id: 'U-self',
      slot_type: 'morning',
      scheduled_time: '08:00',
      start_date: '2026-06-01',
      end_date: null,
      enabled: true,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      medications,
    };
  }

  // 縮圖網址由後端就地解析並隨 Medication.thumbnail_url 一起回傳（I3：
  // 前端不再自行用證號重算雜湊路徑，只有後端知道檔案是否真的落地）；
  // 測試直接餵一個固定網址，不依賴任何環境變數，換一台機器、換一個
  // VITE_API_BASE_URL 都照樣通過。
  it('有 thumbnail_url 時顯示縮圖與外觀文字描述（含刻痕／標註）', async () => {
    const med = makeMedication({
      license_number: '衛署藥製字第000001號',
      color: '白色',
      shape: '圓形',
      mark_one: 'PBF 436',
      thumbnail_url: 'https://cdn.example.com/drug-appearance/abc123.jpg',
    });

    renderWithToaster(
      <ReminderCard reminder={makeReminderWithMedications([med])} onToggle={vi.fn()} onEdit={vi.fn()} />,
    );

    expect(screen.getByText('脈優錠5毫克', { exact: false })).toBeInTheDocument();
    // I2：刻痕／標註也要在這張卡片上呈現，不是只有顏色／形狀。
    expect(await screen.findByText('（白色、圓形、PBF 436）')).toBeInTheDocument();
    const img = await screen.findByAltText('脈優錠5毫克');
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/drug-appearance/abc123.jpg');
  });

  it('thumbnail_url 為 null 時不顯示照片，僅呈現藥名與外觀文字', () => {
    const med = makeMedication({
      license_number: '衛署藥製字第000001號',
      color: '白色',
      shape: '圓形',
      thumbnail_url: null,
    });

    renderWithToaster(
      <ReminderCard reminder={makeReminderWithMedications([med])} onToggle={vi.fn()} onEdit={vi.fn()} />,
    );

    expect(screen.getByText('脈優錠5毫克', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('（白色、圓形）')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('沒有證號時不顯示照片，僅呈現藥名（無外觀文字）', () => {
    const med = makeMedication({ license_number: null, thumbnail_url: null });

    renderWithToaster(
      <ReminderCard reminder={makeReminderWithMedications([med])} onToggle={vi.fn()} onEdit={vi.fn()} />,
    );

    expect(screen.getByText('脈優錠5毫克', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('縮圖載入失敗時，仍呈現外觀文字描述，不留下破損的圖片區塊', async () => {
    const med = makeMedication({
      license_number: '衛署藥製字第000001號',
      color: '白色',
      shape: '圓形',
      thumbnail_url: 'https://cdn.example.com/drug-appearance/broken.jpg',
    });

    renderWithToaster(
      <ReminderCard reminder={makeReminderWithMedications([med])} onToggle={vi.fn()} onEdit={vi.fn()} />,
    );

    const img = await screen.findByAltText('脈優錠5毫克');
    fireEvent.error(img);

    await waitFor(() => expect(screen.queryByAltText('脈優錠5毫克')).not.toBeInTheDocument());
    expect(screen.getByText('（白色、圓形）')).toBeInTheDocument();
  });

  it('沒有外觀資料的手動建立藥品，維持原本只顯示藥名的樣子', () => {
    const med = makeMedication({
      license_number: null,
      source: 'manual',
      name: '手動藥品',
      thumbnail_url: null,
    });

    renderWithToaster(
      <ReminderCard reminder={makeReminderWithMedications([med])} onToggle={vi.fn()} onEdit={vi.fn()} />,
    );

    expect(screen.getByText('手動藥品', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/（/)).not.toBeInTheDocument();
  });
});
