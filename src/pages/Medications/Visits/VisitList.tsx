import { useTranslation } from 'react-i18next';
import { BuildingIcon, CalendarIcon, CircleAlertIcon, LockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import type { MedicationVisit } from '../../../types/medication';

interface VisitListProps {
  visits: MedicationVisit[];
  loading: boolean;
  error: string | null;
  forbidden: boolean;
  onRetry?: () => void;
}

/**
 * 看診紀錄清單。
 *
 * 三種空畫面必須分得開，因為使用者該做的事完全不同：
 *
 * - forbidden：沒有權限。重試多少次都一樣，因此不給「重新載入」按鈕。
 * - error：載入失敗。給重試。
 * - 空清單：還沒有資料。告訴他怎麼讓資料出現（去掃藥袋），而不是只說「無資料」。
 */
export function VisitList({ visits, loading, error, forbidden, onRetry }: VisitListProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t('visits.loading')}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (forbidden) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('visits.title')}</EmptyTitle>
          <EmptyDescription>{t('visits.forbidden')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t('visits.loadError')}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t('visits.retry')}
          </Button>
        ) : null}
      </Empty>
    );
  }

  if (visits.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BuildingIcon />
          </EmptyMedia>
          <EmptyTitle>{t('visits.title')}</EmptyTitle>
          <EmptyDescription>{t('visits.empty')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="space-y-3">
      {visits.map((visit) => (
        <VisitRow
          // 機構＋日期就是這一組的身分（後端以它分組），空值各自有固定字面值，
          // 因此這個 key 在同一份回應裡必然唯一。
          key={`${visit.institution ?? '-'}|${visit.dispensed_date ?? '-'}`}
          visit={visit}
        />
      ))}
    </ItemGroup>
  );
}

function VisitRow({ visit }: { visit: MedicationVisit }) {
  const { t } = useTranslation();
  const unknownSource = !visit.institution;

  return (
    <Item variant="outline" className="items-start">
      <ItemMedia variant="icon">
        {unknownSource ? <CircleAlertIcon /> : <BuildingIcon />}
      </ItemMedia>
      <ItemContent className="gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {visit.institution ?? t('visits.unknownInstitution')}
          </span>
          <Badge variant="secondary">
            {t('visits.drugCount', { count: visit.medication_names.length })}
          </Badge>
          {/* 掃描次數只在大於 1 時顯示——同一個藥袋被掃了三次是使用者會困惑的
              事（「我是不是重複加了？」），主動說明比讓他自己發現好。 */}
          {visit.scan_count > 1 ? (
            <Badge variant="outline">
              {t('visits.scanCount', { count: visit.scan_count })}
            </Badge>
          ) : null}
        </div>

        <div className="text-muted-foreground flex items-center gap-1 text-sm">
          <CalendarIcon className="size-3.5" />
          <span>{visit.dispensed_date ?? t('visits.unknownDate')}</span>
        </div>

        {/* 藥名清單。這是 GENERAL 資料，能看到這個畫面的人本來就看得到它。 */}
        <p className="text-muted-foreground text-sm">
          {visit.medication_names.join(t('meds.scan.draft.slotListSeparator'))}
        </p>

        {unknownSource ? (
          <p className="text-muted-foreground text-xs">
            {t('visits.unknownInstitutionHint')}
          </p>
        ) : null}
      </ItemContent>
    </Item>
  );
}
