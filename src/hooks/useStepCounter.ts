import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createStepDetectorStream,
  type AccelerometerSample,
  type DetectStepsOptions,
  type StepDetectorStream,
} from '../lib/stepDetector';
import { nextTaipeiMidnightEpochMs, taipeiDateOf } from '../lib/taipeiCalendar';
import { syncStepSession } from '../api/healthApi';
import type { StepCount, StepSessionSyncRequest } from '../types/health';

/**
 * 計步 hook（10.2，task-10-brief.md；行為授權：
 * openspec/changes/personal-health-tracking/specs/step-counter/spec.md 的
 * 「只在頁面可見時計步」「感測器權限與不支援的裝置」）。
 *
 * 設計成「引擎＋薄 React 包裝」：`createStepCounterEngine()` 是一般的
 * TypeScript closure，不是 hook，所有計時器／訂閱／狀態機邏輯都在裡面，
 * 只在建立時建立一次（`useRef` lazy init），生命週期跨越整個元件存活期間，
 * 不會因為每次 render 重新產生函式而需要處理 exhaustive-deps；`useStepCounter`
 * 本身只負責把引擎的狀態變化橋接成 React state。
 *
 * 依賴注入：感測器訂閱、時鐘、同步函式都能被測試替換（`src/tests/stepCounter.test.tsx`
 * 用 renderHook 搭配假的 deps 直接驗證 visibilitychange 暫停/恢復、權限拒絕、
 * 不支援裝置、跨台北時區午夜換新工作階段，不需要 monkeypatch 任何全域物件）。
 */

export type StepCounterStatus =
  | 'idle'
  | 'requesting'
  | 'counting'
  | 'paused'
  | 'denied'
  | 'unsupported';

export interface WakeLockLike {
  release: () => void | Promise<void>;
}

export interface UseStepCounterDeps {
  /** 訂閱裝置的加速度樣本；回傳取消訂閱函式。 */
  subscribeMotion: (onSample: (sample: AccelerometerSample) => void) => () => void;
  /** 這個瀏覽器/裝置是否曾經支援動作感測（存在 DeviceMotionEvent 這個 API）。
   *  這只是第一層檢查——有些裝置有這個 API 但實際上不會送出任何資料
   *  （見 `noDataTimeoutMs`）。 */
  isMotionSupported: () => boolean;
  /** iOS 13+ 需要使用者手勢觸發的權限請求。其他平台這個方法不存在時視為
   *  不需要請求，直接 'granted'。SHALL 只在使用者按下開始鈕時呼叫
   *  （step-counter spec「權限請求 SHALL 由使用者的明確操作觸發」）。 */
  requestMotionPermission: () => Promise<'granted' | 'denied'>;
  /** 目前時間（epoch 毫秒）。合理性檢查與跨日判定都靠它，注入方便測試
   *  控制「現在」而不必等真實時間流逝。 */
  now: () => number;
  /** 同步一個工作階段的累計步數，回傳該工作階段所屬日期的當日總步數。 */
  sync: (
    sessionId: string,
    body: StepSessionSyncRequest,
    options: { keepalive?: boolean },
  ) => Promise<StepCount>;
  /** 產生新工作階段的識別碼（UUID v4）。 */
  createSessionId: () => string;
  /** 請求螢幕喚醒鎖；不支援或被拒絕時回傳 null（計步仍照常進行，只是
   *  螢幕可能在使用者不操作一段時間後自動熄滅）。 */
  requestWakeLock: () => Promise<WakeLockLike | null>;
  /** 訂閱頁面可見性變化；`hidden` 為 true 代表頁面被隱藏／切到背景／鎖定。
   *  回傳取消訂閱函式。 */
  subscribeVisibility: (onChange: (hidden: boolean) => void) => () => void;
  /** 前景計步中，定期同步累計值的間隔（毫秒）。10.2 brief：30 秒。 */
  syncIntervalMs: number;
  /** 開始計步後，這麼久都沒收到任何一筆加速度樣本，視為裝置不支援
   *  （部分 Android 裝置雖然有 DeviceMotionEvent 這個 API，實際上卻不會
   *  送出任何資料，`isMotionSupported()` 這種能力檢查抓不到這種情形）。 */
  noDataTimeoutMs: number;
  /** 傳給 `detectSteps`／`createStepDetectorStream` 的參數，測試可覆寫成
   *  更容易觸發的門檻。 */
  detectorOptions?: DetectStepsOptions;
}

