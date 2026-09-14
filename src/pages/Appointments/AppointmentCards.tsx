import { useTranslation } from 'react-i18next';
import {
  BanIcon, BellIcon, BellOffIcon, CalendarClockIcon, ChevronRightIcon, CircleAlertIcon,
  CircleCheckIcon, FootprintsIcon, HospitalIcon, type LucideIcon, RotateCcwIcon, StethoscopeIcon,
  StickyNoteIcon, TicketIcon, Trash2Icon, UserRoundIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  ACTIONABLE_STATUSES, type AppointmentReminder, type AppointmentStatus,
} from '../../types/appointment';
import {
  describeAppointmentAt, formatNotifyTime, isAppointmentDay, parseAppointmentAt, relativeDay,
} from '../../utils/appointmentTime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * 掛號卡片：即將到來的門診、過去的門診，以及卡片與新增流程確認頁共用的內容區。
 */

interface AppointmentCardProps {
  reminder: AppointmentReminder;
  /** 可以開啟編輯視窗、回報出發／到診（本人，或對就診者有 GENERAL WRITE 的家屬） */
  canEdit: boolean;
  /** 這一筆正在送出回報時停用按鈕 */
  busy: boolean;
  /** 把 departed_by_user_id／attended_by_user_id 換成人看得懂的稱呼 */
  reporterName: (userId: string | null | undefined) => string;
  onEdit: (reminder: AppointmentReminder) => void;
  onDepart: (reminder: AppointmentReminder) => void;
  onAttend: (reminder: AppointmentReminder) => void;
}

export function AppointmentCard({
  reminder,
  canEdit,
  busy,
  reporterName,
  onEdit,
  onDepart,
  onAttend,
}: AppointmentCardProps) {
  const { t } = useTranslation();

  const when = describeAppointmentAt(t, reminder.appointment_at);
  const parts = parseAppointmentAt(reminder.appointment_at);

  const reportedLine = (at: string | null | undefined, by: string | null | undefined, key: string) => {
    const reported = at ? parseAppointmentAt(at) : null;
    return reported ? t(key, { time: reported.time, name: reporterName(by) }) : null;
  };
  const departedLine = reportedLine(reminder.departed_at, reminder.departed_by_user_id, 'appt.reported.departed');
  const attendedLine = reportedLine(reminder.attended_at, reminder.attended_by_user_id, 'appt.reported.attended');

  // notify_at 固定 3 筆 [T-1h, T+0, T+30] 或 0 筆。第三筆只發給家屬，
  // 文案因此寫成「還沒回報到診會通知家人」，不能寫成「會在三個時間提醒你」。
  const notifyLine =
    parts && reminder.notify_at.length === 3
      ? t('appt.notifyPlan', {
          first: formatNotifyTime(reminder.notify_at[0], parts.date),
          second: formatNotifyTime(reminder.notify_at[1], parts.date),
          third: formatNotifyTime(reminder.notify_at[2], parts.date),
        })
      : null;

  // 只在門診當天、而且還能轉移的狀態下才給按鈕。後端在其他時候一律回 409，
  // 一週前就擺出一顆「我已到診」只會招來手滑——按下去會取消這次門診所有提醒。
  const showActions =
    canEdit &&
    ACTIONABLE_STATUSES.has(reminder.status) &&
    isAppointmentDay(reminder.appointment_at);

  const info = (
    <>
      <AppointmentDetails
        appointmentAt={reminder.appointment_at}
        hospitalName={reminder.hospital_name}
        department={reminder.department}
        doctorName={reminder.doctor_name}
        serialNumber={reminder.serial_number}
        note={reminder.note}
      />
      {canEdit && (
        <ChevronRightIcon aria-hidden className="size-5 shrink-0 self-center text-muted-foreground" />
      )}
    </>
  );

  return (
    // 與 ReminderCard 同一個理由保留 Item 的 flex-wrap、讓每個直接子項 w-full 各佔一行：
    // 覆寫成 flex-col 時子項不再被卡片寬度約束，最大字級下會撐出水平捲軸。
    //
    // 底色固定用 bg-card（淺色主題是白色）。曾經試過相鄰兩張交錯底色，實際看起來
    // 很亂，已依使用者要求拿掉；卡片之間靠外框與間距分開就夠了。
    <Item variant="outline" className="gap-0 bg-card p-0">
      {canEdit ? (
        <button
          type="button"
          className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-t-2xl px-4 pt-4 pb-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => onEdit(reminder)}
          aria-label={t('appt.editAria', {
            date: when.date,
            time: when.time,
            hospital: reminder.hospital_name,
          })}
        >
          {info}
        </button>
      ) : (
        <div className="flex w-full min-w-0 items-start gap-3 px-4 pt-4 pb-3">{info}</div>
      )}

      <div className="flex w-full min-w-0 flex-col gap-2 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={reminder.status} />
          {!reminder.enabled && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <BellOffIcon aria-hidden className="size-4 shrink-0" />
              {t('appt.notifyOff')}
            </span>
          )}
        </div>
        {departedLine && <p className="text-sm">{departedLine}</p>}
        {attendedLine && <p className="text-sm">{attendedLine}</p>}
        {notifyLine && (
          <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
            <BellIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notifyLine}
          </p>
        )}
      </div>

      {showActions && (
        <>
          <Separator className="w-full" />
          {/* flex-wrap + basis：一般字級下並排，最大字級或泰文這類長標籤時自動上下堆疊，
              不會把按鈕文字擠成兩行半或溢出卡片。 */}
          <div className="flex w-full flex-wrap gap-2 p-4">
            {reminder.status === 'scheduled' && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-auto min-h-12 flex-1 basis-40 whitespace-normal"
                disabled={busy}
                onClick={() => onDepart(reminder)}
              >
                {t('appt.action.depart')}
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              className="h-auto min-h-12 flex-1 basis-40 whitespace-normal"
              disabled={busy}
              onClick={() => onAttend(reminder)}
            >
              {t('appt.action.attend')}
            </Button>
          </div>
        </>
      )}
    </Item>
  );
}

