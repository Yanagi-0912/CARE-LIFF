import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import * as profileApi from '../api/profileApi';
import * as familyApi from '../api/familyApi';
import type { FamilyMember } from '../types/family';
import i18n from '../i18n';

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

vi.mock('../api/familyApi', () => ({
  createInvite: vi.fn(),
  fetchFamilyTree: vi.fn(),
}));

vi.mock('../hooks/useLiff', () => ({
  useLiff: () => ({ liffReady: true }),
}));

// 測試環境不是 LINE webview，把 shareTargetPicker 標成不可用，
// 讓邀請流程穩定走進「請在 LINE 內開啟」那條分支
vi.mock('@line/liff', () => ({
  default: {
    isApiAvailable: () => false,
    shareTargetPicker: vi.fn(),
  },
}));

const familyState = {
  members: [] as FamilyMember[],
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => familyState,
}));

const mom: FamilyMember = {
  user_id: 'U-mom',
  relationship_type: 'parent',
  display_name: '媽媽',
};

describe('FamilyPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    familyState.members = [mom];
    familyState.loading = false;
    familyState.error = null;
    await i18n.changeLanguage('zh-TW');
  });

  it('有成員時列出成員與稱謂，並顯示人數', () => {
    renderWithToaster(<FamilyPage />);

    expect(screen.getByText('媽媽')).toBeInTheDocument();
    expect(screen.getByText('父/母')).toBeInTheDocument();
    expect(screen.getByText('共 1 位家人')).toBeInTheDocument();
  });

  it('沒有成員時顯示空狀態，邀請按鈕就在空狀態卡片裡', () => {
    familyState.members = [];
    renderWithToaster(<FamilyPage />);

    expect(screen.getByText('還沒有家庭成員')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加入家人/ })).toBeInTheDocument();
  });

  it('載入失敗時顯示錯誤訊息與重新載入按鈕', () => {
    familyState.members = [];
    familyState.error = '載入族譜失敗';
    renderWithToaster(<FamilyPage />);

    expect(screen.getByText('載入失敗')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(familyState.refetch).toHaveBeenCalled();
  });

  it('收合時不打健康資料 API，展開後才載入並列出有填的欄位', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      age: 68,
      // 後端在沒填時回的佔位值，不該顯示成一列
      height: 1.0,
      weight: 1.0,
      chronic_history: '高血壓',
    });

    renderWithToaster(<FamilyPage />);
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('68 歲')).toBeInTheDocument();
    });
    expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom');
    expect(screen.getByText('高血壓')).toBeInTheDocument();
    expect(screen.queryByText(/1 cm/)).not.toBeInTheDocument();
  });

  it('健康資料整組是空的時候顯示提示，而不是空白區塊', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);

    renderWithToaster(<FamilyPage />);
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('這位家人還沒有填寫健康資料')).toBeInTheDocument();
    });
  });

  it('不在 LINE 內且沒有 Web Share 時，跳的是錯誤提示而不是成功提示', async () => {
    vi.mocked(familyApi.createInvite).mockResolvedValue({
      invite_token: 'tok',
      expires_at: '2026-12-31T00:00:00.000Z',
    });

    renderWithToaster(<FamilyPage />);
    fireEvent.click(screen.getByRole('button', { name: /加入家人/ }));

    await waitFor(() => {
      expect(
        screen.getByText('請在 LINE App 內開啟後再分享邀請連結'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('邀請已送出')).not.toBeInTheDocument();
  });
});