export interface UseStepCounterResult {
  status: StepCounterStatus;
  /** 今天的估算步數；只有在計步中／暫停中（代表今天已經開始計步過）才有
   *  數字，其餘狀態（尚未開始、請求權限中、拒絕、不支援）一律是 null——
   *  介面看到 null 不會顯示成 0 步（step-counter spec「感測器權限與不支援
   *  的裝置」：拒絕或不支援 SHALL NOT 顯示為 0 步）。 */
  todaySteps: number | null;
  /** 是否成功取得螢幕喚醒鎖（裝置/瀏覽器不支援時恆為 false，計步不受影響）。 */
  wakeLockActive: boolean;
  /** 使用者按下開始鈕時呼叫；由這裡觸發權限請求。 */
  start: () => void;
  /** 使用者主動停止計步；會先送出最後一次同步。 */
  stop: () => void;
}

function isIosMotionPermissionApi(
  value: unknown,
): value is { requestPermission: () => Promise<'granted' | 'denied' | 'default'> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestPermission' in value &&
    typeof (value as { requestPermission?: unknown }).requestPermission === 'function'
  );
}

function defaultSubscribeMotion(onSample: (sample: AccelerometerSample) => void): () => void {
  const handler = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
    onSample({ x: acc.x, y: acc.y, z: acc.z, t: Date.now() });
  };
  window.addEventListener('devicemotion', handler);
  return () => window.removeEventListener('devicemotion', handler);
}

function defaultIsMotionSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

async function defaultRequestMotionPermission(): Promise<'granted' | 'denied'> {
  const ctor = typeof window !== 'undefined' ? window.DeviceMotionEvent : undefined;
  if (!isIosMotionPermissionApi(ctor)) {
    // Android 與大多數瀏覽器不需要明確授權即可讀取 devicemotion。
    return 'granted';
  }
  try {
    const result = await ctor.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

async function defaultRequestWakeLock(): Promise<WakeLockLike | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> };
    };
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request('screen');
  } catch {
    return null;
  }
}

