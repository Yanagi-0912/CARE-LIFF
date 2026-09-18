import { describe, expect, it } from 'vitest';
import { detectSteps, createStepDetectorStream, type AccelerometerSample } from '../lib/stepDetector';

/**
 * 10.1：`detectSteps()` 用合成的加速度序列驗證，涵蓋已知步數與靜止不計步。
 * 沒有真實裝置可用（motion-probe.html 是留給第 13 節實機測試的），這裡的
 * 序列是手算生成的合成訊號，不是真實錄製的資料。
 */

const GRAVITY = 9.8;
const SAMPLE_INTERVAL_MS = 20; // 50 Hz，devicemotion 常見取樣率的量級

/**
 * 產生模擬走路的加速度序列：三軸合力沿著正弦波在重力附近起伏，
 * 每個週期的波峰對應一步。`stepsPerSecond` 決定步頻，`amplitude`
 * 決定波峰高出重力多少（要夠高才能穿過偵測門檻）。
 */
function generateWalkingSamples(options: {
  stepCount: number;
  stepsPerSecond: number;
  amplitude: number;
  startT?: number;
}): AccelerometerSample[] {
  const { stepCount, stepsPerSecond, amplitude, startT = 0 } = options;
  const periodMs = 1000 / stepsPerSecond;
  // 波峰落在每個週期的 1/4 處（t = period/4 + k*period）；結束時間只延伸到
  // 最後一個波峰之後半個週期（仍在下降段），足夠讓演算法確認那是局部最大值，
  // 又不會延伸到下一個波峰而多算一步。
  const durationMs = (stepCount - 1) * periodMs + periodMs * 0.5;
  const samples: AccelerometerSample[] = [];
  for (let t = 0; t <= durationMs; t += SAMPLE_INTERVAL_MS) {
    const magnitude = GRAVITY + amplitude * Math.sin((2 * Math.PI * t) / periodMs);
    // 把合力全部放在 z 軸（模擬手機直立、螢幕朝向使用者時的姿勢），
    // 只要 x²+y²+z² 的平方根等於目標合力即可，偵測只看合力大小。
    samples.push({ x: 0, y: 0, z: magnitude, t: startT + t });
  }
  return samples;
}

/** 靜止時的合力等於重力加上感測器雜訊（振幅遠小於偵測門檻）。 */
function generateStillSamples(durationMs: number, noiseAmplitude = 0.15): AccelerometerSample[] {
  const samples: AccelerometerSample[] = [];
  // 用固定的虛擬雜訊序列，不用 Math.random()：純函式測試要能重現。
  let seed = 7;
  const nextNoise = () => {
    seed = (seed * 9301 + 49297) % 233280;
    const rand = seed / 233280;
    return (rand - 0.5) * 2 * noiseAmplitude;
  };
  for (let t = 0; t <= durationMs; t += SAMPLE_INTERVAL_MS) {
    samples.push({ x: 0, y: 0, z: GRAVITY + nextNoise(), t });
  }
  return samples;
}

