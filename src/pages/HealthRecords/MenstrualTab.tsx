import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarHeartIcon, PlusIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react';

import { createMenstrualRecord, fetchMenstrualRecords } from '../../api/healthApi';
import { getPersonalHealthProfile } from '../../api/profileApi';
import type { CreateMenstrualRecordRequest } from '../../types/health';
import { queryKeys } from '@/lib/queryClient';
import { MenstrualFormDialog } from './MenstrualFormDialog';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

/**
 * 經期分頁（9.4）。只有本人性別為女性時才有內容；PERSONAL 分類、沒有代記
 * 也沒有跨使用者查詢（見 healthApi.ts 頂端的說明），因此這裡沒有 `targetUserId`
 * 參數，一律是操作者本人。
 *
 * 性別未設定（空字串／舊資料的 unknown 佔位值）時導去個人健康頁設定；
 * 性別是男性時，父層（HealthRecordsPage）根本不會渲染這個分頁的分頁鈕，
 * 這裡不需要再處理那個情形。
 */
export function MenstrualTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: profile } = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: () => getPersonalHealthProfile(),
  });

  const genderKnown = profile !== undefined;
  const gender = profile?.gender && profile.gender !== 'unknown' ? profile.gender : '';

  const recordsQuery = useQuery({
    queryKey: queryKeys.menstrualRecords(),
    queryFn: () => fetchMenstrualRecords(),
    enabled: gender === 'female',
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateMenstrualRecordRequest) => createMenstrualRecord(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.menstrualRecords() });
      toast.success(t('health.menstrual.addSuccess'));
      setAdding(false);
    },
  });

  if (!genderKnown) {
    return (
      <p className="flex items-center gap-2 py-6 text-base text-muted-foreground" role="status">
        <Spinner aria-hidden="true" />
        {t('health.loading')}
      </p>
    );
  }

  if (gender !== 'female') {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarHeartIcon />
          </EmptyMedia>
          <EmptyTitle>{t('health.menstrual.genderGateTitle')}</EmptyTitle>
          <EmptyDescription>{t('health.menstrual.genderGateDesc')}</EmptyDescription>
        </EmptyHeader>
        <Button type="button" variant="outline" className="mx-auto mt-2" render={<Link to="/personalhealth" />}>
          {t('health.menstrual.genderGateLink')}
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" className="w-full sm:w-fit" onClick={() => setAdding(true)}>
        <PlusIcon data-icon="inline-start" />
        {t('health.menstrual.addTitle')}
      </Button>

      {recordsQuery.isPending ? (
        <ItemGroup className="gap-2" aria-busy="true" aria-label={t('health.loading')}>
          {[0, 1].map((i) => (
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
      ) : recordsQuery.isError ? (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t('health.loadError')}</AlertTitle>
          </Alert>
          <Button type="button" variant="outline" onClick={() => void recordsQuery.refetch()}>
            <RotateCwIcon data-icon="inline-start" />
            {t('health.retry')}
          </Button>
        </div>
      ) : (recordsQuery.data ?? []).length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarHeartIcon />
            </EmptyMedia>
            <EmptyTitle>{t('health.menstrual.emptyTitle')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2" aria-label={t('health.menstrual.listLabel')}>
          {(recordsQuery.data ?? []).map((record) => (
            <Item key={record.id} variant="outline">
              <ItemMedia>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                  <CalendarHeartIcon className="size-5" aria-hidden="true" />
                </span>
              </ItemMedia>
              <ItemContent>
                <p className="text-base font-bold">
                  {record.start_date}
                  {record.end_date ? ` – ${record.end_date}` : ` (${t('health.menstrual.ongoing')})`}
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {record.cycle_length_days != null && (
                    <span>{t('health.menstrual.cycleLength', { days: record.cycle_length_days })}</span>
                  )}
                  {record.period_length_days != null && (
                    <span>{t('health.menstrual.periodLength', { days: record.period_length_days })}</span>
                  )}
                </p>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}

      {adding && (
        <MenstrualFormDialog
          onClose={() => setAdding(false)}
          onSubmit={async (body) => {
            await createMutation.mutateAsync(body);
          }}
        />
      )}
    </div>
  );
}