function defaultSubscribeVisibility(onChange: (hidden: boolean) => void): () => void {
  const handler = () => onChange(document.hidden);
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

const DEFAULT_SYNC_INTERVAL_MS = 30_000;
const DEFAULT_NO_DATA_TIMEOUT_MS = 4_000;

function resolveDeps(overrides: Partial<UseStepCounterDeps>): UseStepCounterDeps {
  return {
    subscribeMotion: overrides.subscribeMotion ?? defaultSubscribeMotion,
    isMotionSupported: overrides.isMotionSupported ?? defaultIsMotionSupported,
    requestMotionPermission: overrides.requestMotionPermission ?? defaultRequestMotionPermission,
    now: overrides.now ?? (() => Date.now()),
    sync: overrides.sync ?? syncStepSession,
    createSessionId: overrides.createSessionId ?? (() => crypto.randomUUID()),
    requestWakeLock: overrides.requestWakeLock ?? defaultRequestWakeLock,
    subscribeVisibility: overrides.subscribeVisibility ?? defaultSubscribeVisibility,
    syncIntervalMs: overrides.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
    noDataTimeoutMs: overrides.noDataTimeoutMs ?? DEFAULT_NO_DATA_TIMEOUT_MS,
    detectorOptions: overrides.detectorOptions,
  };
}

/** 「今天的步數」由兩部分算出：`total` 是最近一次同步時後端回的權威值，
 *  `sessionSteps` 是送出那次同步當下、本地 detector 的累計值。兩次同步之間
 *  畫面不能就這樣停在 `total` 不動——那樣使用者會覺得「走了但沒在動」，
 *  所以顯示值＝`total + (現在的即時累計 − 送出那次同步時的即時累計)`，
 *  隨每一筆新樣本即時前進，下一次同步回來再校正基準點。 */
export interface StepCounterBaseline {
  total: number;
  sessionSteps: number;
}

interface EngineCallbacks {
  setStatus: (status: StepCounterStatus) => void;
  setSessionSteps: (steps: number) => void;
  setBaseline: (baseline: StepCounterBaseline | null) => void;
  setWakeLockActive: (active: boolean) => void;
}

interface DepsRef {
  current: UseStepCounterDeps;
}

/**
 * 計步狀態機本體，一般的 closure，不是 hook。見檔案頂端說明。
 */
function createStepCounterEngine(depsRef: DepsRef, callbacks: EngineCallbacks) {
  let status: StepCounterStatus = 'idle';
  let sessionId: string | null = null;
  let sessionStartedAt: number | null = null;
  let sessionDate: string | null = null;
  let detector: StepDetectorStream | null = null;
  let unsubscribeMotion: (() => void) | null = null;
  let syncIntervalId: ReturnType<typeof setInterval> | null = null;
  let midnightTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let noDataTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let receivedSample = false;
  let wakeLock: WakeLockLike | null = null;
  let destroyed = false;
  // 權限請求是唯一一段「await 期間狀態可能被別的操作打斷」的地方（使用者
  // 連續按開始、或等待授權時就卸載／停止）。用世代編號取代直接比較
  // `status`：TS 沒辦法追蹤 `setStatus()`（另一個函式）對這個閉包變數的
  // 重新賦值，會把 await 之前的窄化類型一路帶到 await 之後，這裡改用一個
  // 獨立的計數器，語意更精準也不必依賴 TS 的窄化分析。
  let permissionRequestGeneration = 0;
  // 每個工作階段一個編號：`syncNow()` 的 await 期間，工作階段可能已經換掉
  // （跨午夜換新工作階段、或使用者停止又重新開始）。同步結果回來時只有
  // 「還是同一個工作階段」才能拿來更新基準點，否則舊工作階段的權威值會
  // 蓋掉新工作階段剛歸零的即時計數，算出離譜的（甚至負的）步數
  // （review：舊 session 的 `{total, sessionSteps}` 套在新 session 的即時
  // 累計上，`total + (newSessionSteps - oldSessionSteps)` 沒有防護時可能是
  // 負值）。同一顆 guard 也涵蓋 `stop()`：停止之後又重新開始，舊工作階段
  // 遲來的同步一樣不該影響新工作階段。
  let sessionToken = 0;

  function setStatus(next: StepCounterStatus) {
    status = next;
    callbacks.setStatus(next);
  }

  function clearSyncInterval() {
    if (syncIntervalId !== null) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  }

  function clearMidnightTimeout() {
    if (midnightTimeoutId !== null) {
      clearTimeout(midnightTimeoutId);
      midnightTimeoutId = null;
    }
  }

  function clearNoDataTimeout() {
    if (noDataTimeoutId !== null) {
      clearTimeout(noDataTimeoutId);
      noDataTimeoutId = null;
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        // 已經釋放過或裝置不支援釋放，忽略即可。
      }
      wakeLock = null;
    }
    callbacks.setWakeLockActive(false);
  }

  async function acquireWakeLock() {
    try {
      const lock = await depsRef.current.requestWakeLock();
      if (destroyed || status !== 'counting') {
        // 等待喚醒鎖回應期間已經暫停／停止，直接釋放，不留著。
        if (lock) void lock.release();
        return;
      }
      wakeLock = lock;
      callbacks.setWakeLockActive(lock !== null);
    } catch {
      callbacks.setWakeLockActive(false);
    }
  }

  /** 這一次同步要送出的 body：目前 session 的累計步數＋session 第一次同步時
   *  就固定下來的 started_at（後端只採用第一次的值，見 step_service.py）。 */
  async function syncNow(options: { keepalive?: boolean } = {}) {
    if (!sessionId || sessionStartedAt === null || !detector) return;
    const requestSessionId = sessionId;
    const requestToken = sessionToken;
    const body: StepSessionSyncRequest = {
      steps: detector.steps,
      started_at: new Date(sessionStartedAt).toISOString(),
    };
    try {
      const result = await depsRef.current.sync(requestSessionId, body, options);
      // 送出之後、回應回來之前，工作階段可能已經換掉（跨日、或使用者停止
      // 又重新開始）——這種情況下這次回應已經是舊工作階段的了，不能拿來
      // 更新現在這個工作階段的基準點（見上面 `sessionToken` 的說明）。
      if (destroyed || sessionToken !== requestToken) return;
      // 記下這次同步的基準點：伺服器回的權威總數，配上「送出當下」本地的
      // 即時累計值。兩次同步之間，畫面用這個基準點＋之後新增的即時步數
      // 往前推算，不會停滯在這個舊值上（見 `StepCounterBaseline` 的說明）。
      callbacks.setBaseline({ total: result.steps, sessionSteps: body.steps });
    } catch {
      // 行動網路常斷線重送；累計值仍在本地 detector 裡不會遺失，下一次
      // 30 秒週期或下次隱藏時會再試一次同步。
    }
  }

  function startNewSessionState() {
    sessionToken += 1;
    const startedAt = depsRef.current.now();
    sessionId = depsRef.current.createSessionId();
    sessionStartedAt = startedAt;
    sessionDate = taipeiDateOf(startedAt);
    detector = createStepDetectorStream(depsRef.current.detectorOptions);
    callbacks.setSessionSteps(0);
    // 新的工作階段還沒同步過，還沒有基準點：畫面直接顯示本地即時累計值
    // （從 0 開始），等第一次同步回應才校正成伺服器的權威值。
    callbacks.setBaseline(null);
  }

  /** 工作階段所屬的台北日曆日變了：先把舊工作階段做最後一次同步（步數
   *  會被後端歸給舊的那一天，因為日期只看該工作階段第一次同步時的
   *  started_at），再開新的工作階段（step-counter spec「日期歸屬」）。 */
  function maybeRollover(): boolean {
    if (!sessionDate) return false;
    const today = taipeiDateOf(depsRef.current.now());
    if (today === sessionDate) return false;
    void syncNow({ keepalive: false });
    startNewSessionState();
    return true;
  }

  function attachMotionSubscription() {
    receivedSample = false;
    clearNoDataTimeout();
    noDataTimeoutId = setTimeout(() => {
      if (!receivedSample && status === 'counting') {
        teardownActiveSession();
        setStatus('unsupported');
      }
    }, depsRef.current.noDataTimeoutMs);

    unsubscribeMotion = depsRef.current.subscribeMotion((sample) => {
      if (status !== 'counting') return; // 暫停期間忽略延遲送達的樣本
      receivedSample = true;
      clearNoDataTimeout();
      detector?.push(sample);
      callbacks.setSessionSteps(detector?.steps ?? 0);
    });
  }

  function detachMotionSubscription() {
    unsubscribeMotion?.();
    unsubscribeMotion = null;
    clearNoDataTimeout();
  }

  function scheduleSyncInterval() {
    clearSyncInterval();
    syncIntervalId = setInterval(() => {
      if (maybeRollover()) return; // 這次 tick 用來換日，下次 tick 再同步新工作階段
      void syncNow();
    }, depsRef.current.syncIntervalMs);
  }

  function scheduleMidnightTimer() {
    clearMidnightTimeout();
    const nowMs = depsRef.current.now();
    const delay = Math.max(nextTaipeiMidnightEpochMs(nowMs) - nowMs, 0);
    midnightTimeoutId = setTimeout(() => {
      if (status === 'counting') {
        maybeRollover();
      }
      if (!destroyed && status === 'counting') {
        scheduleMidnightTimer();
      }
    }, delay);
  }

  /** 停掉所有前景活動（訂閱、計時器、喚醒鎖），但不動 session 的識別碼與
   *  已累計的步數——回到前景繼續計步時（`resumeFromHidden`）不歸零
   *  （step-counter spec「回到前景」：已累計的步數 SHALL NOT 歸零）。 */
  function teardownActiveSession() {
    detachMotionSubscription();
    clearSyncInterval();
    clearMidnightTimeout();
    void releaseWakeLock();
  }

  function pauseForHidden() {
    teardownActiveSession();
    void syncNow({ keepalive: true });
    setStatus('paused');
  }

  function resumeFromHidden() {
    maybeRollover();
    attachMotionSubscription();
    scheduleSyncInterval();
    scheduleMidnightTimer();
    void acquireWakeLock();
    setStatus('counting');
  }

  async function start() {
    if (status === 'counting' || status === 'requesting') return;
    if (!depsRef.current.isMotionSupported()) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    const generation = ++permissionRequestGeneration;
    let permission: 'granted' | 'denied';
    try {
      permission = await depsRef.current.requestMotionPermission();
    } catch {
      permission = 'denied';
    }
    if (destroyed || generation !== permissionRequestGeneration) return; // 等待授權時使用者已離開或重複操作
    if (permission === 'denied') {
      setStatus('denied');
      return;
    }
    startNewSessionState();
    attachMotionSubscription();
    scheduleSyncInterval();
    scheduleMidnightTimer();
    void acquireWakeLock();
    setStatus('counting');
  }

  function stop() {
    permissionRequestGeneration++; // 作廢任何還在等待中的權限請求
    if (status !== 'counting' && status !== 'paused') return;
    teardownActiveSession();
    void syncNow({ keepalive: false });
    sessionToken += 1; // 作廢這次 syncNow 之後才會換上的新工作階段的基準點
    sessionId = null;
    sessionStartedAt = null;
    sessionDate = null;
    detector = null;
    setStatus('idle');
  }

  function handleVisibilityChange(hidden: boolean) {
    if (hidden) {
      if (status === 'counting') pauseForHidden();
    } else if (status === 'paused') {
      resumeFromHidden();
    }
  }

  function destroy() {
    destroyed = true;
    permissionRequestGeneration++; // 作廢任何還在等待中的權限請求
    teardownActiveSession();
    // 元件卸載（例如 LIFF 內 SPA 換頁）時 `document.visibilityState` 通常還是
    // visible，不會觸發 visibilitychange，`pauseForHidden` 那條「隱藏時送出
    // keepalive 同步」的路徑因此完全不會跑——如果這裡不主動補一次，卸載前
    // 已經走的步數就會靜靜地遺失，下一次開啟這個頁面又是全新的 session id，
    // 這些步數永遠不會送到後端。`syncNow` 內部已經會檢查有沒有活躍中的
    // session（沒有的話直接是 no-op），這裡不需要另外判斷狀態。
    void syncNow({ keepalive: true });
  }

  return { start, stop, handleVisibilityChange, destroy };
}

