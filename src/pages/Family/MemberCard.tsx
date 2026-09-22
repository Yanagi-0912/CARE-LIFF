import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ChevronDownIcon,
  HeartPulseIcon,
  LockIcon,
  MessageCircleIcon,
  PencilIcon,
  TagsIcon,
  TriangleAlertIcon,
  UserIcon,
  UserMinusIcon,
} from 'lucide-react';

import { removeFamilyMember } from '../../api/familyApi';
import { fetchMeasurements, fetchStepCounts } from '../../api/healthApi';
import { getPersonalHealthProfile } from '../../api/profileApi';
import type { HealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import {
  FAMILY_ROLE_LABEL_KEY,
  RELATIONSHIP_LABEL_KEY,
  isRelationshipType,
} from '../../types/family';
import {
  canProxyEditHealth,
  canReadHealthRecords,
  canReadPrivate,
  canReadSensitive,
  canRecordHealthFor,
  hasNoAccess,
} from '../../utils/familyPermissions';
import { profileToFormValues } from '../PersonalHealth/healthForm';
import { HealthLevelBadge } from '../HealthRecords/HealthLevelBadge';
import { queryKeys } from '@/lib/queryClient';
import { todayTaipei } from '@/lib/taipeiCalendar';
import { cn } from '@/lib/utils';

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
import { RelationshipDialog } from './RelationshipDialog';

interface Props {
  member: FamilyMember;
}

/** 移除家人時後端回 404：對方已經不在我的族譜裡 */
const isAlreadyRemoved = (err: unknown) =>
  err instanceof Error && (err as { status?: unknown }).status === 404;

/**
 * 家人卡片 — 整列是 Collapsible 的 trigger，展開才去要健康資料。
 *
 * 健康資料走 React Query 而非 useState：換頁再回來、或同一人在別處也被展開時
 * 可以命中快取，不用重打 API；重試與錯誤狀態也交給 queryClient 的預設值。
 */
export function MemberCard({ member }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingRelationship, setSettingRelationship] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const displayName = member.display_name || member.user_id.slice(0, 8);
  // 稱謂文案在 i18n 的 family.relation.*；後端沒列的值原樣顯示。
  const relationKey = isRelationshipType(member.relationship_type)
    ? RELATIONSHIP_LABEL_KEY[member.relationship_type]
    : undefined;
  const relationLabel = member.relationship_type
    ? relationKey
      ? t(relationKey)
      : member.relationship_type
    : t('familyRelationship.unset');
  // family_role 是「他對我的資料」的角色，也就是我在「設定家人權限」裡替他選的那個
  const roleLabel = member.family_role
    ? t(FAMILY_ROLE_LABEL_KEY[member.family_role])
    : t('familyRole.cardUnassigned');

  // 權限一律問 familyPermissions，不在這裡解讀 my_permissions 的字串。
  // 這些值是後端回的「實際生效」權限（已套用對方家庭的遷移狀態），前端不重算
  // 矩陣、也不判斷狀態——那會變成第二個安全邊界，而它必然會與後端漂移。
  const showHealth = canReadSensitive(member);
  const showConsult = canReadPrivate(member);
  const showProxyEdit = canProxyEditHealth(member);
  const noAccess = hasNoAccess(member);

  // 血壓血糖量測、提醒範圍與步數是 personal-health-tracking 這個 change 新導入
  // 的資源，一律看嚴格判定（`my_strict_permissions`），不受影子模式放寬——同
  // familyPermissions.ts 對 `canReadHealthRecords` 的說明。與上面 `showHealth`
  // （個人健康檔案，走寬鬆權限）刻意分開判斷。
  const showHealthRecords = canReadHealthRecords(member);
  const showRecordProxyEntry = canRecordHealthFor(member);

  // enabled 多帶 showHealth：沒有權限就連請求都不發。讓它打出去再收 403，
  // 只是把一個必然失敗的往返送上長輩的行動網路。
  const { data: health, isPending, isError } = useQuery({
    queryKey: queryKeys.memberProfile(member.user_id),
    queryFn: () => getPersonalHealthProfile(member.user_id),
    enabled: open && showHealth,
  });

  // 三個獨立查詢（血壓、血糖、步數）而非一次抓齊：與 /health-records 頁共用
  // 同一組 query key，兩處展開同一位家人時彼此命中快取，不必各自重打一次。
  // enabled 同樣多帶 showHealthRecords，沒有嚴格讀取權就連請求都不發。
  const measurementsBpKey = queryKeys.healthMeasurements(member.user_id, 'blood_pressure');
  const measurementsGlucoseKey = queryKeys.healthMeasurements(member.user_id, 'blood_glucose');
  const stepsKey = queryKeys.stepCounts(member.user_id);

  const bloodPressure = useQuery({
    queryKey: measurementsBpKey,
    queryFn: () => fetchMeasurements(member.user_id, { kind: 'blood_pressure' }),
    enabled: open && showHealthRecords,
  });
  const bloodGlucose = useQuery({
    queryKey: measurementsGlucoseKey,
    queryFn: () => fetchMeasurements(member.user_id, { kind: 'blood_glucose' }),
    enabled: open && showHealthRecords,
  });
  const steps = useQuery({
    queryKey: stepsKey,
    queryFn: () => fetchStepCounts(member.user_id),
    enabled: open && showHealthRecords,
  });

  const latestBloodPressure = bloodPressure.data?.[0];
  const latestBloodGlucose = bloodGlucose.data?.[0];
  const todayStepEntry = steps.data?.find((entry) => entry.date === todayTaipei());

  // 三個查詢各自獨立呈現 pending／error：其中一個失敗（例如步數）不該把另外
  // 兩個已經成功載入的數字也一起蓋掉（review：ORing 三者的 pending/error
  // 會讓一個失敗的查詢遮住其餘已經有結果的讀數）。呼叫端只在
  // `isPending || isError` 為真時才會用到這個函式，所以這裡只要分辨
  // pending／error 兩種情形即可。
  function recordRowStatus(isPending: boolean) {
    if (isPending) {
      return (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('family.healthLoading')}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        {t('family.healthError')}
      </span>
    );
  }

  const removal = useMutation({
    // 404 當成已完成：兩邊都能按移除，對方可能已經先按了，而這張卡片是快取裡
    // （最多 30 秒前）的樣子。要的結果——彼此不再是家人——已經成立；當成失敗
    // 的話，畫面會一直留著一張怎麼按都移除不掉的卡片。
    mutationFn: async () => {
      try {
        await removeFamilyMember(member.user_id);
      } catch (err) {
        if (!isAlreadyRemoved(err)) throw err;
      }
    },
    onSuccess: () =>
      Promise.all([
        // 族譜一重抓，這張卡片就會消失；用藥頁「替誰設定」的名單也吃同一份。
        queryClient.invalidateQueries({ queryKey: queryKeys.familyTree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.familyMemberRoles }),
        // 只標記過期、不立刻重抓：關係已經切斷，現在去要只會拿到 403，
        // 還可能在卡片消失前閃一下「無法載入健康資料」。
        queryClient.invalidateQueries({
          queryKey: queryKeys.memberProfile(member.user_id),
          refetchType: 'none',
        }),
      ]),
  });

  const handleRemove = async () => {
    try {
      await removal.mutateAsync();
      toast.success(t('familyPermission.remove.success', { name: displayName }));
    } catch {
      toast.error(t('familyPermission.remove.error'));
    } finally {
      setConfirmingRemove(false);
    }
  };

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
            {/* h-auto + whitespace-normal：Badge 內建 h-5 與 nowrap，角色譯文比稱謂長
                （越南文近 20 字），特大字級下會把 375px 的頁面撐出橫向捲動 */}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge
                variant={member.relationship_type ? 'secondary' : 'outline'}
                className="h-auto text-sm whitespace-normal"
              >
                {relationLabel}
              </Badge>
              <Badge
                variant={member.family_role ? 'secondary' : 'outline'}
                className="h-auto text-sm whitespace-normal"
              >
                {roleLabel}
              </Badge>
            </div>
            {/* 這是一句說明、不是狀態標籤，所以不用 Badge：Badge 內建
                whitespace-nowrap，特大字級下這句話會把 375px 的頁面撐出橫向捲動。 */}
            {noAccess && (
              <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                {t('familyPermission.noAccess')}
              </span>
            )}
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

            <Button
              type="button"
              variant="outline"
              className="mt-3 h-auto min-h-11 w-full py-2 whitespace-normal"
              onClick={() => setSettingRelationship(true)}
            >
              <TagsIcon data-icon="inline-start" />
              {t('familyRelationship.manage.open')}
            </Button>

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

          {/* 健康紀錄（血壓、血糖、步數）：strict 判定，沒有嚴格讀取權時整段
              SHALL NOT 渲染，也不發任何請求（見上面 showHealthRecords 的說明）。
              經期是 PERSONAL 分類，沒有代記也沒有跨使用者查詢，這裡永遠不放
              任何經期相關元素。 */}
          {showHealthRecords && (
            <>
              <Separator />
              <div className="px-4 py-3.5">
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('family.healthRecords.title')}
                </p>

                <dl className="grid gap-2">
                  <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
                    <dt className="text-sm text-muted-foreground">
                      {t('family.healthRecords.latestBloodPressure')}
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {bloodPressure.isPending || bloodPressure.isError ? (
                        recordRowStatus(bloodPressure.isPending)
                      ) : latestBloodPressure ? (
                        <>
                          <span className="num text-base font-semibold">
                            {latestBloodPressure.systolic}/{latestBloodPressure.diastolic}{' '}
                            <span className="text-sm font-normal text-muted-foreground">
                              mmHg
                            </span>
                          </span>
                          <HealthLevelBadge level={latestBloodPressure.level} />
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t('family.healthRecords.noRecord')}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
                    <dt className="text-sm text-muted-foreground">
                      {t('family.healthRecords.latestBloodGlucose')}
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {bloodGlucose.isPending || bloodGlucose.isError ? (
                        recordRowStatus(bloodGlucose.isPending)
                      ) : latestBloodGlucose ? (
                        <>
                          <span className="num text-base font-semibold">
                            {latestBloodGlucose.glucose_mg_dl}{' '}
                            <span className="text-sm font-normal text-muted-foreground">
                              mg/dL
                            </span>
                          </span>
                          <HealthLevelBadge level={latestBloodGlucose.level} />
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t('family.healthRecords.noRecord')}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
                    <dt className="text-sm text-muted-foreground">
                      {t('family.healthRecords.todaySteps')}
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {steps.isPending || steps.isError ? (
                        recordRowStatus(steps.isPending)
                      ) : todayStepEntry ? (
                        <span className="num text-base font-semibold">
                          {t('health.steps.stepsValue', { count: todayStepEntry.steps })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t('family.healthRecords.noRecord')}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* 代記健康紀錄：只有對這位家人的血壓血糖／步數有嚴格寫入權的人
                    看得到，連到 /health-records 頁去新增量測、設定提醒範圍。
                    與上面的「幫他填健康資料」（showProxyEdit，個人健康檔案，
                    走寬鬆權限）是兩個不同的入口，不要合併。 */}
                {showRecordProxyEntry && (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() =>
                      navigate(`/health-records?user=${encodeURIComponent(member.user_id)}`)
                    }
                  >
                    <HeartPulseIcon data-icon="inline-start" />
                    {t('family.healthRecords.proxyEntry')}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* 移除家人：與健康資料無關、也不看權限——族譜裡的任何一方都能切斷
              關係。用分隔線隔開，放在最下面，不跟日常會按的按鈕擠在一起。 */}
          <Separator />
          <div className="px-4 py-3.5">
            <AlertDialog
              open={confirmingRemove}
              onOpenChange={(next) => {
                // 送出中不讓 Esc 關掉：關掉之後使用者無從得知到底移除了沒
                if (!removal.isPending) setConfirmingRemove(next);
              }}
            >
              {/* h-auto + whitespace-normal：Button 內建 nowrap，特大字級下
                  較長的譯文會把 375px 的頁面撐出橫向捲動 */}
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-auto min-h-11 w-full py-2 whitespace-normal"
                  />
                }
              >
                <UserMinusIcon data-icon="inline-start" />
                {t('familyPermission.remove.button')}
              </AlertDialogTrigger>
              <AlertDialogContent>
                {/* 預設置中對齊；後果說明是好幾行的段落，靠左長輩比較好讀 */}
                <AlertDialogHeader className="place-items-start text-left">
                  <AlertDialogTitle>
                    {t('familyPermission.remove.title', { name: displayName })}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-base leading-relaxed text-pretty">
                    {t('familyPermission.remove.desc', { name: displayName })}
                    <span className="mt-2 block">{t('familyPermission.remove.rejoin')}</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    disabled={removal.isPending}
                    className="h-auto min-h-11 py-2 whitespace-normal"
                  >
                    {t('familyPermission.cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={removal.isPending}
                    className="h-auto min-h-11 py-2 whitespace-normal"
                    onClick={() => void handleRemove()}
                  >
                    {removal.isPending ? (
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                    ) : (
                      <UserMinusIcon data-icon="inline-start" />
                    )}
                    {removal.isPending
                      ? t('familyPermission.remove.removing')
                      : t('familyPermission.remove.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CollapsibleContent>
      </Item>

      {editing && (
        <ProxyHealthDialog member={member} onClose={() => setEditing(false)} />
      )}
      {settingRelationship && (
        <RelationshipDialog
          member={member}
          onClose={() => setSettingRelationship(false)}
        />
      )}
    </Collapsible>
  );
}

/**
 * 把健康檔案攤平成要顯示的列；沒填的欄位直接不產生列，畫面才不會一堆「未設定」。
 *
 * 「什麼算沒填」（null、佔位值、gender unknown）與表單共用 profileToFormValues，
 * 不在這裡另外判斷一次。
 */
function buildRows(health: HealthProfile, t: (key: string) => string) {
  const filled = profileToFormValues(health);
  const rows: { label: string; value: string }[] = [];

  if (filled.age) {
    rows.push({
      label: t('personalHealth.field.age'),
      value: `${filled.age} ${t('personalHealth.unit.age')}`,
    });
  }

  // 後端存的是與 i18n key 最後一段同名的 code，所以直接拼得出 key。
  if (filled.gender) {
    rows.push({
      label: t('personalHealth.gender'),
      value: t(`personalHealth.gender.${filled.gender}`),
    });
  }

  if (filled.height) {
    rows.push({
      label: t('personalHealth.field.height'),
      value: `${filled.height} ${t('personalHealth.unit.height')}`,
    });
  }

  if (filled.weight) {
    rows.push({
      label: t('personalHealth.field.weight'),
      value: `${filled.weight} ${t('personalHealth.unit.weight')}`,
    });
  }

  // 固定選項是 code，翻成看的人的語言；自訂病名是使用者打的字，原文照用。
  // 兩者分開存，所以這裡不需要判斷哪一項是哪一種，接起來就好。
  const chronic = [
    ...filled.chronicDisease.map((code) => t(`personalHealth.chronic.${code}`)),
    ...filled.customChronic,
  ];
  if (chronic.length > 0) {
    rows.push({
      label: t('personalHealth.chronic'),
      value: chronic.join(t('personalHealth.listSeparator')),
    });
  }

  if (filled.majorIllness) {
    rows.push({
      label: t('personalHealth.majorIllness'),
      value: filled.majorIllness,
    });
  }

  if (filled.surgeryHistory) {
    rows.push({
      label: t('personalHealth.surgeryHistory'),
      value: filled.surgeryHistory,
    });
  }

  return rows;
}
