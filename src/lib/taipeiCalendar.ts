/**
 * 台北日曆日的換算，供計步的「跨午夜換新工作階段」使用
 * （step-counter spec「日期歸屬」；後端 `app/models/health.py` 的
 * `TAIPEI_TZ = ZoneInfo("Asia/Taipei")`）。
 *
 * 台灣不實施日光節約時間，`Asia/Taipei` 對 UTC 永遠是固定 +8，因此這裡用
 * 固定位移直接算，不透過 `Intl.DateTimeFormat`——避免依賴執行環境的 ICU
 * 時區資料是否完整（部分精簡版 Node/瀏覽器建置可能缺時區資料庫），也讓
 * 測試不必假設環境時區設定。
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** epoch 毫秒 → 台北日曆日（YYYY-MM-DD）。 */
export function taipeiDateOf(epochMs: number): string {
  const taipeiMs = epochMs + TAIPEI_OFFSET_MS;
  const d = new Date(taipeiMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 下一個台北時區午夜（00:00）對應的 epoch 毫秒；剛好是午夜時回傳下一天的午夜
 *  （用來排程「從現在算起，多久後跨日」的計時器，不會排出 0 或負的延遲）。 */
export function nextTaipeiMidnightEpochMs(epochMs: number): number {
  const taipeiMs = epochMs + TAIPEI_OFFSET_MS;
  const msIntoDay = ((taipeiMs % DAY_MS) + DAY_MS) % DAY_MS;
  const msUntilMidnight = DAY_MS - msIntoDay || DAY_MS;
  return epochMs + msUntilMidnight;
}
