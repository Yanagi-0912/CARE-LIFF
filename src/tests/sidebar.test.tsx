import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import Sidebar from '../components/Sidebar';
import i18n from '../i18n';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('桌面主要導覽', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh-TW');
  });
  const renderAt = (path: string) => renderWithToaster(
    <MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>,
  );

  it('提供與手機一致的五個入口', () => {
    renderAt('/');
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['健康', '提醒', '首頁', '工具', '設定']);
    fireEvent.click(screen.getByRole('button', { name: '工具' }));
    expect(mockNavigate).toHaveBeenCalledWith('/tools');
  });

  it.each([
    ['/', '首頁'],
    ['/personalhealth?view=edit', '首頁'],
    ['/family/members', '首頁'],
    ['/lost/watch', '首頁'],
    ['/reminders/appointments', '提醒'],
    ['/medications/visits', '提醒'],
    ['/tools', '工具'],
    ['/clinic-visits/record', '工具'],
    ['/admin/knowledge-reports', '工具'],
    ['/settings/display', '設定'],
    ['/health-records', '健康'],
    ['/personalhealth/consult', '健康'],
  ])('%s 標示所屬的 %s 入口', (path, label) => {
    renderAt(path);
    const current = screen.getAllByRole('button').filter(button => button.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });
});
