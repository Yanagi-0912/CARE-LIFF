import { screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import Home from '../pages/Home';
import i18n from '../i18n';
import * as profileApi from '../api/profileApi';
import * as auth from '../utils/auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
vi.mock('../api/profileApi', () => ({ getPersonalHealthProfile: vi.fn() }));
vi.mock('../utils/auth', async () => ({
  ...await vi.importActual('../utils/auth'),
  isAuthenticated: vi.fn(() => true),
}));

const entries = [
  ['home.nearbyTitle', '/nearby-hospitals'],
  ['tools.healthRecords', '/health-records'],
  ['tools.clinicVisits', '/clinic-visits'],
  ['visits.title', '/reminders/medications/visits'],
  ['home.knowledgeReports', '/knowledge-reports'],
];

describe('工具首頁', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'user' });
    await i18n.changeLanguage('zh-TW');
  });

  it('一般使用者看到五項工具，看不到管理員入口', async () => {
    renderWithToaster(<Home />);
    expect(screen.getByRole('heading', { name: i18n.t('tools.title') })).toBeInTheDocument();
    await waitFor(() => expect(profileApi.getPersonalHealthProfile).toHaveBeenCalled());
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /知識回報審核/ })).not.toBeInTheDocument();
  });

  it('管理員另外看到知識回報審核與標記頁面', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'admin' });
    renderWithToaster(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: /知識回報審核/ }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/knowledge-reports');
    fireEvent.click(screen.getByRole('button', { name: /標記頁面/ }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/annotations');
  });

  it.each(entries)('%s 開啟 %s', (label, path) => {
    renderWithToaster(<Home />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${i18n.t(label)}`) }));
    expect(mockNavigate).toHaveBeenLastCalledWith(path);
  });
});
