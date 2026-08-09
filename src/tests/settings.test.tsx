import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MemoryRouter } from 'react-router-dom';

import i18n, { getInitialLanguage } from '../i18n';
import SettingsPage from '../pages/Settings';
import { useLiffAuth } from '../context/LiffAuthProvider';

// 登出的實際行為（清 token、liff.logout、標記主動登出）屬於 LiffAuthProvider，
// 這裡只驗證設定頁有把入口接到 logout() 並導回 /login。
const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../context/LiffAuthProvider', () => ({
  useLiffAuth: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mocked(useLiffAuth).mockReturnValue({
  authInitialized: true,
  isLoggedIn: true,
  liffError: null,
  refreshAuth: async () => {},
  markAuthenticated: () => {},
  logout: mockLogout,
});

// 設定頁的登出入口用到 useNavigate，必須包在 Router 裡才能渲染
async function renderSettings(initialLanguage = 'zh-TW' as const) {
  await i18n.changeLanguage(initialLanguage);
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('設定頁語言行為', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-TW');
  });

  it('切換語言後，應同步更新 localStorage 與畫面語言', async () => {
    await renderSettings();

    // 語言選單已改用 shadcn Select：trigger 為 combobox、選項為 option。
    // 必須用 userEvent（完整指標事件序列）Base UI 的彈出層才會關閉。
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '顯示語言' }));
    await user.click(await screen.findByRole('option', { name: 'English' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.language).toBe('en');
    });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('重新掛載後，應保留先前選擇的語言', async () => {
    localStorage.setItem(
      'care-settings',
      JSON.stringify({
        fontSize: 'large',
        language: 'en',
        highContrast: true,
        notifyReminder: true,
        notifyFamily: true,
      }),
    );

    await renderSettings(getInitialLanguage('care-settings'));

    // Select 的目前值顯示在 trigger 上（原生 select 時是讀 select.value）
    expect(screen.getByRole('combobox', { name: 'Display Language' })).toHaveTextContent('English');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});

describe('設定頁語音區塊', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-TW');
  });

  it('語速預設值應為 normal（標準檔按鈕預設為選中狀態）', async () => {
    await renderSettings();

    // 語速群組的 aria-label 為專屬的「語速」文字，跟音色群組的「音色」區分開來
    const voiceRateGroup = screen.getByRole('group', { name: '語速' });
    expect(within(voiceRateGroup).getByRole('button', { name: '標準' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceRateGroup).getByRole('button', { name: '慢速' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(voiceRateGroup).getByRole('button', { name: '快速' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('切換語音回覆開關後，state 與 localStorage 應反映新值', async () => {
    await renderSettings();
    const user = userEvent.setup();

    const voiceSwitch = screen.getByRole('switch', { name: '切換語音回覆' });
    expect(voiceSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(voiceSwitch);

    expect(voiceSwitch).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.voiceReplyEnabled).toBe(true);
    });
  });

  it('選擇語速三檔後，state 與 localStorage 記錄的值須為 slow/normal/fast（非 UI 標籤文字）', async () => {
    await renderSettings();
    const user = userEvent.setup();
    const voiceRateGroup = screen.getByRole('group', { name: '語速' });

    await user.click(within(voiceRateGroup).getByRole('button', { name: '快速' }));

    expect(within(voiceRateGroup).getByRole('button', { name: '快速' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceRateGroup).getByRole('button', { name: '標準' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.voiceRate).toBe('fast');
    });

    await user.click(within(voiceRateGroup).getByRole('button', { name: '慢速' }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.voiceRate).toBe('slow');
    });
  });

  it('音色預設值應為 female（女聲按鈕預設為選中狀態）', async () => {
    await renderSettings();

    // 音色群組的 aria-label 為專屬的「音色」文字，跟語速群組的「語速」區分開來
    const voiceGenderGroup = screen.getByRole('group', { name: '音色' });
    expect(within(voiceGenderGroup).getByRole('button', { name: '女聲' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceGenderGroup).getByRole('button', { name: '男聲' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('選擇男聲後，state 與 localStorage 記錄的值須為 male（非 UI 標籤文字「男聲」），且兩選項互斥', async () => {
    await renderSettings();
    const user = userEvent.setup();
    const voiceGenderGroup = screen.getByRole('group', { name: '音色' });

    await user.click(within(voiceGenderGroup).getByRole('button', { name: '男聲' }));

    expect(within(voiceGenderGroup).getByRole('button', { name: '男聲' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceGenderGroup).getByRole('button', { name: '女聲' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.voiceGender).toBe('male');
    });

    await user.click(within(voiceGenderGroup).getByRole('button', { name: '女聲' }));
    expect(within(voiceGenderGroup).getByRole('button', { name: '女聲' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceGenderGroup).getByRole('button', { name: '男聲' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.voiceGender).toBe('female');
    });
  });

  it('語速與音色兩個群組須有各自可辨識的無障礙名稱（不可同名）', async () => {
    await renderSettings();

    expect(screen.getByRole('group', { name: '語速' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '音色' })).toBeInTheDocument();
  });
});

describe('設定頁帳號區塊', () => {
  beforeEach(async () => {
    localStorage.clear();
    mockLogout.mockClear();
    mockNavigate.mockClear();
    await i18n.changeLanguage('zh-TW');
  });

  it('登出入口應出現在設定頁', async () => {
    await renderSettings();

    expect(screen.getByRole('heading', { name: '帳號' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
  });

  it('按下登出後應呼叫 logout() 並導向 /login', async () => {
    await renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '登出' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
