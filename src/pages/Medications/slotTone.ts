import type { MedicationSlotType } from '../../types/medication';

/**
 * 時段 → 語意色。
 *
 * 四個時段要能一眼分辨，Badge 的既有變體（default/secondary/…）沒有四種
 * 對等的色相可用，所以這裡查表指定；色票本身仍取自 tokens.css 的語意變數，
 * 不寫死色碼，深色模式跟著一起變。
 */
export const SLOT_TONE: Record<MedicationSlotType, string> = {
  morning: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  noon: 'bg-[var(--primary-soft)] text-primary',
  evening: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  bedtime: 'bg-[var(--violet-soft)] text-[var(--violet)]',
};
