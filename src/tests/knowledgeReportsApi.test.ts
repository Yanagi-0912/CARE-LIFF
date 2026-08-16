import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeReport,
  KnowledgeReportRequestError,
} from '../api/knowledgeReportsApi';

const originalFetch = global.fetch;

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('createKnowledgeReport', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it('回傳建立成功的回報編號', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(200, { report_id: 'KR-20260811-AB12' }));

    const result = await createKnowledgeReport({
      question: '這頁過時了',
      reason: 'outdated',
      user_note: '這頁過時了',
      user_source_urls: ['https://www.hpa.gov.tw/x'],
    });

    expect(result.report_id).toBe('KR-20260811-AB12');
  });

  it('把 400 的結構化 detail 解析成帶 code 與逐筆網址的錯誤', async () => {
    // 現行 parseError 會把物件 JSON.stringify 成一坨字串顯示給使用者，
    // 對長輩而言完全不可讀。建立端點必須走結構化路徑。
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(400, {
        detail: {
          code: 'url_not_allowed',
          invalid_urls: [
            { url: 'https://www.youtube.com/a', reason: 'not_allowed' },
            { url: 'https://evil.com\\.gov.tw/b', reason: 'malformed' },
          ],
          message: '以下 2 個網址未通過來源白名單，請檢查後重新送出。',
        },
      }),
    );

    await expect(
      createKnowledgeReport({
        question: 'x',
        reason: 'other',
        user_note: 'x',
        user_source_urls: ['https://www.youtube.com/a', 'https://evil.com\\.gov.tw/b'],
      }),
    ).rejects.toMatchObject({
      code: 'url_not_allowed',
      invalidUrls: [
        { url: 'https://www.youtube.com/a', reason: 'not_allowed' },
        { url: 'https://evil.com\\.gov.tw/b', reason: 'malformed' },
      ],
    });
  });

  it('把 429 解析成帶 limit 的配額錯誤', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(429, { detail: { code: 'quota_exceeded', limit: 10 } }),
    );

    await expect(
      createKnowledgeReport({
        question: 'x',
        reason: 'other',
        user_note: 'x',
        user_source_urls: ['https://www.hpa.gov.tw/x'],
      }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', limit: 10 });
  });

  it('無法辨識的錯誤退回 generic，不把原始內容丟給使用者', async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(500, { detail: 'Internal Server Error' }));

    const error = await createKnowledgeReport({
      question: 'x',
      reason: 'other',
      user_note: 'x',
      user_source_urls: ['https://www.hpa.gov.tw/x'],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(KnowledgeReportRequestError);
    expect(error.code).toBe('generic');
  });
});
