import {
  DEFAULT_SLOT_TIMES,
  SLOT_TYPES,
  type MedicationReminder,
  type MedicationSlotType,
} from '../../types/medication';

/**
 * 判斷一筆提醒規則「現在」是不是排程器真的會挑中的那種：啟用中，且今天
 * 落在 start_date～end_date 區間內（end_date 為 null 代表長期，不限）。
 * 邏輯對齊後端 `MedicationReminderRepository._is_schedulable`。
 *
 * 僅用於藥袋核對畫面「送出後會重新開啟哪些時段」的提示——這是提前揭露
 * 用的估算，不是排程權威判定。權威判定永遠在後端（find_or_create_reminder
 * 的 reactivated 回傳值），這裡算錯最多只是提示文字不準或漏提示，不會
 * 影響實際寫入哪些資料。
 */
export function isReminderSchedulable(reminder: MedicationReminder, today: string): boolean {
  if (!reminder.enabled) return false;
  if (reminder.start_date && reminder.start_date > today) return false;
  if (reminder.end_date && reminder.end_date < today) return false;
  return true;
}

/** "HH:MM" -> 當日的分鐘數。呼叫端須先確認格式合法。 */
function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * 一天是環狀的：23:50 與 00:10 相差 20 分鐘，不是 1420 分鐘。少了這一步，
 * 深夜的時間會被判成離「早」最遠，而不是離「睡前」最近。
 */
function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 24 * 60 - raw);
}

/**
 * 這個時刻最像哪一個時段：取離該時段**預設時間**最近的那個。
 *
 * 刻意不定義「早上是 05:00–10:59」這類區間——那些界線在這個專案裡沒有任何
 * 依據，會是憑空生出來的常數；而每個時段的預設時間（08:00／12:00／18:00／
 * 21:30）是後端既有的定義，最近鄰完全由它推導，不引入新的魔術數字。
 *
 * 等距時取 `SLOT_TYPES` 中較前者（例如 10:00 距「早」與「中」皆為 120 分鐘，
 * 判為「早」）。這是任意但確定的選擇：使用者看得到結果，也隨時可以自己改
 * 時段，重要的是同一個時間永遠得到同一個答案。
 */
export function nearestSlot(time: string): MedicationSlotType {
  const minutes = toMinutes(time);
  return SLOT_TYPES.reduce((best, slot) =>
    circularDistance(minutes, toMinutes(DEFAULT_SLOT_TIMES[slot])) <
    circularDistance(minutes, toMinutes(DEFAULT_SLOT_TIMES[best]))
      ? slot
      : best,
  );
}
