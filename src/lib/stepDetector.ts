/**
 * 步數偵測的純函式核心（10.1，task-10-brief.md；step-counter spec 沒有規定
 * 演算法細節，只規定行為：只在前景計步、估算揭露、最短間隔等）。
 *
 * 演算法：加速度向量長度（magnitude）→ 一階低通濾波（EMA，去除感測器雜訊，
 * 保留走路造成的起伏）→ 追蹤一條慢速基準線（重力估計）→ 三點峰值偵測
 * （前一點比左右都高，且**高出基準線** `peakDelta` 才算一步）→ 最短間隔
 * （避免同一步的多個波峰被算成好幾步）。
 *
 * 為什麼是「高出基準」而不是固定門檻：原本的版本要求峰值超過絕對值 11
 * （假設重力 9.8）。但重力基準會因裝置與擺放而異——實機量到的靜止合力是
 * 9.825、走動中的基準是 10.049——同一個絕對值在不同手機上鬆緊並不一致。
 * 改成相對於自己的基準判斷，門檻的意義才在每台裝置上一致。
 *
 * 參數來自實機校正（Android、61 Hz、手機置於口袋、實走 20 步 16.9 秒，
 * 即每秒約 1.18 步）：走路波峰達 22–27（基準約 10），訊號強度從來不是問題，
 * 真正的誤差來源是**一步產生多個波峰**（腳跟著地、腳尖離地、手臂擺動）。
 * 原設定（平滑 0.3、最短間隔 300 毫秒）把 20 步數成 26 步；改用下列預設值
 * 後為 21 步（誤差 5%）。其餘試過的組合分別為 12、5、4、0 步，明顯過嚴。
 *
 * 這是簡化過的計步模型，不是可佩戴式裝置等級的演算法——`health.stepCounter`
 * 的 UI 文案因此必須揭露「估算值，可能與手機內建的計步器不同」
 * （step-counter spec「準確度揭露」），不是這裡要解決的準確度問題。
 *
 * 兩個進入點共用同一套逐點狀態機（`feed`），避免批次與串流兩份邏輯各自
 * 維護：
 * - `detectSteps()`：一次餵入完整序列，回傳步數。給測試與離線驗證用。
 * - `createStepDetectorStream()`：逐點餵入（每個 `devicemotion` 事件一次），
 *   O(1) 更新目前累計步數。給 `useStepCounter` 這種長時間執行的 hook 用，
 *   避免每來一個新樣本就重新掃一次全部歷史樣本（那會是 O(n²)，走路走久一點
 *   分頁就會卡頓）。
 */

/** 一筆加速度樣本；`t` 是遞增的時間戳（毫秒，epoch 或單調時鐘皆可，只要
 *  同一序列內一致）。對應 `devicemotion` 事件的
 *  `accelerationIncludingGravity`（不含重力的 `acceleration` 在多數手機上
 *  一律回傳 null，所以用含重力的版本，靜止時三軸合力約等於重力加速度）。 */
