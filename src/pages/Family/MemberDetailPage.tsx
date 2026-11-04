import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BellIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  HeartPulseIcon,
  LockIcon,
  MapPinIcon,
  MessageCircleIcon,
  PencilIcon,
  ShieldCheckIcon,
  TagsIcon,
  TriangleAlertIcon,
  UserMinusIcon,
} from 'lucide-react';

import { removeFamilyMember } from '../../api/familyApi';
import { fetchMeasurements, fetchStepCounts } from '../../api/healthApi';
import { getPersonalHealthProfile } from '../../api/profileApi';
import type { HealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import { RELATIONSHIP_LABEL_KEY, isRelationshipType } from '../../types/family';
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
import { FamilyDataState } from './FamilyDataState';
import { MemberAvatar, RoleStatus } from './memberDisplay';
import { memberName, memberPath, useFamilyMember } from './memberUtils';
import { ProxyHealthDialog } from './ProxyHealthDialog';
import { RelationshipDialog } from './RelationshipDialog';
import { receivesCareAlerts } from './roleAccess';
import { FeaturePage } from '@/components/FeaturePage';
import { queryKeys } from '@/lib/queryClient';
import { todayTaipei } from '@/lib/taipeiCalendar';

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
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

/** 移除家人時後端回 404：對方已經不在我的族譜裡 */
const isAlreadyRemoved = (err: unknown) =>
  err instanceof Error && (err as { status?: unknown }).status === 404;

/** 家人資料頁：/family/members/:userId */
export default function MemberDetailPage() {
  const { t } = useTranslation();
  const { member, loading, error, refetch } = useFamilyMember();
  return (
    <FeaturePage title={t('familyMember.title')} backTo="/personalhealth">
      <FamilyDataState loading={loading} error={error} empty={false} refetch={refetch}>
        {member ? <MemberDetail member={member} /> : <MemberNotFound />}
      </FamilyDataState>
    </FeaturePage>
  );
}

export function MemberNotFound() {
  const { t } = useTranslation();
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><TriangleAlertIcon /></EmptyMedia>
        <EmptyTitle>{t('familyMember.notFoundTitle')}</EmptyTitle>
        <EmptyDescription>{t('familyMember.notFoundDesc')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link className={buttonVariants({ variant: 'outline' })} to="/personalhealth">
          {t('familyMember.backToHealth')}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function MemberDetail({ member }: { member: FamilyMember }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [settingRelationship, setSettingRelationship] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const displayName = memberName(member);
  // 稱謂文案在 i18n 的 family.relation.*；後端沒列的值原樣顯示。
  const relationKey = isRelationshipType(member.relationship_type)
    ? RELATIONSHIP_LABEL_KEY[member.relationship_type]
    : undefined;
  const relationLabel = member.relationship_type
    ? relationKey
      ? t(relationKey)
      : member.relationship_type
    : t('familyRelationship.unset');
  const role = member.family_role ?? null;

  // 「我能看他的什麼」一律問 familyPermissions（後端回的實際生效權限），
  // 與上面「我替他設定的角色」（family_role，他能看我的什麼）是相反方向，不要混用。
  const showHealth = canReadSensitive(member);
  const showConsult = canReadPrivate(member);
  const showProxyEdit = canProxyEditHealth(member);
  const noAccess = hasNoAccess(member);

  // 血壓血糖量測與步數看嚴格判定（my_strict_permissions），不受影子模式放寬；
  // 與上面 showHealth（個人健康檔案，走寬鬆權限）刻意分開。
  const showHealthRecords = canReadHealthRecords(member);
  const showRecordProxyEntry = canRecordHealthFor(member);

  // enabled 帶權限：沒有權限就連請求都不發，免得把必定 403 的往返送上長輩的行動網路。
  const { data: health, isPending, isError } = useQuery({
    queryKey: queryKeys.memberProfile(member.user_id),
    queryFn: () => getPersonalHealthProfile(member.user_id),
    enabled: showHealth,
  });

  // 三個獨立查詢而非一次抓齊：與 /health-records 頁共用 query key，彼此命中快取；
  // 其中一個失敗也不會把另外兩個已載入的數字蓋掉。
  const bloodPressure = useQuery({
    queryKey: queryKeys.healthMeasurements(member.user_id, 'blood_pressure'),
    queryFn: () => fetchMeasurements(member.user_id, { kind: 'blood_pressure' }),
    enabled: showHealthRecords,
  });
  const bloodGlucose = useQuery({
    queryKey: queryKeys.healthMeasurements(member.user_id, 'blood_glucose'),
    queryFn: () => fetchMeasurements(member.user_id, { kind: 'blood_glucose' }),
    enabled: showHealthRecords,
  });
  const steps = useQuery({
    queryKey: queryKeys.stepCounts(member.user_id),
    queryFn: () => fetchStepCounts(member.user_id),
    enabled: showHealthRecords,
  });

  const latestBloodPressure = bloodPressure.data?.[0];
  const latestBloodGlucose = bloodGlucose.data?.[0];
  const todayStepEntry = steps.data?.find((entry) => entry.date === todayTaipei());

  function recordRowStatus(pending: boolean) {
    if (pending) {
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
    // 404 當成已完成：兩邊都能按移除，對方可能已經先按了。要的結果——彼此不再是
    // 家人——已經成立；當成失敗的話，畫面會一直留著一位怎麼按都移除不掉的家人。
    mutationFn: async () => {
      try {
        await removeFamilyMember(member.user_id);
      } catch (err) {
        if (!isAlreadyRemoved(err)) throw err;
      }
    },
    onSuccess: () => {
      // 先離開這頁再讓族譜重抓：否則重抓回來的那一瞬間會閃過「找不到這位家人」。
      navigate('/personalhealth', { replace: true });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.familyTree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.familyMemberRoles }),
        // 只標記過期、不立刻重抓：關係已經切斷，現在去要只會拿到 403。
        queryClient.invalidateQueries({
          queryKey: queryKeys.memberProfile(member.user_id),
          refetchType: 'none',
        }),
      ]);
    },
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
  const rowButton = 'h-auto min-h-11 w-full py-2 whitespace-normal';

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center gap-4" aria-label={displayName}>
        <MemberAvatar member={member} className="size-20" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-2xl font-bold wrap-anywhere text-ink">{displayName}</p>
          <Badge
            variant={member.relationship_type ? 'secondary' : 'outline'}
            className="h-auto text-sm whitespace-normal"
          >
            {relationLabel}
          </Badge>
          <RoleStatus role={role} />
        </div>
      </section>

      {noAccess && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          {t('familyPermission.noAccess')}
        </p>
      )}

      {role ? (
        <div className="care-entry-list">
          <Link to={memberPath(member, '/access')} className="care-entry-row care-entry-soft">
            <span className="care-entry-icon care-tone-green"><ClipboardListIcon aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-lg">{t('familyMember.access')}</strong>
              <span className="block text-sm text-muted-foreground">{t('familyMember.accessDesc')}</span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0" aria-hidden="true" />
          </Link>
          {/* 只有說明、沒有開關：沒有「單一家人的通知」可以切換，收不收由角色決定 */}
          <div className="care-entry-row cursor-default">
            <span className="care-entry-icon care-tone-amber"><BellIcon aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-lg">{t('familyMember.notify')}</strong>
              <span className="block text-sm text-muted-foreground">
                {t(receivesCareAlerts(role) ? 'familyMember.notifyOn' : 'familyMember.notifyOff')}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LockIcon /></EmptyMedia>
            <EmptyTitle>{t('familyMember.roleUnset')}</EmptyTitle>
            <EmptyDescription>{t('familyMember.unsetDesc')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to={memberPath(member, '/role')} className={buttonVariants({ className: 'w-full' })}>
              <ShieldCheckIcon data-icon="inline-start" />
              {t('familyMember.setRole')}
            </Link>
          </EmptyContent>
        </Empty>
      )}

      {/* 健康紀錄（血壓、血糖、步數）：嚴格判定，沒有嚴格讀取權時整段不渲染、不發請求。
          經期是 PERSONAL 分類，沒有跨使用者查詢，這裡永遠不放任何經期相關元素。 */}
      {showHealthRecords && (
        <section aria-labelledby="member-records-title">
          <h2 id="member-records-title" className="mb-2 text-lg font-bold">{t('familyMember.recentRecords')}</h2>
          <dl className="grid gap-2">
            <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{t('family.healthRecords.latestBloodPressure')}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {bloodPressure.isPending || bloodPressure.isError ? (
                  recordRowStatus(bloodPressure.isPending)
                ) : latestBloodPressure ? (
                  <>
                    <span className="num text-base font-semibold">
                      {latestBloodPressure.systolic}/{latestBloodPressure.diastolic}{' '}
                      <span className="text-sm font-normal text-muted-foreground">mmHg</span>
                    </span>
                    <HealthLevelBadge level={latestBloodPressure.level} />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('family.healthRecords.noRecord')}</span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{t('family.healthRecords.latestBloodGlucose')}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {bloodGlucose.isPending || bloodGlucose.isError ? (
                  recordRowStatus(bloodGlucose.isPending)
                ) : latestBloodGlucose ? (
                  <>
                    <span className="num text-base font-semibold">
                      {latestBloodGlucose.glucose_mg_dl}{' '}
                      <span className="text-sm font-normal text-muted-foreground">mg/dL</span>
                    </span>
                    <HealthLevelBadge level={latestBloodGlucose.level} />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('family.healthRecords.noRecord')}</span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-hair px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{t('family.healthRecords.todaySteps')}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {steps.isPending || steps.isError ? (
                  recordRowStatus(steps.isPending)
                ) : todayStepEntry ? (
                  <span className="num text-base font-semibold">
                    {t('health.steps.stepsValue', { count: todayStepEntry.steps })}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('family.healthRecords.noRecord')}</span>
                )}
              </dd>
            </div>
          </dl>
          {/* 代記健康紀錄：嚴格寫入權。與下面的「幫忙填健康資料」（個人健康檔案，
              寬鬆權限）是兩個不同的入口，不要合併。 */}
          {showRecordProxyEntry && (
            <Button
              variant="outline"
              className={`mt-3 ${rowButton}`}
              onClick={() => navigate(`/health-records?user=${encodeURIComponent(member.user_id)}`)}
            >
              <HeartPulseIcon data-icon="inline-start" />
              {t('family.healthRecords.proxyEntry')}
            </Button>
          )}
        </section>
      )}

      <section aria-labelledby="member-health-title">
        <h2 id="member-health-title" className="mb-2 text-lg font-bold">{t('family.healthTitle')}</h2>
        {!showHealth ? (
          // 「沒有權限」與「載入失敗」要講成兩件事：看到載入失敗的人會一直重試，
          // 看到沒有權限才知道要去找家人調整。
          <div className="py-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LockIcon className="size-4 shrink-0" />
              {t('familyPermission.noSensitive')}
            </p>
            <p className="mt-1 text-sm text-faint">{t('familyPermission.askOwner')}</p>
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
          <p className="py-1 text-sm text-muted-foreground">{t('family.healthEmpty')}</p>
        ) : (
          <dl className="grid gap-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
                <dd className="num text-right text-sm font-semibold break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {showProxyEdit && (
          <Button variant="outline" className={`mt-3 ${rowButton}`} onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            {t('familyPermission.proxyEdit')}
          </Button>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {/* 無 PRIVATE 讀取權時整個入口不渲染，連停用狀態都不給——那等於告訴使用者
            「這裡有東西但你不能看」，而他無從得知那是不是自己按錯。 */}
        {showConsult ? (
          <Button
            variant="outline"
            className={rowButton}
            onClick={() => navigate(`/personalhealth/consult?user=${encodeURIComponent(member.user_id)}`)}
          >
            <MessageCircleIcon data-icon="inline-start" />
            {t('family.viewConsult')}
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockIcon className="size-4 shrink-0" />
            {t('familyPermission.noPrivate')}
          </p>
        )}
        <Button type="button" variant="outline" className={rowButton} onClick={() => setSettingRelationship(true)}>
          <TagsIcon data-icon="inline-start" />
          {t('familyRelationship.manage.open')}
        </Button>
        {/* 位置授權依走失通報收件人名單，不是健康 RBAC；由地圖頁向後端確認 */}
        <Link
          to={`/lost/watch?user=${encodeURIComponent(member.user_id)}`}
          className={buttonVariants({ variant: 'outline', className: rowButton })}
        >
          <MapPinIcon data-icon="inline-start" />
          {t('familyMember.location')}
        </Link>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <Link to={memberPath(member, '/role')} className={buttonVariants({ variant: 'outline', className: rowButton })}>
          <ShieldCheckIcon data-icon="inline-start" />
          {t('familyMember.setRole')}
        </Link>
        {/* 移除家人不看權限——族譜裡的任何一方都能切斷關係 */}
        <AlertDialog
          open={confirmingRemove}
          onOpenChange={(next) => {
            // 送出中不讓 Esc 關掉：關掉之後使用者無從得知到底移除了沒
            if (!removal.isPending) setConfirmingRemove(next);
          }}
        >
          <AlertDialogTrigger render={<Button type="button" variant="ghost" className={`${rowButton} text-destructive`} />}>
            <UserMinusIcon data-icon="inline-start" />
            {t('familyMember.remove')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="place-items-start text-left">
              <AlertDialogTitle>{t('familyPermission.remove.title', { name: displayName })}</AlertDialogTitle>
              <AlertDialogDescription className="text-base leading-relaxed text-pretty">
                {t('familyPermission.remove.desc', { name: displayName })}
                <span className="mt-2 block">{t('familyPermission.remove.rejoin')}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removal.isPending} className="h-auto min-h-11 py-2 whitespace-normal">
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
                {removal.isPending ? t('familyPermission.remove.removing') : t('familyPermission.remove.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {editing && <ProxyHealthDialog member={member} onClose={() => setEditing(false)} />}
      {settingRelationship && (
        <RelationshipDialog member={member} onClose={() => setSettingRelationship(false)} />
      )}
    </div>
  );
}

/**
 * 把健康檔案攤平成要顯示的列；沒填的欄位直接不產生列，畫面才不會一堆「未設定」。
 * 「什麼算沒填」與表單共用 profileToFormValues，不在這裡另外判斷一次。
 */
function buildRows(health: HealthProfile, t: (key: string) => string) {
  const filled = profileToFormValues(health);
  const rows: { label: string; value: string }[] = [];
  if (filled.age) {
    rows.push({ label: t('personalHealth.field.age'), value: `${filled.age} ${t('personalHealth.unit.age')}` });
  }
  // 後端存的是與 i18n key 最後一段同名的 code，所以直接拼得出 key。
  if (filled.gender) {
    rows.push({ label: t('personalHealth.gender'), value: t(`personalHealth.gender.${filled.gender}`) });
  }
  if (filled.height) {
    rows.push({ label: t('personalHealth.field.height'), value: `${filled.height} ${t('personalHealth.unit.height')}` });
  }
  if (filled.weight) {
    rows.push({ label: t('personalHealth.field.weight'), value: `${filled.weight} ${t('personalHealth.unit.weight')}` });
  }
  // 固定選項是 code，翻成看的人的語言；自訂病名是使用者打的字，原文照用。
  const chronic = [
    ...filled.chronicDisease.map((code) => t(`personalHealth.chronic.${code}`)),
    ...filled.customChronic,
  ];
  if (chronic.length > 0) {
    rows.push({ label: t('personalHealth.chronic'), value: chronic.join(t('personalHealth.listSeparator')) });
  }
  if (filled.majorIllness) {
    rows.push({ label: t('personalHealth.majorIllness'), value: filled.majorIllness });
  }
  if (filled.surgeryHistory) {
    rows.push({ label: t('personalHealth.surgeryHistory'), value: filled.surgeryHistory });
  }
  return rows;
}
