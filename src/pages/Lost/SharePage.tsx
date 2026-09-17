import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2Icon, MapPinIcon, PhoneIcon, ShieldCheckIcon } from 'lucide-react';
import { endLostByElder, fetchMyLostStatus } from '../../api/lostApi';
import type { LostStatus } from '../../types/lost';
import { queryKeys } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { closeToChat, formatElapsed, useNow } from './shared';
import { useLocationSharing } from './useLocationSharing';

/** 大按鈕的共用樣式：字級調到最大時仍能換行，不會被 whitespace-nowrap 截掉 */
const BIG_BUTTON = 'h-auto min-h-12 w-full whitespace-normal py-3 text-lg';

/** 這幾種錯誤再等也不會好，要請長輩改用聊天室的「傳送一次位置」 */
const BLOCKING_GEO_ERRORS = new Set(['permission_denied', 'unsupported', 'insecure']);

function endedMessageKey(status: LostStatus | null): string {
  switch (status) {
    case 'found':
      return 'lost.share.endedFound';
    case 'safe':
      return 'lost.share.endedSafe';
    case 'expired':
      return 'lost.share.endedExpired';
    default:
      return 'lost.share.inactiveBody';
  }
}

/**
 * 長輩的定位頁（/lost/share）。從 LINE 的「讓家人看到我在哪裡」按鈕打開。
 *
 * 打開就開始定位與上傳，不再要長輩多按一次「開始」：他已經在聊天室按過一次按鈕
 * 了，而且正在慌。手機第一次會問要不要允許使用位置，那是唯一需要他做的決定。
 *
 * 頁面是獨立頁（不顯示導覽列，見 App.tsx 的 isStandalonePage），避免長輩誤點
 * 離開這個畫面。
 */
export default function LostSharePage() {
  const { t } = useTranslation();
  const [endedStatus, setEndedStatus] = useState<LostStatus | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.lostSelf,
    queryFn: fetchMyLostStatus,
    staleTime: 0,
  });
  const active = statusQuery.data?.active === true && endedStatus === null;

  const handleEnded = useCallback((status: LostStatus) => setEndedStatus(status), []);
  const sharing = useLocationSharing(active, handleEnded);
  const now = useNow(5_000);

  const endMutation = useMutation({
    mutationFn: endLostByElder,
    onSuccess: (result) => setEndedStatus(result.status ?? 'safe'),
    onError: () => toast.error(t('lost.sendFailed')),
  });

  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center" role="status">
        <Spinner className="size-8" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (statusQuery.isError) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription className="text-lg">{t('lost.share.loadFailed')}</AlertDescription>
        </Alert>
        <Button size="lg" className={BIG_BUTTON} onClick={() => void statusQuery.refetch()}>
          {t('lost.retry')}
        </Button>
      </div>
    );
  }

  if (!active) {
    const status = endedStatus ?? statusQuery.data?.status ?? null;
    const ended = status !== null && status !== 'active';
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            {status === 'found' || status === 'safe' ? (
              <CheckCircle2Icon className="size-12 text-success" aria-hidden="true" />
            ) : (
              <MapPinIcon className="size-12 text-muted-foreground" aria-hidden="true" />
            )}
            {!ended && (
              <h1 className="text-2xl leading-tight font-bold">{t('lost.share.inactiveTitle')}</h1>
            )}
            <p className="text-lg leading-relaxed">{t(endedMessageKey(status))}</p>
          </CardContent>
        </Card>
        <Button size="lg" variant="outline" className={BIG_BUTTON} onClick={() => closeToChat()}>
          {t('lost.share.backToChat')}
        </Button>
      </div>
    );
  }

  const { position, lastSentAt, geoError, uploadFailed } = sharing;
  const blocked = geoError !== null && BLOCKING_GEO_ERRORS.has(geoError.code);

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4">
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <MapPinIcon className="size-12" aria-hidden="true" />
          {/* text-inherit 的理由同首頁 hero：base 層的 h1 墨色會蓋掉繼承色 */}
          <h1 className="text-[clamp(1.6rem,6vw,2.2rem)] leading-tight font-bold text-inherit">
            {t('lost.share.title')}
          </h1>
          <p className="text-xl leading-relaxed font-semibold">{t('lost.share.keepOpen')}</p>
        </CardContent>
      </Card>

      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle className="text-lg">{t('lost.share.permissionTitle')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 text-lg">
            {geoError && geoError.code !== 'permission_denied' && <p>{geoError.message}</p>}
            <p>{t('lost.share.permissionBody')}</p>
            <Button size="lg" className={BIG_BUTTON} onClick={() => closeToChat()}>
              {t('lost.share.backToChat')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Card aria-live="polite">
          <CardContent className="flex items-center gap-3">
            {lastSentAt !== null ? (
              <>
                <CheckCircle2Icon className="size-8 shrink-0 text-success" aria-hidden="true" />
                <p className="text-lg">
                  {t('lost.share.lastSent', { time: formatElapsed(t, now - lastSentAt) })}
                </p>
              </>
            ) : (
              <>
                <Spinner className="size-8 shrink-0" aria-hidden="true" />
                <p className="text-lg">{t('lost.share.locating')}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!blocked && geoError && !position && (
        <Alert>
          <AlertDescription className="text-lg">{t('lost.share.unavailable')}</AlertDescription>
        </Alert>
      )}

      {uploadFailed && (
        <Alert>
          <AlertDescription className="text-lg">{t('lost.share.networkRetry')}</AlertDescription>
        </Alert>
      )}

      <a href="tel:110" className={buttonVariants({ variant: 'outline', size: 'lg', className: BIG_BUTTON })}>
        <PhoneIcon data-icon="inline-start" aria-hidden="true" />
        {t('lost.share.call110')}
      </a>

      <AlertDialog>
        <AlertDialogTrigger
          render={<Button variant="outline" size="lg" className={BIG_BUTTON} />}
        >
          <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
          {t('lost.share.safeButton')}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">{t('lost.share.safeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-lg">
              {t('lost.share.safeConfirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="lg" disabled={endMutation.isPending}>
              {t('lost.share.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              size="lg"
              disabled={endMutation.isPending}
              onClick={() => endMutation.mutate()}
            >
              {t('lost.share.safeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
