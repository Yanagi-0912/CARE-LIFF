import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useStepCounter,
  type UseStepCounterDeps,
  type UseStepCounterResult,
} from '../hooks/useStepCounter';
import type { StepCount, StepSessionSyncRequest } from '../types/health';

/**
 * 10.2／10.3：計步 hook 與計步分頁介面。
 *
 * 兩種測試手法分開：
 * - hook 本身（visibilitychange 暫停/恢復、權限拒絕、不支援、跨台北時區
 *   午夜換新工作階段）用 `renderHook` 搭配注入的假 deps 直接驗證，不
 *   monkeypatch 任何全域物件——時鐘、感測器訂閱、同步函式都是 hook 的參數
 *   （task-10-brief.md「Note on testability」）。
 * - `StepCounterPanel` 這個 UI 元件用 `vi.mock('../hooks/useStepCounter')`
 *   替換整支 hook 回傳值，驗證介面在各種狀態下顯示的文字（同專案其他
 *   元件測試的既有慣例，例如 healthRecords.test.tsx 對 api 模組的做法）。
 */

// ── hook：注入假 deps 的測試工具 ──────────────────────────────────────────

function createTestDeps(
  overrides: Partial<UseStepCounterDeps> & { initialNow?: number } = {},
) {
  const { initialNow, now: nowOverride, ...restOverrides } = overrides;
  // `now` 特別拆出來處理：直接把呼叫端傳的 `now` 塞進 `deps` 會蓋掉下面
  // `() => currentTime`，讓 `advance()` 推進的時間跟 hook 實際讀到的「現在」
  // 脫鉤（devicemotion 的取樣時間與時鐘本來就是同一條時間軸，這裡也要維持
  // 一致）。真的要用固定時鐘的測試改傳 `initialNow`，內部一樣走可變動的
  // `currentTime`，只是先設成那個值。
  let currentTime = initialNow ?? (nowOverride ? nowOverride() : Date.parse('2026-03-10T10:00:00+08:00'));

  let motionCallback: ((sample: { x: number; y: number; z: number; t: number }) => void) | null =
    null;
  const unsubscribeMotion = vi.fn();
  const subscribeMotion = vi.fn((onSample: (sample: { x: number; y: number; z: number; t: number }) => void) => {
    motionCallback = onSample;
    return unsubscribeMotion;
  });

  let visibilityCallback: ((hidden: boolean) => void) | null = null;
  const unsubscribeVisibility = vi.fn();
  const subscribeVisibility = vi.fn((onChange: (hidden: boolean) => void) => {
    visibilityCallback = onChange;
    return unsubscribeVisibility;
  });

  let sessionCounter = 0;
  const createSessionId = vi.fn(() => `session-${++sessionCounter}`);

  const sync = vi.fn(
    async (sessionId: string, body: StepSessionSyncRequest): Promise<StepCount> => ({
      user_id: 'U-me',
      date: '2026-03-10',
      steps: body.steps,
    }),
  );

  const releaseWakeLock = vi.fn();
  const requestWakeLock = vi.fn(async () => ({ release: releaseWakeLock }));

  const deps: Partial<UseStepCounterDeps> = {
    subscribeMotion,
    isMotionSupported: vi.fn(() => true),
    requestMotionPermission: vi.fn(async () => 'granted' as const),
    now: () => currentTime,
    sync,
    createSessionId,
    requestWakeLock,
    subscribeVisibility,
    syncIntervalMs: 30_000,
    noDataTimeoutMs: 5_000,
    ...restOverrides,
  };

  return {
    deps,
    sync,
    createSessionId,
    unsubscribeMotion,
    unsubscribeVisibility,
    requestWakeLock,
    releaseWakeLock,
    emitSample: (sample: { x: number; y: number; z: number; t: number }) => {
      motionCallback?.(sample);
    },
    emitVisibility: (hidden: boolean) => {
      visibilityCallback?.(hidden);
    },
    hasMotionSubscriber: () => motionCallback !== null,
    /** 讓「現在」與 fake timer 的時鐘一起前進——真實裝置上兩者本來就是同一
     *  個時鐘，測試裡分開注入的話要自己保持同步，不然 `now()` 回傳的還是
     *  舊時間，跨日判定永遠不會觸發。 */
    advance: async (ms: number) => {
      currentTime += ms;
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

/** 一筆明顯高於偵測門檻的加速度樣本（合力遠高於重力），用來在測試裡快速
 *  製造「這是一步」的效果，不需要真的合成一整段走路序列
 *  （序列層級的偵測準確度已經在 stepDetector.test.ts 驗證過）。 */
function peakSample(t: number): { x: number; y: number; z: number; t: number } {
  return { x: 0, y: 0, z: 20, t };
}
function troughSample(t: number): { x: number; y: number; z: number; t: number } {
  return { x: 0, y: 0, z: 9.8, t };
}

async function walkOneStep(
  harness: ReturnType<typeof createTestDeps>,
  baseT: number,
): Promise<void> {
  harness.emitSample(troughSample(baseT));
  harness.emitSample(peakSample(baseT + 20));
  harness.emitSample(troughSample(baseT + 40));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('10.2 useStepCounter：權限與裝置支援', () => {
  it('裝置不支援時，start() 直接進入 unsupported，不會呼叫權限請求', async () => {
    const harness = createTestDeps({ isMotionSupported: vi.fn(() => false) });
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('unsupported');
    expect(result.current.todaySteps).toBeNull();
    expect(harness.deps.requestMotionPermission).not.toHaveBeenCalled();
  });

  it('使用者拒絕權限時進入 denied，不顯示任何步數', async () => {
    const harness = createTestDeps({ requestMotionPermission: vi.fn(async () => 'denied' as const) });
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.todaySteps).toBeNull();
  });

  it('支援 API 存在，但開始後一直沒有任何感測資料送達，逾時視為不支援', async () => {
    const harness = createTestDeps({ noDataTimeoutMs: 5_000 });
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('counting');

    await act(async () => {
      await harness.advance(5_001);
    });

    expect(result.current.status).toBe('unsupported');
    expect(result.current.todaySteps).toBeNull();
  });

  it('權限通過且持續收到樣本時正常計步，步數不是 0（有實際的動作樣本）', async () => {
    const harness = createTestDeps();
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await walkOneStep(harness, 1000);
    });

    expect(result.current.status).toBe('counting');
    expect(result.current.todaySteps).toBe(1);
  });
});

describe('10.2 useStepCounter：頁面隱藏時暫停，回到前景繼續', () => {
  it('隱藏時暫停並以 keepalive 同步；回到前景繼續，累計步數不歸零', async () => {
    const harness = createTestDeps();
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await walkOneStep(harness, 1000);
      await walkOneStep(harness, 2000);
    });
    expect(result.current.todaySteps).toBe(2);

    // 切到背景：暫停、送出一次 keepalive 同步。
    await act(async () => {
      harness.emitVisibility(true);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('paused');
    expect(harness.unsubscribeMotion).toHaveBeenCalled();
    const keepaliveCall = harness.sync.mock.calls.at(-1);
    expect(keepaliveCall?.[2]).toEqual({ keepalive: true });
    expect(keepaliveCall?.[1].steps).toBe(2);

    // 暫停期間送達的樣本（例如延遲的事件）不應該被計入。
    await act(async () => {
      harness.emitSample(peakSample(3000));
    });
    expect(result.current.todaySteps).toBe(2);

    // 回到前景：繼續計步，之前的 2 步還在，不會歸零。
    const subscribeCallsBeforeResume = (harness.deps.subscribeMotion as ReturnType<typeof vi.fn>).mock
      .calls.length;
    await act(async () => {
      harness.emitVisibility(false);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('counting');
    expect(result.current.todaySteps).toBe(2);
    expect((harness.deps.subscribeMotion as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      subscribeCallsBeforeResume,
    );

    // 前景繼續計步：新的樣本會被算進去。
    await act(async () => {
      await walkOneStep(harness, 4000);
    });
    expect(result.current.todaySteps).toBe(3);
  });

  it('介面 SHALL NOT 宣稱背景計步：暫停後在沒有恢復前景之前，樣本不會被計入', async () => {
    const harness = createTestDeps();
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      harness.emitVisibility(true);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('paused');

    await act(async () => {
      await walkOneStep(harness, 5000);
      await walkOneStep(harness, 6000);
    });
    // 還是暫停狀態，不會偷偷在背景累計。
    expect(result.current.status).toBe('paused');
  });
});

describe('10.2 useStepCounter：跨台北時區午夜換新工作階段', () => {
  it('計步跨過台北午夜時，前端開始新的工作階段，並把舊工作階段做最後一次同步', async () => {
    // 2026-03-10 23:59:50（台北時間）開始計步，10 秒後跨過午夜。
    const startTime = Date.parse('2026-03-10T23:59:50+08:00');
    const harness = createTestDeps({ initialNow: startTime });
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await walkOneStep(harness, startTime); // 午夜前的這一步應歸屬前一天
    });
    expect(result.current.todaySteps).toBe(1);
    expect(harness.createSessionId).toHaveBeenCalledTimes(1);
    const oldSessionId = harness.createSessionId.mock.results[0]?.value as string;

    // 推進到剛過午夜。
    await act(async () => {
      await harness.advance(11_000);
    });

    expect(result.current.status).toBe('counting');
    // 新工作階段已經開始：id 換了、步數歸零重新算。
    expect(harness.createSessionId).toHaveBeenCalledTimes(2);
    expect(result.current.todaySteps).toBe(0);

    // 舊工作階段有被送出最後一次同步，且用的是舊的 session id。
    const oldSessionFinalSync = harness.sync.mock.calls.find(
      (call) => call[0] === oldSessionId && call[1].steps === 1,
    );
    expect(oldSessionFinalSync).toBeDefined();

    // 跨日之後走的新的一步，會算進新的工作階段（新工作階段的 id 與舊的不同）。
    const newSessionId = harness.createSessionId.mock.results[1]?.value as string;
    expect(newSessionId).not.toBe(oldSessionId);

    await act(async () => {
      await walkOneStep(harness, startTime + 12_000);
    });
    expect(result.current.todaySteps).toBe(1);

    // 停止計步，確認這次同步用的是新的 session id，且步數是新工作階段自己的
    // 累計（1），不是把舊工作階段的步數也算進來。
    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });
    const finalSync = harness.sync.mock.calls.at(-1);
    expect(finalSync?.[0]).toBe(newSessionId);
    expect(finalSync?.[1].steps).toBe(1);
  });
});

