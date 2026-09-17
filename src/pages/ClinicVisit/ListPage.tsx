import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, CircleAlertIcon, MicIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/queryClient';

import { listClinicVisits, type ClinicVisitRecord } from '../../api/clinicVisitApi';
import { useFamily } from '../../hooks/useFamily';
import { getLineUserId } from '../../utils/auth';
import { canReadClinicVisits, canRecordClinicVisits } from '../../utils/familyPermissions';
import { ReminderTargetToggle } from '../Reminders/ReminderTargetToggle';
import type { ReminderTarget } from '../Reminders/useReminderTargets';

/** 讀取本人 LINE userId；未登入時回 undefined（API 省略參數即為本人） */
function readSelfUserId(): string | undefined {
  try {
    return getLineUserId();
  } catch {
    return undefined;
  }
}

/** 還有紀錄在轉錄時多久重抓一次。轉錄是背景工作，沒有其他辦法知道它好了沒。 */
const PROCESSING_POLL_MS = 5000;

function recordId(record: ClinicVisitRecord): string {
  return record.id ?? record._id ?? '';
}

function formatRecordedAt(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * 看診錄音清單：選單的入口、錄音的起點，也是家人找得到紀錄的地方。
 *
 * 在這之前唯一的入口是掛號提醒 T-1h 卡片上的按鈕，沒設掛號提醒就錄不了；
 * 錄完之後也沒有任何畫面列出紀錄，只能靠推播或手上的網址。
 *
 * 對象只列**嚴格判定**下有 SENSITIVE 讀取權的家人（canReadClinicVisits），
 * 「開始錄音」只在有寫入權時出現——家人陪診時就是從這裡替長輩錄。
 * 對象切換沿用用藥／掛號的 ReminderTargetToggle，「替誰看」的操作全 App 一致。
 */
export default function ClinicVisitListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { members } = useFamily();

  const [selfUserId] = useState(readSelfUserId);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(selfUserId);

  const targets = useMemo<ReminderTarget[]>(() => {
    const self: ReminderTarget = { userId: selfUserId, name: t('meds.self'), canWrite: true };
    const family = members
      .filter((member) => member.user_id && member.user_id !== selfUserId)
      .filter((member) => canReadClinicVisits(member))
      .map<ReminderTarget>((member) => ({
        userId: member.user_id,
        name: member.display_name || t('family.unset'),
        canWrite: canRecordClinicVisits(member),
      }));
    return [self, ...family];
  }, [members, selfUserId, t]);

  const isSelf = !selectedUserId || selectedUserId === selfUserId;
  const target = targets.find((item) => item.userId === selectedUserId);
  const targetUserId = isSelf ? undefined : selectedUserId;
  const targetQuery = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.clinicVisits(targetUserId),
    queryFn: () => listClinicVisits(targetUserId),
    refetchInterval: (query) =>
      query.state.data?.some((record) => record.status === 'processing')
        ? PROCESSING_POLL_MS
        : false,
  });

  const canRecord = isSelf || (target?.canWrite ?? false);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isSelf ? t('clinic.title') : t('clinic.titleForMember', { name: target?.name ?? '' })}
        </h1>
        <p className="text-muted-foreground">{t('clinic.intro')}</p>
      </div>

      {targets.length > 1 && (
        <ReminderTargetToggle
          targets={targets}
          selectedUserId={selectedUserId}
          selfUserId={selfUserId}
          onSelect={setSelectedUserId}
          label={t('clinic.targetLabel')}
        />
      )}

      {canRecord && (
        <Button
          className="h-14 w-full text-lg"
          onClick={() => navigate(`/clinic-visits/record${targetQuery}`)}
        >
          <MicIcon data-icon="inline-start" />
          {t('clinic.startRecording')}
        </Button>
      )}

      {isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlertIcon />
            </EmptyMedia>
            <EmptyDescription>{t('clinic.list.loadError')}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('clinic.list.retry')}
          </Button>
        </Empty>
      ) : data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MicIcon />
            </EmptyMedia>
            <EmptyTitle>{t('clinic.empty')}</EmptyTitle>
            {canRecord && <EmptyDescription>{t('clinic.list.emptyHint')}</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-3">
          {data.map((record) => (
            <Item
              key={recordId(record)}
              variant="outline"
              className="cursor-pointer text-left transition-colors hover:bg-muted/40"
              render={
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/clinic-visits/${encodeURIComponent(recordId(record))}${targetQuery}`)
                  }
                />
              }
            >
              <ItemContent className="gap-1">
                <ItemTitle className="text-base break-words">
                  {record.hospital_name || t('clinic.title')}
                  {record.department && ` · ${record.department}`}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {formatRecordedAt(record.recorded_at, i18n.language)}
                </ItemDescription>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={
                      record.status === 'failed'
                        ? 'destructive'
                        : record.status === 'processing'
                          ? 'outline'
                          : 'secondary'
                    }
                  >
                    {t(`clinic.status.${record.status}`)}
                  </Badge>
                  {record.consent === 'self_recap' && (
                    <Badge variant="outline">{t('clinic.list.selfRecap')}</Badge>
                  )}
                </div>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon aria-hidden className="size-5 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
