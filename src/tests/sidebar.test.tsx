import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import Sidebar from '../components/Sidebar';
import * as profileApi from '../api/profileApi';
import i18n from '../i18n';

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

describe('Sidebar', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);
    await i18n.changeLanguage('zh-TW');
  });

  const renderAt = (path: string) =>
    renderWithToaster(
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>,
    );

  it('標記目前頁面，點擊其他項目時導覽過去', () => {
    renderAt('/medications');

    expect(screen.getByRole('button', { name: '用藥提醒' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '首頁' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: '家庭介面' }));
    expect(mockNavigate).toHaveBeenCalledWith('/family');
  });

  it('首頁只在路徑正好是 / 時才算目前頁面', () => {
    // '/' 若用 startsWith 判斷會對所有路徑成立，這裡確保它是完全比對
    renderAt('/settings');

    expect(screen.getByRole('button', { name: '首頁' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: '系統設定' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('非管理員看不到審核佇列入口，管理員才看得到', async () => {
    renderAt('/');
    expect(screen.queryByRole('button', { name: '知識審核' })).not.toBeInTheDocument();

    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'admin' });
    renderAt('/');

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '知識審核' }).length).toBeGreaterThan(0);
    });
  });
});
