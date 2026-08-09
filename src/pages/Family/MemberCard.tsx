import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, TriangleAlertIcon, UserIcon } from 'lucide-react';

import { getPersonalHealthProfile } from '../../api/profileApi';
import type { HealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import { RELATIONSHIP_LABEL } from '../../types/family';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  member: FamilyMember;
}

/** 後端在使用者沒填過資料時會回一組佔位值，這些不算「有資料」 */
const PLACEHOLDER_HEIGHT = 1.0;
const PLACEHOLDER_WEIGHT = 1.0;

const hasNumber = (value: number | undefined, placeholder: number) =>
  value != null && value !== 0 && value !== placeholder;

/**
 * 家人卡片 — 整列是 Collapsible 的 trigger，展開才去要健康資料。
 *
 * 健康資料走 React Query 而非 useState：換頁再回來、或同一人在別處也被展開時
 * 可以命中快取，不用重打 API；重試與錯誤狀態也交給 queryClient 的預設值。
 */
export function MemberCard({ member }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const displayName = member.display_name || member.user_id.slice(0, 8);
  const relationLabel = member.relationship_type
    ? RELATIONSHIP_LABEL[member.relationship_type] || member.relationship_type
    : t('family.unset');

  // enabled: open —— 收合狀態不發請求，展開過一次後就一直保留快取
  const { data: health, isPending, isError } = useQuery({
    queryKey: queryKeys.memberProfile(member.user_id),
    queryFn: () => getPersonalHealthProfile(member.user_id),
    enabled: open,
  });

  const rows = health ? buildRows(health, t) : [];

  return (
    <Collapsible open={open} onOpenChange={setOpen} role="listitem">
      <Item
        variant="outline"
        className={cn(
          'flex-col items-stretch gap-0 p-0 transition-colors',
          open && 'border-primary/40 bg-primary/[0.03]',
        )}
      >
        <CollapsibleTrigger
          className="group/row flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={displayName}
        >
          <ItemMedia>
            {/* size-12：長輩友善，比 Avatar 內建的 lg（40px）再大一級 */}
            <Avatar className="size-12">
              <AvatarImage src={member.picture_url} alt="" />
              <AvatarFallback>
                <UserIcon className="size-5" />
              </AvatarFallback>
            </Avatar>
          </ItemMedia>

          <ItemContent>
            <ItemTitle className="text-base">{displayName}</ItemTitle>
            <Badge
              variant={member.relationship_type ? 'secondary' : 'outline'}
              className="mt-0.5"
            >
              {relationLabel}
            </Badge>
          </ItemContent>

          <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/row:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent className="animate-in fade-in slide-in-from-top-1 duration-200">
          <Separator />
          <div className="px-4 py-3.5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('family.healthTitle')}
            </p>

            {isPending ? (
              <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                <Spinner />
                {t('family.healthLoading')}
              </p>
            ) : isError ? (
              <p className="flex items-center gap-2 py-1 text-sm text-destructive">
                <TriangleAlertIcon className="size-4 shrink-0" />
                {t('family.healthError')}
              </p>
            ) : rows.length === 0 ? (
              <p className="py-1 text-sm text-muted-foreground">
                {t('family.healthEmpty')}
              </p>
            ) : (
              <dl className="grid gap-2">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="shrink-0 text-sm text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="num text-right text-sm font-semibold break-words">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </CollapsibleContent>
      </Item>
    </Collapsible>
  );
}

/** 把健康檔案攤平成要顯示的列；沒填的欄位直接不產生列，畫面才不會一堆「未設定」 */
function buildRows(health: HealthProfile, t: (key: string) => string) {
  const rows: { label: string; value: string }[] = [];

  if (health.age != null && health.age !== 0) {
    rows.push({
      label: t('personalHealth.field.age'),
      value: `${health.age} ${t('personalHealth.unit.age')}`,
    });
  }

  if (health.gender && health.gender !== 'unknown') {
    const genderKey = `personalHealth.gender.${health.gender}`;
    const translated = t(genderKey);
    rows.push({
      label: t('personalHealth.gender'),
      // 後端可能直接回中文（男／女），查不到 key 時 i18next 會原樣回傳 key
      value: translated === genderKey ? health.gender : translated,
    });
  }

  if (hasNumber(health.height, PLACEHOLDER_HEIGHT)) {
    rows.push({
      label: t('personalHealth.field.height'),
      value: `${health.height} ${t('personalHealth.unit.height')}`,
    });
  }

  if (hasNumber(health.weight, PLACEHOLDER_WEIGHT)) {
    rows.push({
      label: t('personalHealth.field.weight'),
      value: `${health.weight} ${t('personalHealth.unit.weight')}`,
    });
  }

  if (health.chronic_history) {
    rows.push({
      label: t('personalHealth.chronic'),
      value: health.chronic_history,
    });
  }

  if (health.major_illness_history) {
    rows.push({
      label: t('personalHealth.majorIllness'),
      value: health.major_illness_history,
    });
  }

  if (health.surgery_history) {
    rows.push({
      label: t('personalHealth.surgeryHistory'),
      value: health.surgery_history,
    });
  }

  return rows;
}
