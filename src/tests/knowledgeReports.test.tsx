import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeReportsPage from '../pages/KnowledgeReports';
import i18n from '../i18n';

vi.mock('@line/liff', () => ({
  default: {
    isInClient: vi.fn(() => false),
    closeWindow: vi.fn(),
  },
}));

describe('KnowledgeReportsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <KnowledgeReportsPage />
      </MemoryRouter>,
    );

  it('顯示回報摘要與各筆人工審核狀態', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: '一起讓醫療資訊更可靠' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3', { selector: '.knowledgeStats strong' })).toBeInTheDocument();
    expect(screen.getAllByText(/人工審核中/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已更新知識庫/).length).toBeGreaterThan(0);
  });

  it('可依審核狀態篩選回報', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /已處理\s*1/ }));

    expect(
      screen.getByRole('button', { name: '查看回報：益生菌什麼時候吃效果最好？' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '查看回報：咳嗽超過兩週需要看醫生嗎？' }),
    ).not.toBeInTheDocument();
  });

  it('點擊回報可查看完整審核結果', () => {
    renderPage();

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
    expect(screen.getAllByText(/Đang kiểm duyệt thủ công/).length).toBeGreaterThan(0);
  });
});
