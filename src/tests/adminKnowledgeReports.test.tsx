import { fireEvent, screen, waitFor } from '@testing-library/react';
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

const SOURCE_A = 'https://example.com/source-a';
const SOURCE_B = 'https://example.com/source-b';

const mockReports: knowledgeReportsApi.KnowledgeReportDto[] = [
  {
    report_id: 'KR-2025-003',
    line_user_id: 'U-test-1',
    status: 'pending',
    reason: 'outdated',
    question: '咳嗽超過兩週需要看醫生嗎？',
    user_note: '請確認最新指引',
    user_source_urls: [SOURCE_A, SOURCE_B],
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
      total: mockReports.length,
      limit: 50,
      offset: 0,
      status_counts: { pending: 1, reviewing: 1 },
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

  /** 開啟第一筆回報的詳情 dialog */
  const openFirstReport = async () => {
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: '審核回報：咳嗽超過兩週需要看醫生嗎？' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  };

  it('核准流程預設全選來源並呼叫 approveKnowledgeReport', async () => {
    renderPage();
    await openFirstReport();

    fireEvent.click(screen.getByRole('button', { name: '核准' }));

    await waitFor(() => {
      expect(knowledgeReportsApi.approveKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {
        selected_urls: [SOURCE_A, SOURCE_B],
      });
    });
    expect(knowledgeReportsApi.rejectKnowledgeReport).not.toHaveBeenCalled();
  });

  it('取消勾選的來源不會送出', async () => {
    renderPage();
    await openFirstReport();

    fireEvent.click(screen.getByRole('checkbox', { name: `選取來源網址 ${SOURCE_B}` }));
    fireEvent.click(screen.getByRole('button', { name: '核准' }));

    await waitFor(() => {
      expect(knowledgeReportsApi.approveKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {
        selected_urls: [SOURCE_A],
      });
    });
  });

  it('全部取消勾選時停用核准，不送出請求', async () => {
    renderPage();
    await openFirstReport();

    fireEvent.click(screen.getByRole('checkbox', { name: `選取來源網址 ${SOURCE_A}` }));
    fireEvent.click(screen.getByRole('checkbox', { name: `選取來源網址 ${SOURCE_B}` }));

    const approveButton = screen.getByRole('button', { name: '核准' });
    expect(approveButton).toBeDisabled();
    expect(screen.getByText('請至少勾選一個來源網址才能核准。')).toBeInTheDocument();

    fireEvent.click(approveButton);
    expect(knowledgeReportsApi.approveKnowledgeReport).not.toHaveBeenCalled();
  });

  it('無來源的回報可由審核者補上 URL 後核准', async () => {
    renderPage();

    // KR-2025-002 的 user_source_urls 為空；使用者主動回報多半是這種
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：高血壓飲食建議是否已更新？' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: '審核回報：高血壓飲食建議是否已更新？' }),
    );

    // 補之前不能核准，也不該送出讓後端 400
    expect(screen.getByRole('button', { name: '核准' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: '補充來源網址' }), {
      target: { value: SOURCE_A },
    });
    fireEvent.click(screen.getByRole('button', { name: '加入' }));

    expect(screen.getByRole('checkbox', { name: `選取來源網址 ${SOURCE_A}` })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '核准' }));
    await waitFor(() => {
      expect(knowledgeReportsApi.approveKnowledgeReport).toHaveBeenCalledWith('KR-2025-002', {
        selected_urls: [SOURCE_A],
      });
    });
  });

  it('補上的 URL 未過白名單時顯示後端錯誤', async () => {
    vi.mocked(knowledgeReportsApi.approveKnowledgeReport).mockRejectedValue(
      new Error('URL not in whitelist: https://example.com/bad'),
    );
    renderPage();
    await openFirstReport();

    fireEvent.click(screen.getByRole('button', { name: '核准' }));

    await waitFor(() => {
      expect(
        screen.getByText('URL not in whitelist: https://example.com/bad'),
      ).toBeInTheDocument();
    });
    // 失敗時 dialog 不關閉，admin 才能修正
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('切換篩選會送 status 給後端並重新分頁', async () => {
    renderPage();
    await waitFor(() => {
      expect(knowledgeReportsApi.fetchAdminKnowledgeReports).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /待審核/ }));

    // client-side 過濾在分頁下只看得到已載入的頁，篩選必須交給後端
    await waitFor(() => {
      expect(knowledgeReportsApi.fetchAdminKnowledgeReports).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        status: 'pending',
      });
    });
  });

  it('分頁邊界重複的回報只呈現一次', async () => {
    vi.mocked(knowledgeReportsApi.fetchAdminKnowledgeReports)
      .mockResolvedValueOnce({
        reports: mockReports,
        total: 3,
        limit: 50,
        offset: 0,
        status_counts: { pending: 1, reviewing: 1 },
      })
      // 佇列在載入期間變動，第二頁又回傳了第一頁已有的那筆
      .mockResolvedValueOnce({
        reports: [mockReports[1]],
        total: 3,
        limit: 50,
        offset: 2,
        status_counts: { pending: 1, reviewing: 1 },
      });

    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '載入更多' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: '審核回報：高血壓飲食建議是否已更新？' }),
      ).toHaveLength(1);
    });
  });

  it('頁籤與統計的筆數來自後端而非已載入的頁', async () => {
    vi.mocked(knowledgeReportsApi.fetchAdminKnowledgeReports).mockResolvedValue({
      reports: mockReports,
      total: 120,
      limit: 50,
      offset: 0,
      // 只載入 2 筆，但實際佇列有 120 筆
      status_counts: { pending: 80, reviewing: 40 },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('120', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
    });
    expect(screen.getByText('80', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
    expect(screen.getByText('40', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
  });

  it('拒絕流程會呼叫 rejectKnowledgeReport', async () => {
    renderPage();
    await openFirstReport();

    fireEvent.click(screen.getByRole('button', { name: '拒絕' }));

    await waitFor(() => {
      expect(knowledgeReportsApi.rejectKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {});
    });
    expect(knowledgeReportsApi.approveKnowledgeReport).not.toHaveBeenCalled();
  });

  it('ingest 失敗會顯示原因，主要動作改為重試', async () => {
    const failedReport: knowledgeReportsApi.KnowledgeReportDto = {
      ...mockReports[0],
      status: 'reviewing',
      ingest_job: {
        selected_urls: [SOURCE_A],
        status: 'failed',
        error: `${SOURCE_A}: error (scrape failed)`,
        results: [
          { url: SOURCE_A, status: 'error', chunk_count: 0, message: 'scrape failed' },
        ],
      },
    };
    vi.mocked(knowledgeReportsApi.fetchAdminKnowledgeReports).mockResolvedValue({
      reports: [failedReport],
      total: 1,
      limit: 50,
      offset: 0,
      status_counts: { pending: 0, reviewing: 1 },
    });

    renderPage();
    await openFirstReport();

    // job 層級錯誤
    expect(screen.getByText(`${SOURCE_A}: error (scrape failed)`)).toBeInTheDocument();
    // 逐 URL 結果
    expect(screen.getByText(/（error，0 段）：scrape failed/)).toBeInTheDocument();

    // 重試沿用上次實際送出的 URL，不是重新從 user_source_urls 全選
    fireEvent.click(screen.getByRole('button', { name: '重試收錄' }));
    await waitFor(() => {
      expect(knowledgeReportsApi.approveKnowledgeReport).toHaveBeenCalledWith('KR-2025-003', {
        selected_urls: [SOURCE_A],
      });
    });
  });

  it('尚有未載入資料時可載入更多', async () => {
    const secondPage: knowledgeReportsApi.KnowledgeReportDto = {
      ...mockReports[0],
      report_id: 'KR-2025-001',
      question: '第二頁的回報',
    };
    vi.mocked(knowledgeReportsApi.fetchAdminKnowledgeReports)
      .mockResolvedValueOnce({
        reports: mockReports,
        total: 3,
        limit: 50,
        offset: 0,
        status_counts: { pending: 2, reviewing: 1 },
      })
      .mockResolvedValueOnce({
        reports: [secondPage],
        total: 3,
        limit: 50,
        offset: 2,
        status_counts: { pending: 2, reviewing: 1 },
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('已載入 2 ／ 共 3 筆')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '審核回報：第二頁的回報' }),
      ).toBeInTheDocument();
    });
    expect(knowledgeReportsApi.fetchAdminKnowledgeReports).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 2,
    });
    // 全部載入完畢後不再提供載入更多
    expect(screen.queryByRole('button', { name: '載入更多' })).not.toBeInTheDocument();
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

    renderWithToaster(
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