/**
 * 狀態的顏色與圖示。語意由「顏色＋圖示＋文字」三重編碼承擔，不只靠顏色
 * （care-frontend §2）。必須是完整字串查表：Tailwind 掃描原始碼比對 class，
 * 拼接出來的字串不會產生規則。
 *
 * 待看診與已取消用 surface-3：徽章要跟白底（bg-card）的卡片分得開。
 */
const STATUS_STYLE: Record<AppointmentStatus, { tone: string; Icon: LucideIcon }> = {
  scheduled: { tone: 'bg-surface-3 text-foreground', Icon: CalendarClockIcon },
  departed: { tone: 'bg-warning-soft text-warning', Icon: FootprintsIcon },
  attended: { tone: 'bg-success-soft text-success', Icon: CircleCheckIcon },
  missed: { tone: 'bg-destructive-soft text-destructive', Icon: CircleAlertIcon },
  cancelled: { tone: 'bg-surface-3 text-muted-foreground', Icon: BanIcon },
};

/** 掛號狀態徽章，兩種卡片共用。文案 key 就是 `appt.status.` 加上狀態 */
function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  const { tone, Icon } = STATUS_STYLE[status] ?? STATUS_STYLE.scheduled;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
        tone,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {t(`appt.status.${status}`)}
    </span>
  );
}

interface PastAppointmentCardProps {
  reminder: AppointmentReminder;
  /**
   * `attention`：顯示在「需要處理」裡的未到診。同一張卡，按鈕改說「改約」
   * 「刪除這筆紀錄」——在那裡要做的是處理這次沒去成的門診，不是翻舊紀錄。
   */
  variant?: 'past' | 'attention';
  /** 對這位就診者有寫入權才給「再掛一次」與刪除 */
  canEdit: boolean;
  /** 這一筆正在刪除時停用按鈕 */
  busy: boolean;
  onRebook: (reminder: AppointmentReminder) => void;
  onDelete: (reminder: AppointmentReminder) => void;
}

/**
 * 過去的一次門診，精簡版。
 *
 * 與即將到來的卡片刻意長得不一樣（字小一級、沒有出發／到診、點了不會進編輯）：
 * 這裡是紀錄與「再掛一次」的起點，不是要處理的事。整張卡不可點，動作只有右側
 * 那兩顆按鈕，長輩不會誤觸打開一份上次門診的表單。
 *
 * 刪除鈕是這些紀錄唯一的出口：刪除原本只存在編輯視窗裡，而這張卡點不開編輯，
 * 過去的紀錄因此完全刪不掉（見 2026-09-11 生命週期設計）。
 */
