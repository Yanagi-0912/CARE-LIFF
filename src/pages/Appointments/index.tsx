import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarClockIcon, ChevronDownIcon, PlusIcon, Trash2Icon, TriangleAlertIcon,
} from 'lucide-react';

import { getLineUserId } from '../../utils/auth';
import { canManageAppointments } from '../../utils/familyPermissions';
import {
  NEEDS_ATTENTION_DAYS, frequentHospitals, needsAttention, seedFromAppointment,
} from '../../utils/appointmentHistory';
import type { AppointmentReminder, UpdateAppointmentRequest } from '../../types/appointment';
import { useReminderTargets } from '../Reminders/useReminderTargets';
import { ReminderTargetToggle } from '../Reminders/ReminderTargetToggle';
import { appointmentErrorMessage, isStaleStateError } from '../../api/appointmentApi';
import { AppointmentCard, PastAppointmentCard } from './AppointmentCards';
import { AppointmentFormDialog, type AppointmentFields } from './AppointmentForm';
import { useAppointments } from './useAppointments';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * 掛號提醒頁。外殼（對象切換、權限、三態版面、新增／編輯 dialog）與用藥提醒同構。
 *
 * 由上而下三區：
 * 1. 需要處理：未到診、門診後 7 天內、還沒改約的，給「改約」與「刪除這筆紀錄」。
 * 2. 即將到來：卡片上的「我已出發」「我已到診」與 LINE 卡片上的按鈕打同一個後端
 *    方法；點卡片進確認頁，那裡可以修改、取消這次門診、刪除這筆紀錄。
 * 3. 過去的門診（預設收起）：一次 20 筆，「載入更多」再拿；最下面是只有本人才有的
 *    「刪除全部歷史紀錄」。
 */
