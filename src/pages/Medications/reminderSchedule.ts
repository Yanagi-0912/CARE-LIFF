import type { MedicationReminder } from '../../types/medication';

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
