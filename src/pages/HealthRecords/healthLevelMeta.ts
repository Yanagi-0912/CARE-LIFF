import { ArrowDownIcon, ArrowUpIcon, CircleCheckIcon, CircleHelpIcon } from 'lucide-react';
import type { HealthLevel } from '../../types/health';

/**
 * 等級的顏色＋圖示＋文字對照表，血壓／血糖／（未來的）家人卡片一律共用這一份
 * （task-8-11-dispatch-notes.md「Task 11」：「reuse the component, don't
 * duplicate」）。
 *
 * 獨立成檔案而不是跟 HealthLevelBadge 元件放一起：react-refresh 的規則要求
 * 一個檔案只匯出元件，這個常數混進去會讓那個元件的 Fast Refresh 失效。
 *
 * 等級由後端算好隨紀錄回傳，這裡只負責呈現，不重算範圍比對。
 * above_range／below_range 用同一組警示色階（`warning`），但圖示方向不同，
 * 讓「太高」與「太低」讀起來是兩件事；within_range 用 `success`；
 * no_threshold 用中性的 muted 樣式，SHALL NOT 與 within_range 同色，
 * 避免「沒設定範圍」被誤讀成「正常」。
 */
export const HEALTH_LEVEL_META: Record<
  HealthLevel,
  { labelKey: string; icon: typeof ArrowUpIcon; className: string }
> = {
  within_range: {
    labelKey: 'health.level.withinRange',
    icon: CircleCheckIcon,
    className: 'bg-success-soft text-success',
  },
  above_range: {
    labelKey: 'health.level.aboveRange',
    icon: ArrowUpIcon,
    className: 'bg-warning-soft text-warning',
  },
  below_range: {
    labelKey: 'health.level.belowRange',
    icon: ArrowDownIcon,
    className: 'bg-warning-soft text-warning',
  },
  no_threshold: {
    labelKey: 'health.level.noThreshold',
    icon: CircleHelpIcon,
    className: 'bg-surface-2 text-muted-foreground',
  },
};