const AppointmentsPage = () => {
  const { t, i18n } = useTranslation();
  const { members, selfUserId, targets, selectedUserId, setSelectedUserId, selectedName, canEditSelected,
  } = useReminderTargets(canManageAppointments);
  const { upcoming, past, recentPast, pastTotal, hasMorePast, loadingMorePast, loadMorePast, loading, error,
    create, update, remove, depart, attend, cancel, deleteAllPast, refetch,
  } = useAppointments(selectedUserId);

  const [adding, setAdding] = useState(false);
  const [rebookFrom, setRebookFrom] = useState<AppointmentReminder | null>(null);
  const [editing, setEditing] = useState<AppointmentReminder | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const attentionTitleId = useId();
  const upcomingTitleId = useId();

  // 「刪除全部歷史紀錄」只有本人能按（已拍板）：檢視家人時連按鈕都不出現
  const viewingSelf = selectedUserId === selfUserId;

  // 只有能處理的人看得到「需要處理」（已拍板）：只有讀取權的家人一顆按鈕都沒有，
  // 標題卻寫著需要處理，只會讓人不知所措。那些紀錄照樣在過去的門診裡看得到。
  const attention = useMemo(
    () => (canEditSelected ? needsAttention([...upcoming, ...past]) : []),
    [canEditSelected, upcoming, past],
  );
  // 常去的醫院：即將到來的加上最近 20 筆過去的，不為它另外去翻更早的紀錄
  const frequent = useMemo(
    () => frequentHospitals([...upcoming, ...recentPast]),
    [upcoming, recentPast],
  );

  // 回報者可能是本人、正在看的這位家人，或族譜裡的另一位（例如女兒代按，兒子在看）。
  // 族譜裡找不到的（剛被移出、或對方族譜才有的人）退回「家人」，不顯示一串 userId。
  const reporterName = (userId: string | null | undefined) => {
    if (userId && userId === selfUserId) return t('appt.reporter.you');
    const member = userId ? members.find((m) => m.user_id === userId) : undefined;
    return member?.display_name || t('appt.reporter.family');
  };

  const report = async (reminder: AppointmentReminder, action: 'depart' | 'attend') => {
    setReportingId(reminder.id);
    try {
      if (action === 'depart') {
        await depart(reminder.id);
        toast.success(t('appt.action.departSuccess'));
      } else {
        await attend(reminder.id);
        toast.success(t('appt.action.attendSuccess'));
      }
    } catch (err) {
      toast.error(appointmentErrorMessage(t, i18n.language, err));
      if (isStaleStateError(err)) void refetch();
    } finally {
      setReportingId(null);
    }
  };

  const closeCreate = () => {
    setAdding(false);
    setRebookFrom(null);
  };

  const handleCreate = async (fields: AppointmentFields) => {
    // 未取得本人 userId 時 getLineUserId 會拋錯，訊息由 dialog 就地顯示
    const userId = selectedUserId ?? getLineUserId();
    try {
      await create({ user_id: userId, ...fields });
    } catch (err) {
      // 409＝後端發現同一時間已有一筆，但畫面上的清單沒有（別人剛建的）：重抓讓它出現
      if (isStaleStateError(err)) void refetch();
      throw err;
    }
    closeCreate();
    toast.success(t('appt.form.addSuccess'));
  };

  // 以下三個由確認頁呼叫：錯誤訊息由 dialog 顯示，清單若已過期（被刪、被別人按了
  // 到診或取消）順手重抓。
  const handleSave = async (patch: UpdateAppointmentRequest) => {
    if (!editing) return;
    try {
      await update(editing.id, patch);
    } catch (err) {
      if (isStaleStateError(err)) void refetch();
      throw err;
    }
    setEditing(null);
    toast.success(t('appt.form.saveSuccess'));
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await remove(editing.id);
    } catch (err) {
      if (isStaleStateError(err)) void refetch();
      throw err;
    }
    setEditing(null);
    toast.success(t('appt.form.deleteSuccess'));
  };

  const handleCancelVisit = async () => {
    if (!editing) return;
    try {
      await cancel(editing.id);
    } catch (err) {
      if (isStaleStateError(err)) void refetch();
      throw err;
    }
    setEditing(null);
    // 卡片會從即將到來消失、移進收起來的「過去的門診」。不講清楚它去了哪裡，
    // 長輩會以為被刪掉了。
    toast.success(t('appt.form.cancelVisitSuccess'));
  };

  /**
   * 刪除一筆過去的紀錄（「需要處理」與「過去的門診」共用）。確認框在卡片裡，
   * 按到這裡表示使用者已經確認過。404＝這一筆早就不在了（另一支裝置刪過）：
   * 訊息照顯示，順手重抓讓它從畫面消失。
   */
  const handleDeletePast = async (reminder: AppointmentReminder) => {
    setDeletingId(reminder.id);
    try {
      await remove(reminder.id);
      toast.success(t('appt.form.deleteSuccess'));
    } catch (err) {
      toast.error(appointmentErrorMessage(t, i18n.language, err));
      if (isStaleStateError(err)) void refetch();
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadMore = async () => {
    try {
      await loadMorePast();
    } catch (err) {
      toast.error(appointmentErrorMessage(t, i18n.language, err));
    }
  };

  /**
   * 後端是單一 delete_many 而不是交易：失敗時可能刪到一半。不論成敗都以重抓後的
   * 清單為準，提示用後端回的實際筆數。
   */
  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const deleted = await deleteAllPast();
      toast.success(t('appt.past.deleteAllSuccess', { count: deleted }));
    } catch (err) {
      toast.error(appointmentErrorMessage(t, i18n.language, err));
      void refetch();
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('appt.title')}</h1>
        {/* 沒有寫入權時整個不渲染，而不是渲染成停用：按下去必定 403 的按鈕沒有意義 */}
        {canEditSelected && (
          <Button type="button" className="rounded-full" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" />
            {t('appt.addButton')}
          </Button>
        )}
      </header>

      <ReminderTargetToggle
        targets={targets}
        selectedUserId={selectedUserId}
        selfUserId={selfUserId}
        onSelect={setSelectedUserId}
      />

      {loading ? (
        <ItemGroup className="gap-3" aria-busy="true" aria-label={t('meds.loading')}>
          {[0, 1].map((i) => (
            <Item key={i} variant="outline">
              <ItemContent>
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : error ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t('appt.loadError')}</EmptyTitle>
            <EmptyDescription>{appointmentErrorMessage(t, i18n.language, error)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {attention.length > 0 && (
            <section aria-labelledby={attentionTitleId} className="mb-6">
              <h2 id={attentionTitleId} className="text-xl leading-tight font-extrabold">
                {t('appt.attention.title')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t('appt.attention.hint', { days: NEEDS_ATTENTION_DAYS })}
              </p>
              <ItemGroup className="mt-3 gap-3" aria-label={t('appt.attention.listLabel')}>
                {attention.map((reminder) => (
                  <PastAppointmentCard
                    key={reminder.id}
                    variant="attention"
                    reminder={reminder}
                    canEdit
                    busy={deletingId === reminder.id}
                    onRebook={setRebookFrom}
                    onDelete={(r) => void handleDeletePast(r)}
                  />
                ))}
              </ItemGroup>
            </section>
          )}

          <section aria-labelledby={attention.length > 0 ? upcomingTitleId : undefined}>
            {/* 上面有「需要處理」時才需要這個標題：不然長輩分不出下面這幾張是不是也要處理 */}
            {attention.length > 0 && (
              <h2 id={upcomingTitleId} className="mb-3 text-xl leading-tight font-extrabold">
                {t('appt.upcoming.title')}
              </h2>
            )}
            {upcoming.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarClockIcon />
                  </EmptyMedia>
                  {/* 有過去的門診時，「還沒有設定」不是事實：說成「目前沒有要去的門診」 */}
                  <EmptyTitle>
                    {pastTotal > 0
                      ? t('appt.emptyUpcoming', { name: selectedName })
                      : t('appt.empty', { name: selectedName })}
                  </EmptyTitle>
                  {canEditSelected && <EmptyDescription>{t('appt.emptyHint')}</EmptyDescription>}
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-3" aria-label={t('appt.listLabel')}>
                {upcoming.map((reminder) => (
                  <AppointmentCard
                    key={reminder.id}
                    reminder={reminder}
                    canEdit={canEditSelected}
                    busy={reportingId === reminder.id}
                    reporterName={reporterName}
                    onEdit={setEditing}
                    onDepart={(r) => void report(r, 'depart')}
                    onAttend={(r) => void report(r, 'attend')}
                  />
                ))}
              </ItemGroup>
            )}
          </section>

          {/* 過去的門診預設收起：平常要看的是接下來的門診，回診時才打開來「再掛一次」。
              未到診在「需要處理」的那 7 天也會出現在這裡：筆數才會跟後端的總筆數、
              「刪除全部歷史紀錄」刪掉的筆數一致。 */}
          {pastTotal > 0 && (
            <Collapsible className="mt-6">
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="group h-auto min-h-11 w-full justify-between whitespace-normal"
                  />
                }
              >
                {t('appt.past.toggle', { count: pastTotal })}
                <ChevronDownIcon
                  data-icon="inline-end"
                  aria-hidden
                  className="transition-transform group-data-[panel-open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ItemGroup className="mt-3 gap-3" aria-label={t('appt.past.listLabel')}>
                  {past.map((reminder) => (
                    <PastAppointmentCard
                      key={reminder.id}
                      reminder={reminder}
                      canEdit={canEditSelected}
                      busy={deletingId === reminder.id}
                      onRebook={setRebookFrom}
                      onDelete={(r) => void handleDeletePast(r)}
                    />
                  ))}
                </ItemGroup>
                {hasMorePast && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-auto min-h-11 w-full whitespace-normal"
                    disabled={loadingMorePast}
                    onClick={() => void handleLoadMore()}
                  >
                    {loadingMorePast ? t('appt.past.loadingMore') : t('appt.past.loadMore')}
                  </Button>
                )}
                {/* 放在最下面：要先捲過自己的紀錄才看得到，這段距離本身就是一道防線 */}
                {viewingSelf && (
                  <DeleteAllPastButton
                    count={pastTotal}
                    busy={deletingAll}
                    onConfirm={handleDeleteAll}
                  />
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {(adding || rebookFrom) && (
        <AppointmentFormDialog
          key={rebookFrom?.id ?? 'new'}
          seed={rebookFrom ? seedFromAppointment(rebookFrom) : undefined}
          targetName={selectedName}
          existing={upcoming}
          frequentHospitals={frequent}
          onCreate={handleCreate}
          onClose={closeCreate}
        />
      )}

      {editing && (
        <AppointmentFormDialog
          reminder={editing}
          targetName={selectedName}
          existing={upcoming}
          frequentHospitals={frequent}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancelVisit={handleCancelVisit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

/**
 * 刪除全部歷史紀錄。只有本人看得到（已拍板），放在過去的門診展開後的最下面。
 *
 * 一次刪光就醫紀錄不可復原，確認框要把三件事講清楚：刪幾筆、哪些不受影響、
 * 代價是什麼（「常去的醫院」是從這些紀錄整理出來的）。主要動作的文字刻意帶上
 * 筆數，按下去的那一刻再看到一次規模。
 */
function DeleteAllPastButton({
  count,
  busy,
  onConfirm,
}: {
  /** 整個「過去」的筆數（後端的 total_count），不是已經載入的筆數 */
  count: number;
  busy: boolean;
  /** 錯誤由頁面處理並提示，這裡只在完成後收掉確認框 */
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="destructive"
            className="mt-6 h-auto min-h-11 w-full whitespace-normal"
            disabled={busy}
          />
        }
      >
        <Trash2Icon data-icon="inline-start" />
        {t('appt.past.deleteAll', { count })}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('appt.past.deleteAllTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('appt.past.deleteAllConfirm', { count })}
            <span className="mt-2 block">{t('appt.past.deleteAllScope')}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('meds.edit.deleteConfirmNo')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              await onConfirm();
              setOpen(false);
            }}
          >
            {t('appt.past.deleteAllYes', { count })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default AppointmentsPage;
