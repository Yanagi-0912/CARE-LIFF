import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as knowledgeReportsApi from '../api/knowledgeReportsApi';
import KnowledgeReportsPage from '../pages/KnowledgeReports';
import i18n from '../i18n';

vi.mock('../api/knowledgeReportsApi', async (importOriginal) => {
  // 保留真實模組的其餘匯出：KnowledgeReportRequestError 是實際類別，
  // 表單以 instanceof 判斷錯誤種類，用 stub 取代會讓錯誤分支測不到。
  // 工廠漏掉 createKnowledgeReport 會讓本檔全部測試以
  // "No export is defined on the mock" 失敗，而非只有新測試紅。
  const actual = await importOriginal<typeof knowledgeReportsApi>();
  return {
    ...actual,
    fetchKnowledgeReports: vi.fn(),
    createKnowledgeReport: vi.fn(),
  };
});

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

    // 狀態篩選是 shadcn Tabs（互斥單選），角色為 tab 而非 button
    fireEvent.click(screen.getByRole('tab', { name: /已處理\s*1/ }));

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

  const openForm = async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '我要回報' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '我要回報' }));
    await waitFor(() => {
      expect(screen.getByLabelText('資料來源網址')).toBeInTheDocument();
    });
  };

  const fillAndSubmit = (url: string, note: string) => {
    fireEvent.change(screen.getByLabelText('資料來源網址'), { target: { value: url } });
    fireEvent.change(screen.getByLabelText('說明'), { target: { value: note } });
    fireEvent.click(screen.getByRole('button', { name: '送出回報' }));
  };

  it('送出表單時 question 與 user_note 同值，網址為單一元素陣列，並重新取得列表', async () => {
    vi.mocked(knowledgeReportsApi.createKnowledgeReport).mockResolvedValue({
      report_id: 'KR-20260811-AB12',
    });
    await openForm();

    fillAndSubmit('https://www.hpa.gov.tw/page', '這頁高血壓資料已過時');

    // 只斷言第一個引數：react-query 的 mutationFn 會多帶一個 context 物件
    await waitFor(() => {
      expect(knowledgeReportsApi.createKnowledgeReport).toHaveBeenCalled();
    });
    expect(vi.mocked(knowledgeReportsApi.createKnowledgeReport).mock.calls[0][0]).toEqual({
      question: '這頁高血壓資料已過時',
      reason: 'outdated',
      user_note: '這頁高血壓資料已過時',
      user_source_urls: ['https://www.hpa.gov.tw/page'],
    });
    // 送出成功後就地更新列表，不必導頁再導回
    await waitFor(() => {
      expect(knowledgeReportsApi.fetchKnowledgeReports).toHaveBeenCalledTimes(2);
    });
  });

  it('白名單失敗時逐一列出全部被拒網址，不是只顯示第一個', async () => {
    vi.mocked(knowledgeReportsApi.createKnowledgeReport).mockRejectedValue(
      new knowledgeReportsApi.KnowledgeReportRequestError('url_not_allowed', [
        { url: 'https://www.youtube.com/a', reason: 'not_allowed' },
        { url: 'https://evil.com\\.gov.tw/b', reason: 'malformed' },
      ]),
    );
    await openForm();

    fillAndSubmit('https://www.youtube.com/a', '這頁有問題');

    await waitFor(() => {
      expect(screen.getByText('這個網址目前無法收錄')).toBeInTheDocument();
    });
    expect(screen.getByText('https://www.youtube.com/a')).toBeInTheDocument();
    expect(screen.getByText('https://evil.com\\.gov.tw/b')).toBeInTheDocument();
    // 兩種原因的補救動作不同，文案必須分開
    expect(screen.getByText(/這個網站我們不收/)).toBeInTheDocument();
    expect(screen.getByText(/網址不完整或含有不該出現的符號/)).toBeInTheDocument();
  });

  it('配額用盡時顯示帶次數的文案，並說明已送出的回報仍在審核', async () => {
    vi.mocked(knowledgeReportsApi.createKnowledgeReport).mockRejectedValue(
      new knowledgeReportsApi.KnowledgeReportRequestError('quota_exceeded', [], 10),
    );
    await openForm();

    fillAndSubmit('https://www.hpa.gov.tw/page', '這頁有問題');

    await waitFor(() => {
      expect(screen.getByText(/今天的回報次數已達上限（10 次）/)).toBeInTheDocument();
    });
    expect(screen.getByText(/已送出的回報仍在審核中/)).toBeInTheDocument();
  });

  it('詳情顯示使用者自己填的網址與說明', async () => {
    vi.mocked(knowledgeReportsApi.fetchKnowledgeReports).mockResolvedValue({
      reports: [
        {
          ...mockReports[0],
          question: '這頁過時了',
          user_note: '補充說明與問題不同',
          user_source_urls: ['https://www.hpa.gov.tw/detail'],
          source: 'manual',
        },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '查看回報：這頁過時了' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '查看回報：這頁過時了' }));

    expect(screen.getByText('我提供的網址')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://www.hpa.gov.tw/detail' }),
    ).toBeInTheDocument();
    expect(screen.getByText('我的說明')).toBeInTheDocument();
    expect(screen.getByText('補充說明與問題不同')).toBeInTheDocument();
  });

  it('question 與 user_note 相同時說明只顯示一次', async () => {
    vi.mocked(knowledgeReportsApi.fetchKnowledgeReports).mockResolvedValue({
      reports: [
        {
          ...mockReports[0],
          question: '這頁過時了',
          user_note: '這頁過時了',
          user_source_urls: ['https://www.hpa.gov.tw/detail'],
          source: 'manual',
        },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '查看回報：這頁過時了' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '查看回報：這頁過時了' }));

    expect(screen.queryByText('我的說明')).not.toBeInTheDocument();
  });
});