describe('10.1 detectSteps()：合成序列驗證', () => {
  it('2 步/秒、走 10 步的序列偵測到 10 步', () => {
    const samples = generateWalkingSamples({ stepCount: 10, stepsPerSecond: 2, amplitude: 4 });
    expect(detectSteps(samples)).toBe(10);
  });

  it('1.5 步/秒（走得比較慢）、走 6 步的序列偵測到 6 步', () => {
    const samples = generateWalkingSamples({ stepCount: 6, stepsPerSecond: 1.5, amplitude: 4 });
    expect(detectSteps(samples)).toBe(6);
  });

  it('靜止時（合力約等於重力、只有微小雜訊）不計步', () => {
    const samples = generateStillSamples(5000);
    expect(detectSteps(samples)).toBe(0);
  });

  it('手機放桌上完全靜止（合力精確等於重力，零變化）也不計步', () => {
    const samples: AccelerometerSample[] = [];
    for (let t = 0; t <= 3000; t += SAMPLE_INTERVAL_MS) {
      samples.push({ x: 0, y: 0, z: GRAVITY, t });
    }
    expect(detectSteps(samples)).toBe(0);
  });

  it('振幅不足以穿過門檻的晃動（例如放在口袋裡的細微震動）不計步', () => {
    const samples = generateWalkingSamples({ stepCount: 10, stepsPerSecond: 2, amplitude: 0.5 });
    expect(detectSteps(samples)).toBe(0);
  });

  it('間隔短於最短間隔（400 毫秒）的兩個峰值只算一步', () => {
    // 三個獨立的三角波峰值，中間都有明顯的谷讓它們各自成為局部最大值。
    // 第二個距第一個 110ms（< 400ms）應被忽略；第三個距第一個 480ms 才算數。
    const samples: AccelerometerSample[] = [
      { x: 0, y: 0, z: GRAVITY, t: 0 },
      { x: 0, y: 0, z: GRAVITY + 5, t: 40 }, // 第一個峰值
      { x: 0, y: 0, z: GRAVITY, t: 80 },
      { x: 0, y: 0, z: GRAVITY, t: 120 },
      { x: 0, y: 0, z: GRAVITY + 5, t: 150 }, // 第二個峰值，距第一個 110ms
      { x: 0, y: 0, z: GRAVITY, t: 190 },
      { x: 0, y: 0, z: GRAVITY, t: 500 },
      { x: 0, y: 0, z: GRAVITY + 5, t: 520 }, // 第三個峰值，距第一個 480ms，應該算數
      { x: 0, y: 0, z: GRAVITY, t: 560 },
    ];
    expect(detectSteps(samples, { smoothing: 1 })).toBe(2);
  });

  it('最短間隔的邊界：250 毫秒不算、350 毫秒算', () => {
    const peakAt = (t: number): AccelerometerSample[] => [
      { x: 0, y: 0, z: GRAVITY, t: t - 20 },
      { x: 0, y: 0, z: GRAVITY + 5, t },
      { x: 0, y: 0, z: GRAVITY, t: t + 20 },
    ];
    // 第一步固定在 t=40；第二個波峰分別放在 290（間隔 250）與 390（間隔 350）
    expect(detectSteps([...peakAt(40), ...peakAt(290)], { smoothing: 1 })).toBe(1);
    expect(detectSteps([...peakAt(40), ...peakAt(390)], { smoothing: 1 })).toBe(2);
  });

  /**
   * 特性測試（不是迴歸測試）：一步會產生多個波峰（腳跟著地、腳尖離地、手臂
   * 擺動）。次波峰落在 350 毫秒時，現行預設（最短間隔 300 毫秒）會把它另計
   * 一步——這正是手持時多算約三成的原因，是**已知取捨**而不是 bug：同一組
   * 參數在口袋情境下最準（實走 100 步偵測 84），而口袋的晃動幅度小、不會
   * 產生這種次波峰。
   *
   * 兩種設定都斷言，把取捨釘在測試裡：日後若改用自適應門檻，這條會失敗，
   * 提醒維護者回來重新量測，而不是讓行為悄悄改變。
   */
  it('一步內的次波峰（350 毫秒後）：現行設定會另計一步，拉長間隔則不會', () => {
    const samples: AccelerometerSample[] = [];
    const STEP_PERIOD_MS = 845; // 實機量到的步頻：20 步 16.9 秒
    for (let step = 0; step < 6; step += 1) {
      const base = step * STEP_PERIOD_MS;
      samples.push({ x: 0, y: 0, z: GRAVITY, t: base });
      samples.push({ x: 0, y: 0, z: GRAVITY + 6, t: base + 40 }); // 腳跟著地
      samples.push({ x: 0, y: 0, z: GRAVITY, t: base + 200 });
      samples.push({ x: 0, y: 0, z: GRAVITY + 4, t: base + 390 }); // 腳尖離地，距主波峰 350ms
      samples.push({ x: 0, y: 0, z: GRAVITY, t: base + 450 });
    }
    expect(detectSteps(samples, { smoothing: 1 })).toBe(12);
    expect(detectSteps(samples, { smoothing: 1, minStepIntervalMs: 400 })).toBe(6);
  });

  it('少於 3 筆樣本無法判斷峰值，回傳 0', () => {
    expect(detectSteps([])).toBe(0);
    expect(detectSteps([{ x: 0, y: 0, z: GRAVITY, t: 0 }])).toBe(0);
  });

  it('自訂門檻：調高 peakDelta 後，原本算數的走路序列變成不計步', () => {
    const samples = generateWalkingSamples({ stepCount: 10, stepsPerSecond: 2, amplitude: 4 });
    expect(detectSteps(samples, { peakDelta: 20 })).toBe(0);
  });
});

describe('10.1 createStepDetectorStream()：逐點餵入與批次結果一致', () => {
  it('逐筆 push 的累計步數，等同一次餵入整段序列的 detectSteps()', () => {
    const samples = generateWalkingSamples({ stepCount: 8, stepsPerSecond: 2, amplitude: 4 });
    const batch = detectSteps(samples);

    const stream = createStepDetectorStream();
    for (const sample of samples) {
      stream.push(sample);
    }
    expect(stream.steps).toBe(batch);
  });

  it('可以分批餵入（模擬 hook 暫停後繼續餵同一個 stream），結果不變', () => {
    const samples = generateWalkingSamples({ stepCount: 8, stepsPerSecond: 2, amplitude: 4 });
    const batch = detectSteps(samples);
    const mid = Math.floor(samples.length / 2);

    const stream = createStepDetectorStream();
    for (const sample of samples.slice(0, mid)) stream.push(sample);
    for (const sample of samples.slice(mid)) stream.push(sample);
    expect(stream.steps).toBe(batch);
  });
});
