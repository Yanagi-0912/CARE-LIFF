import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LockIcon, PlusIcon, RotateCwIcon, SettingsIcon, TriangleAlertIcon } from 'lucide-react';

import { createMeasurement, fetchMeasurements } from '../../api/healthApi';
import type { CreateMeasurementRequest, MeasurementKind } from '../../types/health';
import { queryKeys } from '@/lib/queryClient';
import { MeasurementFormDialog } from './MeasurementFormDialog';
import { MeasurementList } from './MeasurementList';
import { AlertThresholdDialog } from './AlertThresholdDialog';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

interface MeasurementTabProps {
  kind: MeasurementKind;
  targetUserId?: string;
  canRead: boolean;
  canWrite: boolean;
}

/**
 * 血壓／血糖分頁的共用外殼：新增按鈕、紀錄列表、提醒範圍入口。
 * 兩個分頁只差 `kind`，欄位與文案差異都收在 MeasurementFormDialog／
 * MeasurementList 裡。
 */
export function MeasurementTab({ kind, targetUserId, canRead, canWrite }: MeasurementTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState(false);

  const measurementsKey = queryKeys.healthMeasurements(targetUserId, kind);
  const {
    data: records,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: measurementsKey,
    queryFn: () => fetchMeasurements(targetUserId, { kind }),
    enabled: canRead,
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateMeasurementRequest) => createMeasurement(body, targetUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: measurementsKey });
      toast.success(t('health.form.addSuccess'));
      setAdding(false);
    },
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

  const addLabel = kind === 'blood_pressure' ? t('health.form.addBloodPressure') : t('health.form.addBloodGlucose');
  const emptyMessage =
    kind === 'blood_pressure' ? t('health.list.emptyBloodPressure') : t('health.list.emptyBloodGlucose');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canWrite && (
          <Button type="button" className="w-full sm:w-fit" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" />
            {addLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-fit"
          onClick={() => setEditingThreshold(true)}
        >
          <SettingsIcon data-icon="inline-start" />
          {t('health.threshold.open')}
        </Button>
      </div>

      {isPending ? (
        <ItemGroup className="gap-2" aria-busy="true" aria-label={t('health.loading')}>
          {[0, 1, 2].map((i) => (
            <Item key={i} variant="outline">
              <ItemMedia>
                <Skeleton className="size-10 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : isError ? (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t('health.loadError')}</AlertTitle>
          </Alert>
          <Button
            type="button"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? null : <RotateCwIcon data-icon="inline-start" />}
            {t('health.retry')}
          </Button>
        </div>
      ) : (
        <MeasurementList
          records={records ?? []}
          emptyMessage={emptyMessage}
          onSetThreshold={() => setEditingThreshold(true)}
        />
      )}

      {adding && (
        <MeasurementFormDialog
          kind={kind}
          onClose={() => setAdding(false)}
          onSubmit={async (body) => {
            await createMutation.mutateAsync(body);
          }}
        />
      )}

      {editingThreshold && (
        <AlertThresholdDialog
          targetUserId={targetUserId}
          readOnly={!canWrite}
          onClose={() => setEditingThreshold(false)}
        />
      )}
    </div>
  );
}
