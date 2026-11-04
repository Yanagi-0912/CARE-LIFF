import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithToaster as render } from './testUtils';
import userEvent from '@testing-library/user-event';

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';

import i18n, { getInitialLanguage } from '../i18n';
import SettingsPage from '../pages/Settings';
import { useLiffAuth } from '../context/liffAuth';
import { getUserSettings, updateUserSettings, type ApiUserSettings } from '../api/settingsApi';

// 登出的實際行為（清 token、liff.logout、標記主動登出）屬於 LiffAuthProvider，
// 這裡只驗證設定頁有把入口接到 logout() 並導回 /login。
const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn().mockResolvedValue({ role: 'user' }),
}));

vi.mock('../api/settingsApi', () => ({
  getUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
}));

vi.mock('../context/liffAuth', () => ({
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
async function renderSettings(initialLanguage = 'zh-TW' as const, path = '/settings/display') {
  await i18n.changeLanguage(initialLanguage);
  return render(
    <ThemeProvider attribute="class" defaultTheme="system">
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/settings/*" element={<SettingsPage />} /></Routes>
      </MemoryRouter>
    </ThemeProvider>,
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
    expect(screen.getByRole('heading', { name: 'Text and display' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Text and display' })).toBeInTheDocument();
  });

  // 台語只換語音：存的是 nan-TW，畫面維持繁體中文
  it('選擇台語後，localStorage 存 nan-TW，畫面維持繁體中文', async () => {
    await renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: '顯示語言' }));
    await user.click(await screen.findByRole('option', { name: '台語' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.language).toBe('nan-TW');
    });
    expect(i18n.language).toBe('zh-TW');
    expect(screen.getByRole('heading', { name: '字體與顯示' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '顯示語言' })).toHaveTextContent('台語');
  });

  // 畫面語言從英文換成中文時，同步選單的 effect 不能把台語蓋回「繁體中文」
  it('從英文改選台語，畫面切回繁體中文且選單仍顯示台語', async () => {
    localStorage.setItem('care-settings', JSON.stringify({ language: 'en' }));
    await renderSettings(getInitialLanguage('care-settings'));
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Display Language' }));
    await user.click(await screen.findByRole('option', { name: '台語' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '字體與顯示' })).toBeInTheDocument();
    });
    expect(screen.getByRole('combobox', { name: '顯示語言' })).toHaveTextContent('台語');
    const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
    expect(saved.language).toBe('nan-TW');
  });

  it('重新掛載後，選過台語仍顯示台語、畫面為繁體中文', async () => {
    localStorage.setItem('care-settings', JSON.stringify({ language: 'nan-TW' }));
    expect(getInitialLanguage('care-settings')).toBe('zh-TW');

    await renderSettings(getInitialLanguage('care-settings'));

    expect(screen.getByRole('combobox', { name: '顯示語言' })).toHaveTextContent('台語');
    expect(screen.getByRole('heading', { name: '字體與顯示' })).toBeInTheDocument();
  });
});

describe('設定頁語音區塊', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-TW');
  });

  it('語速預設值應為 normal（標準檔按鈕預設為選中狀態）', async () => {
    await renderSettings('zh-TW', '/settings/voice');

    // 語速群組的 aria-label 為專屬的「語速」文字，跟音色群組的「音色」區分開來
    const voiceRateGroup = screen.getByRole('group', { name: '語速' });
    expect(within(voiceRateGroup).getByRole('button', { name: '標準' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceRateGroup).getByRole('button', { name: '慢速' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(voiceRateGroup).getByRole('button', { name: '快速' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('切換語音回覆開關後，state 與 localStorage 應反映新值', async () => {
    await renderSettings('zh-TW', '/settings/voice');
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
    await renderSettings('zh-TW', '/settings/voice');
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
    await renderSettings('zh-TW', '/settings/voice');

    // 音色群組的 aria-label 為專屬的「音色」文字，跟語速群組的「語速」區分開來
    const voiceGenderGroup = screen.getByRole('group', { name: '音色' });
    expect(within(voiceGenderGroup).getByRole('button', { name: '女聲' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(voiceGenderGroup).getByRole('button', { name: '男聲' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('選擇男聲後，state 與 localStorage 記錄的值須為 male（非 UI 標籤文字「男聲」），且兩選項互斥', async () => {
    await renderSettings('zh-TW', '/settings/voice');
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
    await renderSettings('zh-TW', '/settings/voice');

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
    await renderSettings('zh-TW', '/settings/account');

    expect(screen.getByRole('heading', { name: '帳號', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
  });

  it('按下登出後應呼叫 logout() 並導向 /login', async () => {
    await renderSettings('zh-TW', '/settings/account');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '登出' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});

describe('設定頁通知區塊', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-TW');
  });

  it('三個通知開關都要在畫面上，且預設為開啟', async () => {
    await renderSettings('zh-TW', '/settings/notifications');

    for (const label of ['用藥提醒', '家人健康通知', '每日醫療消息']) {
      expect(screen.getByRole('switch', { name: `切換${label}` })).toBeChecked();
    }
  });

  it('關掉「每日醫療消息」應寫入 notifyMedicalNews: false', async () => {
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/notifications');

    await user.click(screen.getByRole('switch', { name: '切換每日醫療消息' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.notifyMedicalNews).toBe(false);
    });
  });

  it('三個開關互不影響', async () => {
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/notifications');

    await user.click(screen.getByRole('switch', { name: '切換每日醫療消息' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
      expect(saved.notifyMedicalNews).toBe(false);
      expect(saved.notifyReminder).toBe(true);
      expect(saved.notifyFamily).toBe(true);
    });
  });
});


describe('新版設定入口', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-TW');
  });

  it('總覽只列出四個入口，點進子頁後可返回總覽', async () => {
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings');

    expect(screen.getByRole('heading', { name: '用得更順手' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登出' })).not.toBeInTheDocument();
    for (const [name, path] of [
      ['字體與顯示', 'display'], ['語音回覆', 'voice'], ['通知設定', 'notifications'], ['帳號', 'account'],
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(name) });
      expect(link).toHaveAttribute('href', `/settings/${path}`);
      await user.click(link);
      expect(screen.getByRole('heading', { name, level: 1 })).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: '返回' }));
      expect(screen.getByRole('heading', { name: '用得更順手' })).toBeInTheDocument();
    }
  });

  it('切換子頁後保留剛選擇的設定', async () => {
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/voice');
    await user.click(within(screen.getByRole('group', { name: '語速' })).getByRole('button', { name: '快速' }));
    await user.click(screen.getByRole('link', { name: '返回' }));
    await user.click(screen.getByRole('link', { name: /語音回覆/ }));
    expect(within(screen.getByRole('group', { name: '語速' })).getByRole('button', { name: '快速' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('顯示頁可切換淺色、深色及跟隨系統並持久化主題', async () => {
    const user = userEvent.setup();
    await renderSettings();
    const group = screen.getByRole('group', { name: '顯示模式' });
    for (const [label, value] of [['深色', 'dark'], ['淺色', 'light'], ['跟隨系統', 'system']]) {
      await user.click(within(group).getByRole('button', { name: label }));
      expect(within(group).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe(value);
    }
  });
});


const remoteSettings: ApiUserSettings = {
  language: 'zh-TW', font_size: 'large', high_contrast: true,
  notify_reminder: true, notify_family: true, notify_medical_news: true,
  voice_reply_enabled: false, voice_rate: 'normal', voice_gender: 'female',
};

describe('設定伺服器同步', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('CARE_AUTH_TOKEN', 'settings-test-token');
    vi.mocked(getUserSettings).mockReset();
    vi.mocked(updateUserSettings).mockReset().mockResolvedValue(remoteSettings);
    await i18n.changeLanguage('zh-TW');
  });

  it('尚未操作的欄位會採用伺服器設定，台語仍顯示繁體中文', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({ ...remoteSettings, language: 'nan-TW', font_size: 'xlarge', high_contrast: false });
    await renderSettings();
    await waitFor(() => expect(screen.getByRole('combobox', { name: '顯示語言' })).toHaveTextContent('台語'));
    expect(screen.getByRole('heading', { name: '字體與顯示' })).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--base-font-size')).toBe('24px');
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
  });

  it('較晚回來的初始讀取不可蓋掉剛調整的語言與字級，其他欄位仍同步', async () => {
    let finishRead!: (value: ApiUserSettings) => void;
    vi.mocked(getUserSettings).mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
    const user = userEvent.setup();
    await renderSettings();
    await user.click(within(screen.getByRole('group', { name: '字體大小' })).getByRole('button', { name: '特大' }));
    await user.click(screen.getByRole('combobox', { name: '顯示語言' }));
    await user.click(await screen.findByRole('option', { name: '台語' }));
    await act(async () => { finishRead({ ...remoteSettings, language: 'en', high_contrast: false }); });

    expect(screen.getByRole('combobox', { name: '顯示語言' })).toHaveTextContent('台語');
    expect(document.documentElement.style.getPropertyValue('--base-font-size')).toBe('24px');
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
    expect(updateUserSettings).toHaveBeenCalledWith({ font_size: 'xlarge' });
    expect(updateUserSettings).toHaveBeenCalledWith({ language: 'nan-TW' });
  });

  it('讀取失敗保留本機設定，仍可操作並同步變更', async () => {
    vi.mocked(getUserSettings).mockRejectedValue(new Error('read failure'));
    localStorage.setItem('care-settings', JSON.stringify({ voiceRate: 'slow' }));
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/voice');
    const group = screen.getByRole('group', { name: '語速' });
    expect(within(group).getByRole('button', { name: '慢速' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: '快速' }));
    expect(updateUserSettings).toHaveBeenCalledExactlyOnceWith({ voice_rate: 'fast' });
    expect(JSON.parse(localStorage.getItem('care-settings') || '{}').voiceRate).toBe('fast');
  });

  it('伺服器寫入尚未結束時切換子頁，仍保留變更且不重抓設定', async () => {
    let finishWrite!: (value: ApiUserSettings) => void;
    vi.mocked(getUserSettings).mockResolvedValue(remoteSettings);
    vi.mocked(updateUserSettings).mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/voice');
    await user.click(within(screen.getByRole('group', { name: '音色' })).getByRole('button', { name: '男聲' }));
    await user.click(screen.getByRole('link', { name: '返回' }));
    await user.click(screen.getByRole('link', { name: /通知設定/ }));
    await act(async () => { finishWrite({ ...remoteSettings, voice_gender: 'male' }); });
    await user.click(screen.getByRole('link', { name: '返回' }));
    await user.click(screen.getByRole('link', { name: /語音回覆/ }));

    expect(within(screen.getByRole('group', { name: '音色' })).getByRole('button', { name: '男聲' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(getUserSettings).toHaveBeenCalledTimes(1);
    expect(updateUserSettings).toHaveBeenCalledExactlyOnceWith({ voice_gender: 'male' });
    expect(JSON.parse(localStorage.getItem('care-settings') || '{}').voiceGender).toBe('male');
  });

  it('同步失敗提示使用者且保留本機變更', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(remoteSettings);
    vi.mocked(updateUserSettings).mockRejectedValue(new Error('write failure'));
    const user = userEvent.setup();
    await renderSettings('zh-TW', '/settings/notifications');
    await user.click(screen.getByRole('switch', { name: '切換每日醫療消息' }));
    expect(await screen.findByText('設定沒有同步到伺服器，換裝置登入時可能不會保留')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '切換每日醫療消息' })).not.toBeChecked();
    expect(updateUserSettings).toHaveBeenCalledExactlyOnceWith({ notify_medical_news: false });
    expect(JSON.parse(localStorage.getItem('care-settings') || '{}').notifyMedicalNews).toBe(false);
  });
});
