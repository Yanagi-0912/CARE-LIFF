import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  TimerOffIcon,
} from 'lucide-react';
import { fetchLostSession, LostApiError, markLostFound } from '../../api/lostApi';
import type { LostSessionView } from '../../types/lost';
import { queryKeys } from '@/lib/queryClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatElapsed, googleMapsDirectionsUrl, useNow } from './shared';

// Leaflet 壓縮後約 44 KB，只有這一頁用得到，跟著頁面一起延遲載入還不夠：地圖在收到第一個
// 位置之前不會出現，再切一次讓等待中的畫面先出來。
const LostMap = lazy(() => import('./LostMap'));

/**
 * 輪詢間隔。長輩端每 20 秒上傳一次，15 秒輪詢一次最多晚 15 秒看到新位置；
 * 更密沒有新資料可拿，只是多打 API。
 */
const POLL_INTERVAL_MS = 15_000;

const BIG_BUTTON = 'h-auto min-h-12 whitespace-normal py-3 text-base';

function StatusLine({ view, stale }: { view: LostSessionView; stale: boolean }) {
  const { t } = useTranslation();
  if (view.status === 'active' && stale) {
    return (
      <p className="flex items-center gap-2 text-lg font-semibold text-warning">
        <AlertTriangleIcon className="size-6 shrink-0" aria-hidden="true" />
        {t('lost.watch.statusStale')}
      </p>
    );
  }
  if (view.status === 'active') {
    return (
      <p className="flex items-center gap-2 text-lg font-semibold text-primary">
        <MapPinIcon className="size-6 shrink-0" aria-hidden="true" />
        {t('lost.watch.statusActive')}
      </p>
    );
  }
  if (view.status === 'expired') {
    return (
      <p className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
        <TimerOffIcon className="size-6 shrink-0" aria-hidden="true" />
        {t('lost.watch.statusExpired')}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-lg font-semibold text-success">
      <CheckCircle2Icon className="size-6 shrink-0" aria-hidden="true" />
      {t(view.status === 'found' ? 'lost.watch.statusFound' : 'lost.watch.statusSafe')}
    </p>
  );
}

function Call110Link() {
  const { t } = useTranslation();
  return (
    <a href="tel:110" className={buttonVariants({ variant: 'outline', size: 'lg', className: BIG_BUTTON })}>
      <PhoneIcon data-icon="inline-start" aria-hidden="true" />
      {t('lost.watch.call110')}
    </a>
  );
}

/**
 * 家人的地圖頁（/lost/watch?user=長輩的 LINE user id）。從 LINE 通報卡的
 * 「看即時位置」打開。
 *
 * 位置在頁面裡自己更新（輪詢），不靠 LINE 推播：每次位置都推一則會洗掉家人的
 * 聊天室，也會吃光推播額度。結束（已找到、長輩說安全了、時間到）之後停止輪詢，
 * 最後位置仍留在地圖上。
 */
export default function LostWatchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('user')?.trim() || '';
  const queryClient = useQueryClient();
  const now = useNow(5_000);

  const sessionQuery = useQuery({
    queryKey: queryKeys.lostSession(userId),
    queryFn: () => fetchLostSession(userId),
    enabled: userId !== '',
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'active' ? POLL_INTERVAL_MS : false,
    // 沒權限、沒有位置分享：重試也不會變
    retry: (failureCount, error) =>
      !(error instanceof LostApiError && (error.status === 403 || error.status === 404)) &&
      failureCount < 1,
  });

  const foundMutation = useMutation({
    mutationFn: () => markLostFound(userId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.lostSession(userId) }),
    onError: () => toast.error(t('lost.sendFailed')),
  });

  const view = sessionQuery.data;
  const trail = useMemo(() => view?.trail ?? [], [view]);

  if (!userId) {
    return (
      <div className="mx-auto max-w-[720px]">
        <Alert variant="destructive">
          <AlertDescription className="text-base">{t('lost.watch.missingUser')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (sessionQuery.isPending) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center" role="status">
        <Spinner className="size-8" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (!view) {
    const error = sessionQuery.error;
    const key =
      error instanceof LostApiError && error.status === 403
        ? 'lost.watch.forbidden'
        : error instanceof LostApiError && error.status === 404
          ? 'lost.watch.notFound'
          : 'lost.watch.loadFailed';
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        <Alert variant={key === 'lost.watch.notFound' ? 'default' : 'destructive'}>
          <AlertDescription className="text-base">{t(key)}</AlertDescription>
        </Alert>
        {key === 'lost.watch.loadFailed' && (
          <Button size="lg" onClick={() => void sessionQuery.refetch()}>
            {t('lost.retry')}
          </Button>
        )}
      </div>
    );
  }

  const name = view.patient_name || t('lost.watch.fallbackName');
  // 用伺服器時間校正手機時鐘：家人的手機時間不準時，「N 秒前」與停止更新的判斷會跟著錯
  const serverNow = now + (Date.parse(view.server_time) - sessionQuery.dataUpdatedAt);
  const lastSeen = view.last_seen_at ? Date.parse(view.last_seen_at) : null;
  const stale =
    view.status === 'active' &&
    lastSeen !== null &&
    serverNow - lastSeen > view.stale_after_seconds * 1000;
  const location = view.last_location;
  const active = view.status === 'active';
  const hours = Math.round(
    (Date.parse(view.auto_end_at) - Date.parse(view.started_at)) / 3_600_000,
  );

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h1 className="text-[clamp(1.4rem,4vw,1.85rem)] leading-tight font-bold">
            {t('lost.watch.title', { name })}
          </h1>
          <StatusLine view={view} stale={stale} />
          {view.patient_words && (
            <blockquote className="rounded-md border-l-4 border-primary bg-surface-2 px-4 py-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {t('lost.watch.words', { name })}
              </p>
              <p className="mt-1 text-base leading-relaxed">{view.patient_words}</p>
            </blockquote>
          )}
        </CardContent>
      </Card>

      {active && stale && (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription className="text-base">{t('lost.watch.staleHint')}</AlertDescription>
        </Alert>
      )}

      {!active && (
        <Card>
          <CardContent>
            <p className="text-base leading-relaxed">
              {view.status === 'found' &&
                t('lost.watch.endedFound', {
                  finder: view.ended_by_name || t('lost.watch.someone'),
                  name,
                })}
              {view.status === 'safe' && t('lost.watch.endedSafe', { name })}
              {view.status === 'expired' && t('lost.watch.endedExpired', { hours })}
            </p>
          </CardContent>
        </Card>
      )}

      {location ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Suspense
              fallback={<div className="h-[min(55dvh,26rem)] rounded-lg bg-surface-2" role="status" />}
            >
              <LostMap
                current={location}
                trail={trail}
                label={t('lost.watch.mapLabel', { name })}
                recenterLabel={t('lost.watch.recenter')}
                attribution={t('lost.watch.mapAttribution')}
              />
            </Suspense>
            <p className="text-base" aria-live="polite">
              {t('lost.watch.lastUpdate', {
                time: formatElapsed(t, serverNow - Date.parse(location.received_at)),
              })}
              {location.accuracy !== null && (
                <span className="ml-3 text-muted-foreground">
                  {t('lost.watch.accuracy', { meters: Math.round(location.accuracy) })}
                </span>
              )}
            </p>
            <a
              href={googleMapsDirectionsUrl(location.latitude, location.longitude)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'lg', className: BIG_BUTTON })}
            >
              <NavigationIcon data-icon="inline-start" aria-hidden="true" />
              {t('lost.watch.navigate')}
            </a>
          </CardContent>
        </Card>
      ) : (
        active && (
          <Card>
            <CardContent className="flex items-center gap-3">
              <Spinner className="size-6 shrink-0" aria-hidden="true" />
              <p className="text-base leading-relaxed">{t('lost.watch.waiting', { name })}</p>
            </CardContent>
          </Card>
        )
      )}

      {active && (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" size="lg" className={BIG_BUTTON} />}
          >
            <CheckCircle2Icon data-icon="inline-start" aria-hidden="true" />
            {t('lost.watch.foundButton')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('lost.watch.foundConfirmTitle', { name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('lost.watch.foundConfirmBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={foundMutation.isPending}>
                {t('lost.watch.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={foundMutation.isPending}
                onClick={() => foundMutation.mutate()}
              >
                {t('lost.watch.foundConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {(stale || view.status === 'expired') && <Call110Link />}
    </div>
  );
}
