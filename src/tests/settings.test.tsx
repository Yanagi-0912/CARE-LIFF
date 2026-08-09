import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import i18n, { getInitialLanguage } from '../i18n';
import SettingsPage from '../pages/Settings';

async function renderSettings(initialLanguage = 'zh-TW' as const) {
  await i18n.changeLanguage(initialLanguage);
  return render(<SettingsPage />);
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

    // 語速群組的 aria-label 為區塊標題「語音回覆」，用它跟字體大小群組的「標準」按鈕區分開來
    const voiceRateGroup = screen.getByRole('group', { name: '語音回覆' });
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
    const voiceRateGroup = screen.getByRole('group', { name: '語音回覆' });

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
});