export function PastAppointmentCard({
  reminder,
  variant = 'past',
  canEdit,
  busy,
  onRebook,
  onDelete,
}: PastAppointmentCardProps) {
  const { t } = useTranslation();
  const attention = variant === 'attention';
  const when = describeAppointmentAt(t, reminder.appointment_at);
  const subline = [
    reminder.department,
    reminder.doctor_name ? t('appt.doctorLine', { name: reminder.doctor_name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // 確認框與可及名稱都要講清楚是「哪一次」：清單裡好幾張卡長得很像
  const which = {
    when: when.date,
    hospital: reminder.hospital_name,
    department: reminder.department,
  };

  return (
    <Item variant="outline" className="bg-card">
      <ItemContent className="gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-bold">
          <span>{when.date}</span>
          <span className="num">{when.time}</span>
        </p>
        <ItemTitle className="text-base break-words">{reminder.hospital_name}</ItemTitle>
        {subline && (
          <ItemDescription className="line-clamp-none break-words">{subline}</ItemDescription>
        )}
        <div>
          <StatusBadge status={reminder.status} />
        </div>
      </ItemContent>
      {/* 動作放在內容下方整列：放在右側時，窄螢幕會把院所名稱、日期擠成好幾行 */}
      {canEdit && (
        <ItemActions className="w-full flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 flex-1 basis-36 whitespace-normal"
            disabled={busy}
            aria-label={t(attention ? 'appt.attention.rebookAria' : 'appt.past.rebookAria', {
              hospital: reminder.hospital_name,
              department: reminder.department,
            })}
            onClick={() => onRebook(reminder)}
          >
            <RotateCcwIcon data-icon="inline-start" />
            {t(attention ? 'appt.attention.rebook' : 'appt.past.rebook')}
          </Button>
          {/* 刪除一定要經過確認框：這是不可復原的動作，而且按鈕就在「再掛一次」旁邊 */}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  className="h-auto min-h-11 flex-1 basis-36 whitespace-normal"
                  disabled={busy}
                  aria-label={t('appt.past.deleteAria', which)}
                />
              }
            >
              <Trash2Icon data-icon="inline-start" />
              {t(attention ? 'appt.form.delete' : 'appt.past.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('appt.form.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('appt.past.deleteConfirm', which)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t('meds.edit.deleteConfirmNo')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onDelete(reminder)}
                >
                  {t('meds.edit.deleteConfirmYes')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      )}
    </Item>
  );
}

interface AppointmentDetailsProps {
  /** 帶 offset 的 ISO 字串 */
  appointmentAt: string;
  hospitalName: string;
  department: string;
  doctorName?: string | null;
  serialNumber?: string | null;
  note?: string | null;
}

/** 資訊列的標籤：小字＋圖示。值那一欄才是要讓人一眼看到的東西 */
function InfoLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <dt className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      {children}
    </dt>
  );
}

/**
 * 一次門診的內容。列表上的卡片與新增流程的確認頁共用這一個元件：
 * 確認時看到的，就是之後在列表上會看到的那張卡。
 *
 * 版面由上而下依「長輩到了醫院要找的順序」排：什麼時候 → 哪家醫院 → 哪一科、
 * 哪位醫師、看診號 → 備註。每一項都有自己的圖示與位置，不再是一行接一行的
 * 灰字：先前科別、醫師、看診號、備註全是同一種小灰字，遠看就是一團字。
 */
export function AppointmentDetails({
  appointmentAt,
  hospitalName,
  department,
  doctorName,
  serialNumber,
  note,
}: AppointmentDetailsProps) {
  const { t } = useTranslation();
  const when = describeAppointmentAt(t, appointmentAt);
  // 「今天」「明天」比日期更快被讀懂。以門診自己的 offset 判斷，與回報按鈕同一條界線。
  const relative = relativeDay(appointmentAt);
  const dayTag = relative ? t(`appt.card.${relative}`) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {dayTag && (
          <span className="rounded-full bg-primary px-3 py-0.5 text-base font-extrabold text-primary-foreground">
            {dayTag}
          </span>
        )}
        <span className="text-lg font-extrabold">{when.date}</span>
        <span className="num text-3xl leading-tight font-extrabold">{when.time}</span>
      </div>

      <p className="flex items-start gap-2 text-xl leading-snug font-extrabold">
        <HospitalIcon aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
        <span className="min-w-0 break-words">{hospitalName}</span>
      </p>

      {/* 標籤一欄、值一欄。標籤欄是 auto 寬（三個字加一個圖示），值那欄吃掉
          剩下的寬度並可換行，所以 375px 手機、最大字級下也不需要另外的堆疊版。 */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <InfoLabel icon={StethoscopeIcon}>{t('appt.card.department')}</InfoLabel>
        <dd className="min-w-0">
          <span className="inline-block max-w-full rounded-full bg-accent px-3 py-1 text-base font-bold break-words text-accent-foreground">
            {department}
          </span>
        </dd>
        {doctorName && (
          <>
            <InfoLabel icon={UserRoundIcon}>{t('appt.card.doctor')}</InfoLabel>
            <dd className="min-w-0 text-lg font-bold break-words">{doctorName}</dd>
          </>
        )}
        {/* 看診號是到了櫃台要報的數字，字放到跟時間同一級 */}
        {serialNumber && (
          <>
            <InfoLabel icon={TicketIcon}>{t('appt.card.serialNumber')}</InfoLabel>
            <dd className="num min-w-0 text-2xl leading-tight font-extrabold break-all">
              {serialNumber}
            </dd>
          </>
        )}
      </dl>

      {note && (
        <div className="flex items-start gap-2 rounded-xl bg-coral-soft px-3 py-2.5">
          <StickyNoteIcon aria-hidden className="mt-1 size-4 shrink-0 text-coral" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{t('appt.card.note')}</p>
            <p className="text-base leading-relaxed break-words">{note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
