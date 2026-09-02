import type { BusinessStatus } from '../../types/medical';

/**
 * 營業狀態 → 色調。
 *
 * 只用 tokens.css 已有的四個語意色，不新增顏色：
 * - open        → success（綠）
 * - 尚未開診／午休／請電洽 → warning（琥珀）。這三者的共同點是「今天還有機會」，
 *   與紅色的「今天沒了」必須分開；使用者的下一步不同（再等等 vs 改天再來）。
 * - 今日已結束／今日休診 → danger（紅）
 * - unknown     → muted（灰）。「不知道」不可用紅色，那會被讀成「沒開」。
 *
 * 設有急診不在這張表裡：它是能力標示而非營業狀態，由 FacilityCard 另外用
 * violet（莓紫）獨立一列呈現。LINE 那側用藍色，這裡刻意不跟——tokens.css 的
 * 註解已載明本色票避開藍紫色域（tritan 缺陷最先喪失的區域），莓紫是同一份
 * 設計裡為了「保留紫的語意但辨識可靠」而選的替代色。
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'muted';

export const STATUS_TONE: Record<BusinessStatus, StatusTone> = {
  open: 'success',
  before_open: 'warning',
  break: 'warning',
  call_ahead: 'warning',
  closed_today: 'danger',
  closed_day: 'danger',
  emergency: 'muted',
  unknown: 'muted',
};

/** 色調 → CSS 變數。用 var() 而非 Tailwind 類名，才能同時吃到淺色與深色主題。 */
export const TONE_COLOR: Record<StatusTone, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
};

export const EMERGENCY_COLOR = 'var(--violet)';

export const STATUS_LABEL_KEY: Record<BusinessStatus, string> = {
  open: 'nearby.status.open',
  before_open: 'nearby.status.beforeOpen',
  break: 'nearby.status.break',
  closed_today: 'nearby.status.closedToday',
  closed_day: 'nearby.status.closedDay',
  emergency: 'nearby.status.emergency',
  call_ahead: 'nearby.status.callAhead',
  unknown: 'nearby.status.unknown',
};

/**
 * 只有這些狀態要顯示下次開診時間。
 *
 * 營業中不需要；請電洽與無資料本就沒有可靠時段可講——對後兩者顯示一個時間，
 * 等於用一個我們並不確定的數字取代「請先問」這個正確建議。與後端
 * `_STATUSES_WITH_NEXT_OPEN` 對齊。
 */
export const STATUSES_WITH_NEXT_OPEN: ReadonlySet<BusinessStatus> = new Set<BusinessStatus>(
  ['before_open', 'break', 'closed_today', 'closed_day'],
);

export function shouldShowNextOpen(status: BusinessStatus): boolean {
  return STATUSES_WITH_NEXT_OPEN.has(status);
}
