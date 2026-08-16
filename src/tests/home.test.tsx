import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { renderWithToaster } from './testUtils';
import Home from '../pages/Home';
import { getPersonalHealthProfile } from '../api/profileApi';
import i18n from '../i18n';

// 1. 模擬 (Mock) react-router-dom 的 useNavigate
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// 首頁會查本人檔案來判斷是不是管理員（決定要不要出審核卡片）
vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

const mockGetProfile = vi.mocked(getPersonalHealthProfile);

describe('Home Page Component', () => {
  // 每次測試前清除 mock 的紀錄，確保測試間互相獨立
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockGetProfile.mockReset();
    mockGetProfile.mockResolvedValue({ role: 'user' });
    await i18n.changeLanguage('zh-TW');
  });

  const renderHome = () => {
    return renderWithToaster(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
  };

  it('應該要正確渲染標題與歡迎詞', () => {
    renderHome();

    // 檢查實際渲染的標題
    expect(screen.getByRole('heading', { name: 'CARE 健康管家', level: 1 })).toBeInTheDocument();

    // 檢查實際渲染的副標題
    expect(screen.getByText('點選下方卡片開始管理您的健康')).toBeInTheDocument();
  });

  it('應該要渲染出所有的功能卡片', () => {
    renderHome();

    // 檢查功能卡片的標題是否符合實際文字
    expect(screen.getByText('個人健康')).toBeInTheDocument();
    expect(screen.getByText('家庭介面')).toBeInTheDocument();
    expect(screen.getByText('知識回報')).toBeInTheDocument();
    expect(screen.getByText('設定頁面')).toBeInTheDocument();

    // 檢查描述文字是否符合實際文字
    expect(screen.getByText('健康紀錄與醫院預約')).toBeInTheDocument();
    expect(screen.getByText('管理長輩與家人狀況')).toBeInTheDocument();
    expect(screen.getByText('追蹤人工審核進度')).toBeInTheDocument();
  });

  it('首頁不應再出現身分驗證卡片（登出已移至設定頁）', () => {
    renderHome();

    expect(screen.queryByText('帳號登入')).not.toBeInTheDocument();
    expect(screen.queryByText('帳號登出')).not.toBeInTheDocument();
  });

  it('點擊卡片時，應該觸發 navigate 並前往對應的路徑', () => {
    renderHome();

    // 測試點擊「個人健康」
    const healthButton = screen.getByText('個人健康').closest('button');
    fireEvent.click(healthButton!);
    expect(mockNavigate).toHaveBeenCalledWith('/personalhealth');

    // 測試點擊「家庭介面」
    const familyButton = screen.getByText('家庭介面').closest('button');
    fireEvent.click(familyButton!);
    expect(mockNavigate).toHaveBeenCalledWith('/family');

    // 測試點擊「知識回報」
    const reportButton = screen.getByText('知識回報').closest('button');
    fireEvent.click(reportButton!);
    expect(mockNavigate).toHaveBeenCalledWith('/knowledge-reports');

    // 測試點擊「設定頁面」
    const settingsButton = screen.getByText('設定頁面').closest('button');
    fireEvent.click(settingsButton!);
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  // 手機沒有側欄、底部導覽也沒有這一項，首頁這張卡是 admin 在手機上唯一的入口
  it('管理員才看得到知識回報審核卡片', async () => {
    mockGetProfile.mockResolvedValue({ role: 'admin' });
    renderHome();

    const adminCard = await screen.findByText('知識回報審核');
    fireEvent.click(adminCard.closest('button')!);
    expect(mockNavigate).toHaveBeenCalledWith('/admin/knowledge-reports');
  });

  it('一般使用者看不到知識回報審核卡片', async () => {
    renderHome();

    // 等本人檔案回來，否則「還沒出現」只是因為查詢尚未完成
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    expect(screen.getByText('知識回報')).toBeInTheDocument();
    expect(screen.queryByText('知識回報審核')).not.toBeInTheDocument();
  });
});
