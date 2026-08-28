import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDownIcon,
  LockIcon,
  MessageCircleIcon,
  PencilIcon,
  TriangleAlertIcon,
  UserIcon,
} from 'lucide-react';

import { getPersonalHealthProfile } from '../../api/profileApi';
import type { HealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import { RELATIONSHIP_LABEL } from '../../types/family';
import {
  canProxyEditHealth,
  canReadPrivate,
  canReadSensitive,
  hasNoAccess,
} from '../../utils/familyPermissions';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { ProxyHealthDialog } from './ProxyHealthDialog';

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const displayName = member.display_name || member.user_id.slice(0, 8);
  const relationLabel = member.relationship_type
    ? RELATIONSHIP_LABEL[member.relationship_type] || member.relationship_type
    : t('family.unset');

  // 權限一律問 familyPermissions，不在這裡解讀 my_permissions 的字串。
  // 這些值是後端回的「實際生效」權限（已套用對方家庭的遷移狀態），前端不重算
  // 矩陣、也不判斷狀態——那會變成第二個安全邊界，而它必然會與後端漂移。
  const showHealth = canReadSensitive(member);
  const showConsult = canReadPrivate(member);
  const showProxyEdit = canProxyEditHealth(member);
  const noAccess = hasNoAccess(member);

  // enabled 多帶 showHealth：沒有權限就連請求都不發。讓它打出去再收 403，
  // 只是把一個必然失敗的往返送上長輩的行動網路。
  const { data: health, isPending, isError } = useQuery({
    queryKey: queryKeys.memberProfile(member.user_id),
    queryFn: () => getPersonalHealthProfile(member.user_id),
    enabled: open && showHealth,
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
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge
                variant={member.relationship_type ? 'secondary' : 'outline'}
              >
                {relationLabel}
              </Badge>
              {noAccess && (
                <Badge variant="outline" className="gap-1">
                  <LockIcon className="size-3.5 shrink-0" />
                  {t('familyPermission.noAccess')}
                </Badge>
              )}
            </div>
          </ItemContent>

          <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/row:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent className="animate-in fade-in slide-in-from-top-1 duration-200">
          <Separator />
          <div className="px-4 py-3.5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('family.healthTitle')}
            </p>

            {!showHealth ? (
              // 「沒有權限」與「載入失敗」要講成兩件事：看到載入失敗的人會
              // 一直重試，看到沒有權限才知道要去找家人調整。
              <div className="py-1">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LockIcon className="size-4 shrink-0" />
                  {t('familyPermission.noSensitive')}
                </p>
                <p className="mt-1 text-sm text-faint">
                  {t('familyPermission.askOwner')}
                </p>
              </div>
            ) : isPending ? (
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

            {/* 代填健康資料：只有對這位家人的健康資料有寫入權的人看得到 */}
            {showProxyEdit && (
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => setEditing(true)}
              >
                <PencilIcon data-icon="inline-start" />
                {t('familyPermission.proxyEdit')}
              </Button>
            )}

            {/* 查看諮詢紀錄：無 PRIVATE 讀取權時整個入口不渲染。
                渲染成停用狀態也不行——那等於告訴使用者「這裡有東西但你不能
                看」，而他無從得知那是不是自己按錯。 */}
            {showConsult ? (
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() =>
                  navigate(
                    `/personalhealth/consult?user=${encodeURIComponent(member.user_id)}`,
                  )
                }
              >
                <MessageCircleIcon data-icon="inline-start" />
                {t('family.viewConsult')}
              </Button>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <LockIcon className="size-4 shrink-0" />
                {t('familyPermission.noPrivate')}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Item>

      {editing && (
        <ProxyHealthDialog member={member} onClose={() => setEditing(false)} />
      )}
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

  // 後端存的是與 i18n key 最後一段同名的 code，所以直接拼得出 key。
  // 'unknown' 是建帳號時的預設值，代表還沒填，不產生列。
  if (health.gender && health.gender !== 'unknown') {
    rows.push({
      label: t('personalHealth.gender'),
      value: t(`personalHealth.gender.${health.gender}`),
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

  // 固定選項是 code，翻成看的人的語言；自訂病名是使用者打的字，原文照用。
  // 兩者分開存，所以這裡不需要判斷哪一項是哪一種，接起來就好。
  const chronic = [
    ...(health.chronic_diseases ?? []).map((code) => t(`personalHealth.chronic.${code}`)),
    ...(health.chronic_custom ?? []),
  ];
  if (chronic.length > 0) {
    rows.push({
      label: t('personalHealth.chronic'),
      value: chronic.join(t('personalHealth.listSeparator')),
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
