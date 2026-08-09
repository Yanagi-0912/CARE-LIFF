import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approveKnowledgeReport } from '../api/knowledgeReportsApi';

/**
 * 為什麼另開這個測試檔（偏離 tasks.md 8.2 指定的 adminKnowledgeReports.test.tsx）：
 *
 * adminKnowledgeReports.test.tsx 在檔頭用
 * `vi.mock('../api/knowledgeReportsApi', ...)` 把整個模組換成假的，
 * approveKnowledgeReport 永遠是 vi.fn()，真正的實作（含 parseError）
 * 完全不會被執行到。要測 parseError 對「detail 是物件 vs 字串 vs null」的
 * 判斷邏輯，必須繞過那個 mock、直接呼叫真正的 API function，
 * 所以另開一個不 mock 該模組的測試檔，改用 stub globalThis.fetch
 * 來模擬後端回應。
 */
describe('knowledgeReportsApi 的 parseError（approveKnowledgeReport 400 錯誤處理）', () => {
  beforeEach(() => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const stubFetchOnce = (body: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => body,
      } as Response),
    );
  };

  /**
   * 取得 approveKnowledgeReport 實際拋出的 Error，並斷言 message 完全相等。
   *
   * 注意：不能用 `.rejects.toThrow(str)`——那是子字串比對，
   * 而「detail 是物件含 message」這個案例的錯誤 JSON 裡剛好完整包含
   * 那句中文 message 當作某個欄位的值，用子字串比對即使 bug 沒修也會
   * 誤判通過（假綠燈），沒辦法真的驗證「不是整坨 JSON」。
   */
  const rejectionMessage = async (reportId: string): Promise<string> => {
    try {
      await approveKnowledgeReport(reportId);
      throw new Error('預期呼叫失敗，但實際成功了');
    } catch (err) {
      return (err as Error).message;
    }
  };

  it('detail 是含字串 message 的物件時，顯示該 message 而非 JSON', async () => {
    stubFetchOnce({
      detail: {
        code: 'url_not_allowed',
        invalid_urls: [
          { url: 'https://evil.com/', reason: 'not_allowed' },
          { url: 'ht!tp://x', reason: 'malformed' },
        ],
        message: '以下 2 個網址未通過來源白名單，請檢查後重新送出。',
      },
    });

    expect(await rejectionMessage('KR-2025-001')).toBe(
      '以下 2 個網址未通過來源白名單，請檢查後重新送出。',
    );
  });

  it('detail 是純字串（舊形狀）時，維持向後相容直接顯示原字串', async () => {
    stubFetchOnce({ detail: 'URL not in whitelist: x' });

    expect(await rejectionMessage('KR-2025-001')).toBe('URL not in whitelist: x');
  });

  it('detail 是物件但沒有字串 message 時，退回 JSON.stringify 後備', async () => {
    stubFetchOnce({ detail: { code: 'x' } });

    expect(await rejectionMessage('KR-2025-001')).toBe(JSON.stringify({ code: 'x' }));
  });

  it('detail 是陣列時，退回 JSON.stringify 後備（不是字串 message，也不該原樣塞給使用者）', async () => {
    stubFetchOnce({ detail: ['a', 'b'] });

    expect(await rejectionMessage('KR-2025-001')).toBe(JSON.stringify(['a', 'b']));
  });

  it('detail 為 null 但有 data.message 時，走既有的 data.message 分支', async () => {
    stubFetchOnce({ detail: null, message: '伺服器發生錯誤' });

    expect(await rejectionMessage('KR-2025-001')).toBe('伺服器發生錯誤');
  });

  it('沒有 detail 但有 data.message 時，走既有的 data.message 分支', async () => {
    stubFetchOnce({ message: '伺服器發生錯誤' });

    expect(await rejectionMessage('KR-2025-001')).toBe('伺服器發生錯誤');
  });
});