describe('10.2 useStepCounter：每 30 秒定期同步', () => {
  it('計步中每 30 秒同步一次目前累計的步數', async () => {
    const harness = createTestDeps({ syncIntervalMs: 30_000 });
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await walkOneStep(harness, 1000);
    });
    const syncCallsBefore = harness.sync.mock.calls.length;

    await act(async () => {
      await harness.advance(30_000);
    });

    expect(harness.sync.mock.calls.length).toBeGreaterThan(syncCallsBefore);
    const lastCall = harness.sync.mock.calls.at(-1);
    expect(lastCall?.[1].steps).toBe(1);
    expect(lastCall?.[2]).toEqual({ keepalive: undefined });
  });
});

describe('10.2 useStepCounter：停止計步', () => {
  it('stop() 送出最後一次同步並回到 idle', async () => {
    const harness = createTestDeps();
    const { result } = renderHook(() => useStepCounter(harness.deps));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await walkOneStep(harness, 1000);
    });

    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.todaySteps).toBeNull();
    expect(harness.releaseWakeLock).toHaveBeenCalled();
  });
});

// ── StepCounterView：UI 狀態（純呈現元件，直接餵 props，不必 mock hook） ──

describe('10.3 StepCounterView：介面狀態', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    const i18n = (await import('../i18n')).default;
    await i18n.changeLanguage('zh-TW');
  });

  async function renderView(result: UseStepCounterResult) {
    const { StepCounterView } = await import('../pages/HealthRecords/StepCounterPanel');
    return render(<StepCounterView {...result} />);
  }

  it('估算說明與「只在前景計步」的說明恆常顯示（即使還沒開始）', async () => {
    await renderView({
      status: 'idle',
      todaySteps: null,
      wakeLockActive: false,
      start: vi.fn(),
      stop: vi.fn(),
    });

    expect(screen.getByText('步數為估算值，可能與手機內建的計步器不同。')).toBeInTheDocument();
    expect(screen.getByText(/只在這個頁面開啟並顯示在最前面時才會計步/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開始計步' })).toBeInTheDocument();
  });

  it('計步中：顯示今日步數，不是 0（有實際走的步數）', async () => {
    await renderView({
      status: 'counting',
      todaySteps: 42,
      wakeLockActive: true,
      start: vi.fn(),
      stop: vi.fn(),
    });

    expect(screen.getByText('42 步')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止計步' })).toBeInTheDocument();
  });

  it('拒絕權限：顯示原因與重新允許的說明，不出現任何步數（包含 0 步）', async () => {
    await renderView({
      status: 'denied',
      todaySteps: null,
      wakeLockActive: false,
      start: vi.fn(),
      stop: vi.fn(),
    });

    expect(screen.getByText('沒有動作感測權限')).toBeInTheDocument();
    expect(screen.getByText(/重新允許/)).toBeInTheDocument();
    expect(screen.queryByText(/^0 步$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ 步$/)).not.toBeInTheDocument();
  });

  it('裝置不支援：顯示原因，不出現任何步數，也不顯示開始鈕', async () => {
    await renderView({
      status: 'unsupported',
      todaySteps: null,
      wakeLockActive: false,
      start: vi.fn(),
      stop: vi.fn(),
    });

    expect(screen.getByText('這個裝置無法計步')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ 步$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '開始計步' })).not.toBeInTheDocument();
  });

  it('請求權限中：開始鈕停用並顯示請求中的文字', async () => {
    await renderView({
      status: 'requesting',
      todaySteps: null,
      wakeLockActive: false,
      start: vi.fn(),
      stop: vi.fn(),
    });

    const button = screen.getByRole('button', { name: '請求權限中…' });
    expect(button).toBeDisabled();
  });
});