export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface DetectStepsOptions {
  /** 低通濾波的平滑係數（0–1]。越大越貼近原始訊號（雜訊多但反應快），
   *  越小越平滑（雜訊少但峰值可能被削平）。走路的步頻約 1.5–2.5 Hz，
   *  這個係數在常見的 devicemotion 取樣率（約 30–60 Hz）下大約對應
   *  3–4 Hz 截止頻率，足以保留步伐起伏、濾掉手部細微晃動的高頻雜訊。 */
  smoothing?: number;
  /** 峰值要**高出基準線**多少（m/s²）才算一步。基準線是慢速追蹤的重力估計，
   *  所以這個值與裝置的重力讀數無關（實機量到的基準是 10.049 而非 9.8）。 */
  peakDelta?: number;
  /** 基準線（重力估計）的追蹤速度（0–1]。要遠小於 `smoothing`：基準要跟得上
   *  姿勢改變（把手機從口袋拿出來），但不能快到被單一步的波峰帶著跑，否則
   *  峰值與基準一起上升，就永遠差不到 `peakDelta`。 */
  baselineSmoothing?: number;
  /** 相鄰兩步的最短間隔（毫秒）。實機校正：每步約 845 毫秒（每秒 1.18 步），
   *  300 毫秒等於容許每秒 3.3 步，同一步的第二個波峰會被算成另一步。 */
  minStepIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<DetectStepsOptions> = {
  smoothing: 0.2,
  peakDelta: 2,
  baselineSmoothing: 0.01,
  minStepIntervalMs: 400,
};

function resolveOptions(options: DetectStepsOptions): Required<DetectStepsOptions> {
  return { ...DEFAULT_OPTIONS, ...options };
}

function magnitude(sample: AccelerometerSample): number {
  return Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
}

interface StepDetectorState {
  /** 目前的低通濾波值（i 點）。 */
  filtered: number | null;
  /** 慢速基準線（重力估計）；峰值要高出它 `peakDelta` 才算一步。 */
  baseline: number | null;
  /** i-1 點的濾波值：目前正在被檢查是不是峰值的候選點。 */
  prevFiltered: number | null;
  /** i-2 點的濾波值，用來判斷候選點是否比左邊高。 */
  prevPrevFiltered: number | null;
  /** 候選點（i-1）對應的時間戳，用來套最短間隔與作為「這一步」的時間。 */
  prevSampleT: number | null;
  /** 上一次被判定為一步的時間戳；下一步至少要與它間隔 `minStepIntervalMs`。 */
  lastStepAt: number;
  /** 累計步數。 */
  stepCount: number;
}

function createDetectorState(): StepDetectorState {
  return {
    filtered: null,
    baseline: null,
    prevFiltered: null,
    prevPrevFiltered: null,
    prevSampleT: null,
    lastStepAt: -Infinity,
    stepCount: 0,
  };
}

/**
 * 餵一筆樣本進狀態機。峰值判定刻意延遲一點（檢查的是「上一個」濾波點
 * 而不是「這一個」），因為要確認一個點是局部最大值，必須同時知道它左右
 * 兩邊的值——左邊在餵入時已經知道，右邊要等下一筆樣本進來才知道。
 */
function feed(state: StepDetectorState, sample: AccelerometerSample, opts: Required<DetectStepsOptions>): void {
  const mag = magnitude(sample);
  const filtered =
    state.filtered === null ? mag : opts.smoothing * mag + (1 - opts.smoothing) * state.filtered;
  // 基準線先更新再判峰值，與 motion-probe.html 的校正版本一致，實機量到的
  // 數字才能直接套用到這裡。
  const baseline =
    state.baseline === null
      ? filtered
      : state.baseline + opts.baselineSmoothing * (filtered - state.baseline);

  if (state.prevFiltered !== null && state.prevPrevFiltered !== null && state.prevSampleT !== null) {
    const isLocalPeak =
      state.prevFiltered > state.prevPrevFiltered &&
      state.prevFiltered >= filtered &&
      state.prevFiltered - baseline > opts.peakDelta;

    if (isLocalPeak && state.prevSampleT - state.lastStepAt >= opts.minStepIntervalMs) {
      state.stepCount += 1;
      state.lastStepAt = state.prevSampleT;
    }
  }

  state.prevPrevFiltered = state.prevFiltered;
  state.prevFiltered = filtered;
  state.prevSampleT = sample.t;
  state.filtered = filtered;
  state.baseline = baseline;
}

/**
 * 對一段已知的加速度序列偵測步數（批次版）。純函式，同樣輸入永遠同樣輸出，
 * 不依賴任何全域狀態或時間，方便用合成序列驗證（10.1 驗證方式）。
 */
export function detectSteps(
  samples: readonly AccelerometerSample[],
  options: DetectStepsOptions = {},
): number {
  const opts = resolveOptions(options);
  const state = createDetectorState();
  for (const sample of samples) {
    feed(state, sample, opts);
  }
  return state.stepCount;
}

/** 逐點餵入的串流版本，供需要長時間、逐筆處理 `devicemotion` 事件的呼叫端
 *  （`useStepCounter`）使用，避免每筆樣本都重新掃過整段歷史。 */
export interface StepDetectorStream {
  /** 餵入一筆新樣本，內部狀態就地更新。 */
  push(sample: AccelerometerSample): void;
  /** 目前為止累計偵測到的步數。 */
  readonly steps: number;
}

export function createStepDetectorStream(options: DetectStepsOptions = {}): StepDetectorStream {
  const opts = resolveOptions(options);
  const state = createDetectorState();
  return {
    push(sample: AccelerometerSample) {
      feed(state, sample, opts);
    },
    get steps() {
      return state.stepCount;
    },
  };
}
