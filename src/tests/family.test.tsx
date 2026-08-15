import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
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

/** 諮詢頁的替身：只把網址上的查看對象印出來，用來驗證導向的目標 */
function ConsultProbe() {
  const [params] = useSearchParams();
  return <div data-testid="consult-probe">{params.get('user')}</div>;
}

/**
 * 成員卡片的「查看諮詢紀錄」用 useNavigate，必須有 Router context。
 * 掛真的 Routes 而非 mock useNavigate：這樣連查詢字串有沒有正確帶上都驗得到。
 */
function renderPage() {
  return renderWithToaster(
    <MemoryRouter initialEntries={['/family']}>
      <Routes>
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/personalhealth/consult" element={<ConsultProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FamilyPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    familyState.members = [mom];
    familyState.loading = false;
    familyState.error = null;
    await i18n.changeLanguage('zh-TW');
  });

  it('有成員時列出成員與稱謂，並顯示人數', () => {
    renderPage();

    expect(screen.getByText('媽媽')).toBeInTheDocument();
    expect(screen.getByText('父/母')).toBeInTheDocument();
    expect(screen.getByText('共 1 位家人')).toBeInTheDocument();
  });

  it('沒有成員時顯示空狀態，邀請按鈕就在空狀態卡片裡', () => {
    familyState.members = [];
    renderPage();

    expect(screen.getByText('還沒有家庭成員')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加入家人/ })).toBeInTheDocument();
  });

  it('載入失敗時顯示錯誤訊息與重新載入按鈕', () => {
    familyState.members = [];
    familyState.error = '載入族譜失敗';
    renderPage();

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
      gender: 'male',
      chronic_diseases: ['hypertension'],
      chronic_custom: ['痛風'],
    });

    renderPage();
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('68 歲')).toBeInTheDocument();
    });
    expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom');
    expect(screen.getByText('男')).toBeInTheDocument();
    // 固定選項翻成中文，自訂病名原文照用
    expect(screen.getByText('高血壓、痛風')).toBeInTheDocument();
    expect(screen.queryByText(/1 cm/)).not.toBeInTheDocument();
  });

  // 這個測試就是這整件事的起點：家庭頁把後端的儲存值原樣印出來，
  // 於是泰文使用者看家人的性別與慢性病看到的全是中文。
  it('切換語言後，家人的性別與固定選項慢性病要跟著翻譯', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      gender: 'female',
      chronic_diseases: ['hypertension', 'diabetes'],
      chronic_custom: ['痛風'],
    });

    await i18n.changeLanguage('en');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('Female')).toBeInTheDocument();
    });
    // 連接符也跟著語言走，英文用逗號而不是頓號
    expect(screen.getByText('Hypertension, Diabetes, 痛風')).toBeInTheDocument();
    // 自訂病名是使用者自己打的字，任何語言下都不該被翻譯或消失
    expect(screen.queryByText(/personalHealth\./)).not.toBeInTheDocument();

    // 已經 render 過了，換語言會觸發重繪，要包在 act 裡
    await act(async () => {
      await i18n.changeLanguage('th');
    });
    expect(screen.getByText('หญิง')).toBeInTheDocument();
    expect(screen.getByText('ความดันโลหิตสูง, เบาหวาน, 痛風')).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh-TW');
    });
  });

  it('健康資料整組是空的時候顯示提示，而不是空白區塊', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);

    renderPage();
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

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /加入家人/ }));

    await waitFor(() => {
      expect(
        screen.getByText('請在 LINE App 內開啟後再分享邀請連結'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('邀請已送出')).not.toBeInTheDocument();
  });

  it('展開後有「查看諮詢紀錄」，點了會帶著該成員的 id 導向諮詢頁', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);

    renderPage();
    // 收合時看不到，避免收合列上出現 button 巢狀 button
    expect(screen.queryByText('查看諮詢紀錄')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    fireEvent.click(await screen.findByRole('button', { name: /查看諮詢紀錄/ }));

    expect(await screen.findByTestId('consult-probe')).toHaveTextContent('U-mom');
  });
});
