import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FootprintsIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';

import { fetchStepCounts } from '../../api/healthApi';
import { queryKeys } from '@/lib/queryClient';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

interface StepsTabProps {
  targetUserId?: string;
  canRead: boolean;
  /** 只有看自己時才會出現「開始計步」的操作區——步數只能來自本人手機的感測器。 */
  isSelf: boolean;
}

/**
 * 步數分頁（9.1 的第四個分頁）。這裡只負責歷史每日步數的**唯讀**列表；
 * 「開始計步」的感測器讀取、工作階段同步、Wake Lock 等即時計步 UI 是
 * Task 10 的範圍（task-8-11-dispatch-notes.md「Task 10」），故意留白、
 * 不在這裡實作，避免與 Task 10 的檔案（`src/hooks/useStepCounter.ts` 等）
 * 重疊或衝突。`data-testid="steps-counter-slot"` 是留給那段 UI 掛載的位置。
 */
export function StepsTab({ targetUserId, canRead, isSelf }: StepsTabProps) {
  const { t } = useTranslation();

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.stepCounts(targetUserId),
    queryFn: () => fetchStepCounts(targetUserId),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('familyPermission.noSensitive')}</EmptyTitle>
          <EmptyDescription>{t('familyPermission.askOwner')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isSelf && (
        // Task 10 掛載即時計步 UI（開始／停止、目前累計、Wake Lock 狀態、
        // 使用者需求同意提示與估算揭露）的位置。這裡不放任何字串或行為，
        // 避免與那段 UI 的 i18n key／互動邏輯衝突。
        <div data-testid="steps-counter-slot" />
      )}

      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('health.steps.historyTitle')}
      </p>

      {isPending ? (
        <ItemGroup className="gap-2" aria-busy="true" aria-label={t('health.loading')}>
          {[0, 1, 2].map((i) => (
            <Item key={i} variant="outline">
              <ItemMedia>
                <Skeleton className="size-10 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-24" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : isError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t('health.loadError')}</AlertTitle>
        </Alert>
      ) : (data ?? []).length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FootprintsIcon />
            </EmptyMedia>
            <EmptyTitle>{t('health.steps.emptyTitle')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2" aria-label={t('health.steps.historyTitle')}>
          {(data ?? []).map((entry) => (
            <Item key={entry.date} variant="outline">
              <ItemMedia>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                  <FootprintsIcon className="size-5" aria-hidden="true" />
                </span>
              </ItemMedia>
              <ItemContent>
                <p className="text-base font-bold">{entry.date}</p>
                <p className="num text-sm text-muted-foreground">
                  {t('health.steps.stepsValue', { count: entry.steps })}
                </p>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