export function useStepCounter(overrides: Partial<UseStepCounterDeps> = {}): UseStepCounterResult {
  const [status, setStatus] = useState<StepCounterStatus>('idle');
  const [sessionSteps, setSessionSteps] = useState(0);
  const [baseline, setBaseline] = useState<StepCounterBaseline | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const depsRef = useRef<UseStepCounterDeps>(resolveDeps(overrides));
  useEffect(() => {
    depsRef.current = resolveDeps(overrides);
  });

  const engineRef = useRef<ReturnType<typeof createStepCounterEngine> | null>(null);

  useEffect(() => {
    // 引擎的建立與掛載可見性訂閱都放在 effect 裡（不是 render 期間），
    // 只跑一次：react-hooks 的新規則不允許在 render 期間把 ref
    // （這裡是 `depsRef`）傳進函式呼叫（可能在 render 中讀到 ref 的值）；
    // 引擎內部一律透過 depsRef 讀取最新的依賴，不需要把 overrides 放進這裡
    // 的依賴陣列。
    const engine = createStepCounterEngine(depsRef, {
      setStatus,
      setSessionSteps,
      setBaseline,
      setWakeLockActive,
    });
    engineRef.current = engine;

    const unsubscribeVisibility = depsRef.current.subscribeVisibility((hidden) => {
      engine.handleVisibilityChange(hidden);
    });
    return () => {
      unsubscribeVisibility();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const start = useCallback(() => engineRef.current?.start(), []);
  const stop = useCallback(() => engineRef.current?.stop(), []);

  const isActive = status === 'counting' || status === 'paused';
  const todaySteps = isActive
    ? (baseline ? baseline.total + (sessionSteps - baseline.sessionSteps) : sessionSteps)
    : null;

  return { status, todaySteps, wakeLockActive, start, stop };
}
