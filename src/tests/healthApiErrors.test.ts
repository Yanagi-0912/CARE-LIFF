import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMeasurement } from '../api/healthApi';

/**
 * healthApi 的 parseError 對 422 detail 陣列的處理。
 *
 * 這個 change 最常撞到的三個跨欄位驗證（收縮壓須大於舒張壓、提醒範圍上限須
 * 大於下限、經期天數不得超過上限）都是 Pydantic model_validator 裡
 * `raise ValueError(...)`，FastAPI 沒有自訂例外處理器時會把它包成
 * `{"detail": [{"msg": "Value error, ...", ...}]}`——是陣列，不是字串。
 * 原樣顯示會是一串 JSON，對長輩使用者沒有意義，因此獨立測 parseError
 * 有沒有把它轉成一句可讀的話。
 *
 * 直接呼叫真正的 API function（不 mock 整個模組），改用 stub globalThis.fetch
 * 模擬後端回應——同 knowledgeReportsApiErrors.test.ts 的理由。
 */
describe('healthApi 的 parseError（422 detail 陣列訊息萃取）', () => {
  beforeEach(() => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'test-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U-test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const stubFetchOnce = (status: number, body: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => body,
      } as Response),
    );
  };

  /** 取得 createMeasurement 實際拋出的 Error，並斷言 message 與 status。 */
  const rejection = async (): Promise<Error & { status: number }> => {
    try {
      await createMeasurement({ systolic: 90, diastolic: 120 });
      throw new Error('預期呼叫失敗，但實際成功了');
    } catch (err) {
      return err as Error & { status: number };
    }
  };

  it('detail 是含單一項目的陣列時，顯示去掉「Value error, 」前綴後的訊息', async () => {
    stubFetchOnce(422, {
      detail: [
        {
          type: 'value_error',
          loc: ['body', 'CreateBloodPressureRequest'],
          msg: 'Value error, 收縮壓必須大於舒張壓',
          input: {},
        },
      ],
    });

    const err = await rejection();
    expect(err.message).toBe('收縮壓必須大於舒張壓');
    expect(err.status).toBe(422);
  });

  it('detail 是含多個項目的陣列時，每一項都要讀得到', async () => {
    stubFetchOnce(422, {
      detail: [
        { msg: 'Value error, 收縮壓必須大於舒張壓' },
        { msg: 'Value error, systolic_high 必須大於 systolic_low' },
      ],
    });

    const err = await rejection();
    expect(err.message).toBe('收縮壓必須大於舒張壓；systolic_high 必須大於 systolic_low');
    expect(err.status).toBe(422);
  });

  it('detail 是字串（經期／步數的自訂 403）時維持原樣顯示，不受陣列處理影響', async () => {
    stubFetchOnce(403, { detail: '經期紀錄僅限本人查看與異動。' });

    const err = await rejection();
    expect(err.message).toBe('經期紀錄僅限本人查看與異動。');
    expect(err.status).toBe(403);
  });

  it('detail 陣列裡取不到任何可讀 msg 時，退回既有的通用失敗訊息，不硬湊 JSON', async () => {
    stubFetchOnce(422, { detail: [{ type: 'value_error' }] });

    const err = await rejection();
    expect(err.message).toBe('API 請求失敗：422');
    expect(err.status).toBe(422);
  });

  it('沒有 detail 也沒有 message 時，退回既有的通用失敗訊息', async () => {
    stubFetchOnce(422, {});

    const err = await rejection();
    expect(err.message).toBe('API 請求失敗：422');
    expect(err.status).toBe(422);
  });
});
