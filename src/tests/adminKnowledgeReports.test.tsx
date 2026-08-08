import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as knowledgeReportsApi from '../api/knowledgeReportsApi';
import * as profileApi from '../api/profileApi';
import AdminRoute from '../components/AdminRoute';
import AdminKnowledgeReportsPage from '../pages/AdminKnowledgeReports';
import i18n from '../i18n';

vi.mock('../api/knowledgeReportsApi', () => ({
  fetchAdminKnowledgeReports: vi.fn(),
  approveKnowledgeReport: vi.fn(),
  rejectKnowledgeReport: vi.fn(),
}));

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

const mockReports: knowledgeReportsApi.KnowledgeReportDto[] = [
  {
    report_id: 'KR-2025-003',
    line_user_id: 'U-test-1',
    status: 'pending',
    reason: 'outdated',
    question: '咳嗽超過兩週需要看醫生嗎？',
    user_note: '請確認最新指引',
    user_source_urls: ['https://example.com/source-a'],
    resolution: null,
    reviewer_note: null,
    created_at: '2025-05-10T00:00:00.000Z',
    updated_at: '2025-05-10T00:00:00.000Z',
  },
  {
    report_id: 'KR-2025-002',
    line_user_id: 'U-test-1',
    status: 'reviewing',
    reason: 'missing',
    question: '高血壓飲食建議是否已更新？',
    user_note: null,
    user_source_urls: [],
    resolution: null,
    reviewer_note: null,
    created_at: '2025-05-08T00:00:00.000Z',
    updated_at: '2025-05-08T00:00:00.000Z',
  },
];

describe('AdminKnowledgeReportsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(knowledgeReportsApi.fetchAdminKnowledgeReports).mockResolvedValue({
      reports: mockReports,
    });
    vi.mocked(knowledgeReportsApi.approveKnowledgeReport).mockResolvedValue(mockReports[0]);
    vi.mocked(knowledgeReportsApi.rejectKnowledgeReport).mockResolvedValue({
      ...mockReports[0],
      status: 'rejected',
    });
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () =>
    renderWithToaster(
      <MemoryRouter>
        <AdminKnowledgeReportsPage />
      </MemoryRouter>,
    );

  it('顯示審核佇列列表項目', async () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: '知識回報審核佇列' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: '審核回報：高血壓飲食建議是否已更新？' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
  });

  it('核准流程會呼叫 approveKnowledgeReport', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '核准' }));

    await waitFor(() => {
      expect(knowledgeReportsApi.approveKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {});
    });
    expect(knowledgeReportsApi.rejectKnowledgeReport).not.toHaveBeenCalled();
  });

  it('拒絕流程會呼叫 rejectKnowledgeReport', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '拒絕' }));

    await waitFor(() => {
      expect(knowledgeReportsApi.rejectKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {});
    });
    expect(knowledgeReportsApi.approveKnowledgeReport).not.toHaveBeenCalled();
  });
});

describe('AdminRoute', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh-TW');
  });

  it('非 admin 會被導向首頁', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      role: 'user',
    } as Awaited<ReturnType<typeof profileApi.getPersonalHealthProfile>>);

    render(
      <MemoryRouter initialEntries={['/admin/knowledge-reports']}>
        <Routes>
          <Route path="/" element={<div>home-page</div>} />
          <Route
            path="/admin/knowledge-reports"
            element={
              <AdminRoute>
                <div>admin-page</div>
              </AdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('確認權限中…');

    await waitFor(() => {
      expect(screen.getByText('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByText('admin-page')).not.toBeInTheDocument();
  });
});
