import { useTranslation } from 'react-i18next';
import { ActivityIcon } from 'lucide-react';

import type { HealthMeasurement } from '../../types/health';
import { MEAL_CONTEXT_OPTIONS } from './healthRecordForm';
import { HealthLevelBadge, NoThresholdHint } from './HealthLevelBadge';

import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface MeasurementListProps {
  records: HealthMeasurement[];
  emptyMessage: string;
  onSetThreshold: () => void;
}

/** 量測時間顯示成「MM/DD HH:mm」，長輩不需要看到秒數與時區位移 */
function formatMeasuredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 血壓／血糖紀錄列表，兩種種類共用同一組列——`kind` 決定顯示哪一組欄位。
 * 等級一律用 HealthLevelBadge 呈現後端算好的值，`no_threshold` 額外附上
 * 「去設定」的提示（task-8-11-dispatch-notes.md「Task 9」：
 * 「never styled like within_range」）。
 */
export function MeasurementList({ records, emptyMessage, onSetThreshold }: MeasurementListProps) {
  const { t } = useTranslation();

  if (records.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon />
          </EmptyMedia>
          <EmptyTitle>{t('health.list.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-2" aria-label={t('health.list.label')}>
      {records.map((record) => (
        <Item key={record.id} variant="outline">
          <ItemMedia>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
              <ActivityIcon className="size-5" aria-hidden="true" />
            </span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base">
              {record.kind === 'blood_pressure' ? (
                <span className="num font-bold">
                  {record.systolic}/{record.diastolic} <span className="text-sm font-normal text-muted-foreground">mmHg</span>
                  {record.pulse != null && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {t('health.field.pulse')} {record.pulse}
                    </span>
                  )}
                </span>
              ) : (
                <span className="num font-bold">
                  {record.glucose_mg_dl} <span className="text-sm font-normal text-muted-foreground">mg/dL</span>
                  {record.meal_context && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {t(
                        MEAL_CONTEXT_OPTIONS.find((option) => option.value === record.meal_context)
                          ?.labelKey ?? 'health.field.mealContext',
                      )}
                    </span>
                  )}
                </span>
              )}
            </ItemTitle>
            <p className="text-sm text-muted-foreground">{formatMeasuredAt(record.measured_at)}</p>
            <div className="mt-1">
              <HealthLevelBadge level={record.level} />
              {record.level === 'no_threshold' && <NoThresholdHint onSetThreshold={onSetThreshold} />}
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
