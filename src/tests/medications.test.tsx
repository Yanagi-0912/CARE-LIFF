import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as medicationApi from '../api/medicationApi';
import MedicationsPage from '../pages/Medications';
import type { Medication, MedicationReminder } from '../types/medication';
import i18n from '../i18n';

vi.mock('../api/medicationApi', () => ({
  fetchReminders: vi.fn(),
  createReminders: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
}));

// 這份既有測試不驗證藥袋掃描入口，開關固定回傳 false（不顯示掃描入口）
vi.mock('../api/settingsApi', () => ({
  getPrescriptionScanEnabled: vi.fn().mockResolvedValue(false),
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

  it('切換啟用開關後，該時段的藥品清單不會消失', async () => {
    // PUT /reminders/{id} 的回應刻意不帶 medications，如同真正的後端
    // （response_model=MedicationReminder，藥品清單只有 GET 才會附上）。
    // 快取若用回應整筆取代，藥品清單就會被洗掉——使用者停用某個時段後，
    // 畫面同時失去「剛剛關掉的是哪些藥」這個唯一線索，要重新整理才回得來。
    const morningWithMeds: MedicationReminder = {
      ...morning,
      medications: [makeMedication()],
    };
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([evening, morningWithMeds]);
    const { medications: _dropped, ...withoutMedications } = morningWithMeds;
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

  it('清空結束日期會送出 end_date: null，把療程改回長期', async () => {
    // 後端改用 exclude_unset 之後，「有帶且是 null」與「沒帶」是兩件不同的
    // 事，清空結束日期終於表達得出來。先前前端反過來用 zod refine 擋住使用者，
    // 因為送出去也會被服務層與資料層各濾掉一次。
    vi.mocked(medicationApi.updateReminder).mockResolvedValue({ ...morning, end_date: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /編輯「早」/ }));

    const endDate = screen.getByLabelText('結束日期');
    expect(endDate).toHaveValue('2026-08-31');
    fireEvent.change(endDate, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', { end_date: null });
    });
  });

  it('開始日期被清空時顯示錯誤訊息，而不是靜默地什麼都不做', async () => {
    // 這一欄原本沒有 FieldError，且 zod 的 min(1) 沒帶訊息：清空後按儲存
    // 毫無反應、毫無提示，看起來就像按鈕壞了。
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /編輯「早」/ }));

    fireEvent.change(screen.getByLabelText('開始日期'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(screen.getByText('請選擇開始日期')).toBeInTheDocument();
    });
    expect(medicationApi.updateReminder).not.toHaveBeenCalled();
  });

  it('可以改時段，且已被其他提醒佔用的時段停用', async () => {
    // 時段唯讀但時間可改，會做出「早上 21:00」這種自相矛盾的提醒。
    // 開放改時段的同時要擋住已被佔用的時段：同一位使用者的同一個時段只該有
    // 一份規則，否則那個時段每天會收到兩則推播（後端 `{user_id, slot_type}`
    // 上刻意沒有 unique index，見 find_or_create_reminder）。
    vi.mocked(medicationApi.updateReminder).mockResolvedValue({ ...morning, slot_type: 'noon' });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /編輯「早」/ }));

    // 「晚」已被 r-evening 佔用；「早」是自己現在的時段，不算衝突
    expect(screen.getByRole('radio', { name: /晚/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: /早/ })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: /中/ })).not.toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('radio', { name: /中/ }));
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(medicationApi.updateReminder).toHaveBeenCalledWith('r-morning', {
        slot_type: 'noon',
      });
    });
  });

  it('編輯視窗列出這個時段的藥品，卡片上看得到的資訊點進去不會消失', async () => {
    // 卡片上顯示藥名與外觀，點進編輯就整個不見——使用者無從確認「我正在改的
    // 是哪幾種藥的提醒」，尤其是要刪除的時候。
    vi.mocked(medicationApi.fetchReminders).mockResolvedValue([
      {
        ...morning,
        medications: [
          makeMedication({ thumbnail_url: 'https://static.example/pill.jpg' }),
          makeMedication({ id: 'm-2', name: '克流感膠囊', color: '', shape: '' }),
        ],
      },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /編輯「早」/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('脈優錠5毫克')).toBeInTheDocument();
    expect(within(dialog).getByText('克流感膠囊')).toBeInTheDocument();
  });
});
