import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import { ProxyHealthDialog } from '../pages/Family/ProxyHealthDialog';
import * as profileApi from '../api/profileApi';
import { queryKeys } from '@/lib/queryClient';
import type { FamilyMember } from '../types/family';
import i18n from '../i18n';

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
  proxyUpsertHealthProfile: vi.fn(),
}));

const mom: FamilyMember = {
  user_id: 'U-mom',
  relationship_type: 'parent',
  display_name: '媽媽',
  my_role: 'GUARDIAN',
  my_permissions: {
    general: ['READ', 'WRITE'],
    sensitive: ['READ', 'WRITE'],
    private: ['READ'],
  },
};

const PROFILE = {
  name: '陳秀琴',
  gender: 'female',
  height: 158,
  weight: 52,
  age: 79,
  chronic_diseases: ['hypertension'],
  chronic_custom: ['痛風'],
  major_illness_history: '2019 年心導管手術',
  surgery_history: '',
};

/** 讓測試能先把資料塞進快取，重現「卡片展開過」的狀態 */
function renderDialog(seedCache: boolean) {
  // staleTime 對齊 app 的 30 秒。用預設的 0 會讓掛載時背景重抓，
  // queryFn 因此照跑——那正好會掩蓋掉這裡要防的缺陷（填表掛在 queryFn 上）。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  if (seedCache) {
    client.setQueryData(queryKeys.memberProfile('U-mom'), PROFILE);
  }
  return renderWithToaster(
    <QueryClientProvider client={client}>
      <ProxyHealthDialog member={mom} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ProxyHealthDialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(PROFILE);
    vi.mocked(profileApi.proxyUpsertHealthProfile).mockResolvedValue({
      user_id: 'U-mom',
      updated: true,
      skipped_fields: [],
    });
    await i18n.changeLanguage('zh-TW');
  });

  it('快取已經有資料時（卡片展開過），表單仍要帶出既有內容', async () => {
    renderDialog(true);

    // 快取命中，queryFn 不會執行——填表若掛在請求上就會是一片空白，
    // 而空白會被當成「還沒填」，一路覆蓋掉長輩既有的資料
    await waitFor(() =>
      expect(screen.getByLabelText('年齡')).toHaveValue(79),
    );
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText('身高')).toHaveValue(158);
  });

  it('快取是空的時候會去讀，讀回來一樣帶出既有內容', async () => {
    renderDialog(false);

    await waitFor(() =>
      expect(screen.getByLabelText('年齡')).toHaveValue(79),
    );
    expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom');
  });

  it('送出時不帶 name——那個欄位不歸這條路徑管', async () => {
    renderDialog(true);
    await waitFor(() => expect(screen.getByLabelText('年齡')).toHaveValue(79));

    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(profileApi.proxyUpsertHealthProfile).toHaveBeenCalled(),
    );
    const [userId, payload] = vi.mocked(profileApi.proxyUpsertHealthProfile).mock
      .calls[0];
    expect(userId).toBe('U-mom');
    // 後端會剝除 name 並回報在 skipped_fields；讀回來的值還可能是空字串，
    // 送過去只會撞上欄位驗證
    expect(payload).not.toHaveProperty('name');
    expect(payload.age).toBe(79);
    expect(payload.chronic_custom).toEqual(['痛風']);
  });

  // PUT /api/profiles/{userId} 是整份覆寫。讀取失敗時若照樣給一張空白表單，
  // 家人會以為長輩還沒填，送出就把原本的病史整份清掉。
  it('讀取失敗時不給表單，只有錯誤說明與重新載入；讀到之後才能代填', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile)
      .mockRejectedValueOnce(new Error('取得個人資料失敗:500'))
      .mockResolvedValue(PROFILE);

    renderDialog(false);

    expect(await screen.findByText('無法載入健康資料')).toBeInTheDocument();
    expect(
      screen.getByText('要先讀到 媽媽 原本的資料才能代填，以免蓋掉已經填好的內容。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('年齡')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '儲存' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));

    await waitFor(() => expect(screen.getByLabelText('年齡')).toHaveValue(79));
    expect(profileApi.proxyUpsertHealthProfile).not.toHaveBeenCalled();
  });

  it('佔位值（age 0、height 1、gender unknown）與 null 都顯示成空白', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      ...PROFILE,
      gender: 'unknown',
      age: 0,
      height: 1,
      weight: null,
    });

    renderDialog(false);

    // 慢性病勾起來代表資料已經同步進表單，這時再看數值欄位
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /高血壓/ })).toBeChecked(),
    );
    expect(screen.getByLabelText('年齡')).toHaveValue(null);
    expect(screen.getByLabelText('身高')).toHaveValue(null);
    expect(screen.getByLabelText('體重')).toHaveValue(null);
  });
});
