/**
 * 步數偵測的純函式核心（10.1，task-10-brief.md；step-counter spec 沒有規定
 * 演算法細節，只規定行為：只在前景計步、估算揭露、最短間隔等）。
 *
 * 演算法：加速度向量長度（magnitude）→ 一階低通濾波（EMA，去除感測器雜訊，
 * 保留走路造成的起伏）→ 三點峰值偵測（前一點比左右都高，且高於門檻值才算
 * 一步）→ 最短間隔 300 毫秒（避免抖動或雜訊在同一步附近被算成兩步）。
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
  /** 判定為一步的最小合力峰值（m/s²）。靜止時合力等於重力加速度
   *  （約 9.8 m/s²，手機平放或直放都一樣，因為是三軸向量長度不是單軸）；
   *  正常走路的垂直/水平晃動會讓峰值明顯高於這個值，門檻設在兩者之間。 */
  peakThreshold?: number;
  /** 相鄰兩步的最短間隔（毫秒）。10.1 brief 指定 300 毫秒。 */
  minStepIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<DetectStepsOptions> = {
  smoothing: 0.3,
  peakThreshold: 11,
  minStepIntervalMs: 300,
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

  if (state.prevFiltered !== null && state.prevPrevFiltered !== null && state.prevSampleT !== null) {
    const isLocalPeak =
      state.prevFiltered > state.prevPrevFiltered &&
      state.prevFiltered >= filtered &&
      state.prevFiltered >= opts.peakThreshold;

    if (isLocalPeak && state.prevSampleT - state.lastStepAt >= opts.minStepIntervalMs) {
      state.stepCount += 1;
      state.lastStepAt = state.prevSampleT;
    }
  }

  state.prevPrevFiltered = state.prevFiltered;
  state.prevFiltered = filtered;
  state.prevSampleT = sample.t;
  state.filtered = filtered;
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
