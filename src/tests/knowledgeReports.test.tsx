import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as knowledgeReportsApi from '../api/knowledgeReportsApi';
import KnowledgeReportsPage from '../pages/KnowledgeReports';
import i18n from '../i18n';

vi.mock('../api/knowledgeReportsApi', () => ({
  fetchKnowledgeReports: vi.fn(),
}));

vi.mock('@line/liff', () => ({
  default: {
    isInClient: vi.fn(() => false),
    closeWindow: vi.fn(),
  },
}));

const mockReports: knowledgeReportsApi.KnowledgeReportDto[] = [
  {
    report_id: 'KR-2025-003',
    line_user_id: 'U-test-1',
    status: 'pending',
    reason: 'outdated',
    question: '咳嗽超過兩週需要看醫生嗎？',
    user_note: null,
    user_source_urls: [],
    resolution: null,
    reviewer_note: '已收到回報，等待審核人員確認資料來源。',
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
    reviewer_note: '專家正在比對最新醫療指引，預計 1–2 個工作天完成。',
    created_at: '2025-05-08T00:00:00.000Z',
    updated_at: '2025-05-08T00:00:00.000Z',
  },
  {
    report_id: 'KR-2025-001',
    line_user_id: 'U-test-1',
    status: 'resolved',
    reason: 'outdated',
    question: '益生菌什麼時候吃效果最好？',
    user_note: null,
    user_source_urls: [],
    resolution: '已補充服用時機會依菌株與產品標示不同，應優先參考產品與醫療專業建議。',
    reviewer_note: '審核完成，已更新知識庫內容。',
    created_at: '2025-05-01T00:00:00.000Z',
    updated_at: '2025-05-01T00:00:00.000Z',
  },
];

describe('KnowledgeReportsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(knowledgeReportsApi.fetchKnowledgeReports).mockResolvedValue({ reports: mockReports });
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () =>
    renderWithToaster(
      <MemoryRouter>
        <KnowledgeReportsPage />
      </MemoryRouter>,
    );

  it('顯示回報摘要與各筆人工審核狀態', async () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: '一起讓醫療資訊更可靠' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('3', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
    });
    expect(screen.getAllByText(/人工審核中/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已更新知識庫/).length).toBeGreaterThan(0);
  });

  it('可依審核狀態篩選回報', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '查看回報：益生菌什麼時候吃效果最好？' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /已處理\s*1/ }));

    expect(
      screen.getByRole('button', { name: '查看回報：益生菌什麼時候吃效果最好？' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '查看回報：咳嗽超過兩週需要看醫生嗎？' }),
    ).not.toBeInTheDocument();
  });

  it('點擊回報可查看完整審核結果', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '查看回報：益生菌什麼時候吃效果最好？' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: '查看回報：益生菌什麼時候吃效果最好？' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('審核結果')).toBeInTheDocument();
    expect(screen.getByText(/已補充服用時機會依菌株/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '關閉詳情' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('切換越南文後，頁面與回報狀態均使用越南文', async () => {
    await i18n.changeLanguage('vi');
    renderPage();

    expect(
      screen.getByRole('heading', {
        name: 'Cùng xây dựng thông tin y tế đáng tin cậy hơn',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quay lại LINE để hỏi/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Đang kiểm duyệt thủ công/).length).toBeGreaterThan(0);
    });
  });
});
