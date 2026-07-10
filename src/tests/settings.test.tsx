import { fireEvent, render, screen } from '@testing-library/react';

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

    const select = screen.getByLabelText('顯示語言') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'en' } });

    const saved = JSON.parse(localStorage.getItem('care-settings') || '{}');
    expect(saved.language).toBe('en');
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

    const select = screen.getByLabelText('Display Language') as HTMLSelectElement;
    expect(select.value).toBe('en');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});
