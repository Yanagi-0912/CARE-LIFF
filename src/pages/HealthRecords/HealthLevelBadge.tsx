import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { HealthLevel } from '../../types/health';
import { HEALTH_LEVEL_META } from './healthLevelMeta';

interface HealthLevelBadgeProps {
  level: HealthLevel;
  className?: string;
}

/** 血壓／血糖一筆紀錄的等級徽章：顏色＋圖示＋文字三重呈現，不能只靠顏色。 */
export function HealthLevelBadge({ level, className }: HealthLevelBadgeProps) {
  const { t } = useTranslation();
  const meta = HEALTH_LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold',
        meta.className,
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {t(meta.labelKey)}
    </span>
  );
}

/**
 * `no_threshold` 專用的提示列：說明尚未設定提醒範圍，並提供一個按鈕去設定。
 * 刻意獨立於 HealthLevelBadge 之外——徽章本身只呈現「這是什麼等級」，
 * 「去設定」是動作，兩者混在一顆按鈕裡會讓螢幕閱讀器把整段唸成按鈕文字。
 */
export function NoThresholdHint({ onSetThreshold }: { onSetThreshold: () => void }) {
  const { t } = useTranslation();
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {t('health.level.noThresholdHint')}
      <button
        type="button"
        className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline"
        onClick={onSetThreshold}
      >
        {t('health.level.noThresholdAction')}
      </button>
    </p>
  );
}
