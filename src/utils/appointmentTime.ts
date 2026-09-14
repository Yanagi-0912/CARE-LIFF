import type { TFunction } from 'i18next';
import type { ClinicDaySchedule, ClinicTimeSlot, WeekdayKey } from '../types/medical';

/**
 * 掛號時間工具。
 *
 * 後端收發的 `appointment_at` 是帶 offset 的 ISO 8601（`2026-09-15T09:30:00+08:00`），
 * 而且**原樣回傳建立時送去的 offset**。所以顯示時一律直接切字串，不經過
 * `Date` 轉成裝置的本地時間——使用者若在國外打開 LIFF，看到的仍是掛號單上
 * 的 09:30，而不是被換算成當地時間的某個數字。
 *
 * 只有兩種情況真的需要「瞬間」：排序與「是不是已經過了」。那兩處用
 * `Date.parse`，帶 offset 的完整 ISO 字串解析起來沒有歧義。
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** getUTCDay() 的順序（週日為 0） */
const WEEKDAY_BY_UTC_DAY: readonly WeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface AppointmentParts {
  /** YYYY-MM-DD，就是字串裡寫的那一天 */
  date: string;
  /** HH:MM */
  time: string;
  month: number;
  day: number;
  weekday: WeekdayKey;
  /** 例如 `+08:00`；`Z` 會正規化成 `+00:00` */
  offset: string;
  offsetMinutes: number;
}

function parseOffset(raw: string): { offset: string; minutes: number } {
  if (raw === 'Z') return { offset: '+00:00', minutes: 0 };
  const sign = raw.startsWith('-') ? -1 : 1;
  const [hours, mins] = raw.slice(1).split(':').map(Number);
  return { offset: raw, minutes: sign * (hours * 60 + mins) };
}

/** 格式錯誤時回 null，呈現面退回原字串，不要讓整張卡片崩潰。 */
export function parseAppointmentAt(iso: string): AppointmentParts | null {
  const match = ISO_RE.exec(iso);
  if (!match) return null;
  const [, year, month, day, hour, minute, rawOffset] = match;
  const { offset, minutes } = parseOffset(rawOffset);
  // 星期只由年月日決定，用 UTC 計算純粹是為了避開裝置時區，不是在做換算
  const weekday = WEEKDAY_BY_UTC_DAY[
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  ];
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    month: Number(month),
    day: Number(day),
    weekday,
    offset,
    offsetMinutes: minutes,
  };
}

/**
 * 卡片、確認頁、衝突訊息共用的日期時間寫法：「9/15（週二）」與「09:30」。
 * 格式不對時退回原字串，呈現面不因此崩潰。
 */
export function describeAppointmentAt(t: TFunction, iso: string): { date: string; time: string } {
  const parts = parseAppointmentAt(iso);
  if (!parts) return { date: iso, time: '' };
  return {
    date: t('appt.dateDisplay', {
      month: parts.month,
      day: parts.day,
      weekday: t(`weekday.${parts.weekday}`),
    }),
    time: parts.time,
  };
}

/** 某個 offset 下「今天」的日期（YYYY-MM-DD） */
export function todayInOffset(offsetMinutes: number, now: number = Date.now()): string {
  return new Date(now + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * 今天是不是這次門診的當天（以門診自己的 offset 判斷）。
 *
 * 後端只在門診當天接受出發／到診回報（實作報告 §0 第 4 點：防止一週前手滑
 * 按了到診，把後續提醒全部取消）。前端用同一條界線決定要不要顯示那兩顆
 * 按鈕，才不會給使用者一個按下去必定 409 的按鈕。
 *
 * 後端的實際界線是「當地 00:00 與 T-1h 取較早者」，只有 00:00～01:00 之間的
 * 門診兩者才不同。那種情況下 LIFF 的按鈕會晚到午夜才出現，但 LINE 卡片上的
 * 按鈕照常能按，所以這裡不為了那一小時在前端複製一份 T-1h 的常數。
 */
export function isAppointmentDay(iso: string, now: number = Date.now()): boolean {
  const parts = parseAppointmentAt(iso);
  if (!parts) return false;
  return todayInOffset(parts.offsetMinutes, now) === parts.date;
}

/**
 * 門診是今天、明天，還是都不是（以門診自己的 offset 判斷，與 isAppointmentDay 同一條界線）。
 * 卡片上的「今天」「明天」比「9/15（週二）」更快被讀懂。
 */
export function relativeDay(iso: string, now: number = Date.now()): 'today' | 'tomorrow' | null {
  const parts = parseAppointmentAt(iso);
  if (!parts) return null;
  if (todayInOffset(parts.offsetMinutes, now) === parts.date) return 'today';
  if (todayInOffset(parts.offsetMinutes, now + 86_400_000) === parts.date) return 'tomorrow';
  return null;
}

/** 門診時間是不是已經過了（瞬間比較） */
export function isPast(iso: string, now: number = Date.now()): boolean {
  const instant = Date.parse(iso);
  return Number.isFinite(instant) && instant <= now;
}

/** 依瞬間排序（不同 offset 的兩筆也能正確比較） */
export function compareAppointmentAt(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = `${Math.floor(abs / 60)}`.padStart(2, '0');
  const mins = `${abs % 60}`.padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

/**
 * 裝置在「那個日期時間」的 offset。
 *
 * 用當天的日期算而不是用現在：有日光節約的地區，三個月後的門診可能跟今天
 * 差一小時。台灣沒有日光節約，但照正確的方式算不會多花什麼。
 * 這裡用的是分量建構子 `new Date(y, m, d, h, mm)`，不是解析字串，
 * 不會有「YYYY-MM-DD 被當成 UTC 午夜」的問題。
 */
export function deviceOffsetFor(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return formatOffset(-new Date(year, month - 1, day, hour, minute).getTimezoneOffset());
}

export function buildAppointmentAt(date: string, time: string, offset: string): string {
  return `${date}T${time}:00${offset}`;
}

/** YYYY-MM-DD 是星期幾 */
export function weekdayOf(date: string): WeekdayKey | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return WEEKDAY_BY_UTC_DAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * 某個日期在院所門診表上的樣子。
 *
 * - `open`：查得到那天的時段
 * - `closed`：資料明確標成那天休診
 * - `unknown`：整份 clinic_time 缺席、那天沒有資料、或有資料但沒有任何時段
 *
 * 三種都只拿來**提示**，不拿來擋：clinic_time 是整間院所的營業時段而非各科
 * 門診表，權威是使用者手上的掛號單（需求文件「只能拿來提示，不能拿來限制」）。
 * 但休診與查不到要分開說，而且都要說：先前兩者都回 null、畫面什麼都不講，
 * 使用者選了休診日只會看到時段按鈕消失，不知道是那天沒開還是畫面壞了。
 */
export type ClinicDay =
  | { kind: 'open'; slots: ClinicTimeSlot[] }
  | { kind: 'closed' }
  | { kind: 'unknown' };

export function clinicDayFor(
  clinicTime: Record<string, ClinicDaySchedule> | null | undefined,
  date: string,
): ClinicDay {
  if (!clinicTime) return { kind: 'unknown' };
  const weekday = weekdayOf(date);
  if (!weekday) return { kind: 'unknown' };
  const schedule = clinicTime[weekday];
  if (!schedule) return { kind: 'unknown' };
  if (schedule.isClosed) return { kind: 'closed' };
  const slots = (schedule.slots ?? []).filter((slot) => slot.open && slot.close);
  return slots.length > 0 ? { kind: 'open', slots } : { kind: 'unknown' };
}

type DayPeriod ='earlyMorning' | 'morning' | 'noon' | 'afternoon' | 'evening';

/**
 * 24 小時制的「時」對應到口語的時段與 12 小時制的數字，給時間選單附註用
 * （「14 時（下午 2 點）」）。
 *
 * 不用 `Intl.DateTimeFormat` 的 hour12：它把中午寫成「下午12時」、午夜寫成
 * 「上午12時」，正好是這裡要消除的那種混淆。
 */
export function hourHint(hour: number): { period: DayPeriod; hour12: number } {
  const period: DayPeriod =
    hour < 6
      ? 'earlyMorning'
      : hour < 12
        ? 'morning'
        : hour === 12
          ? 'noon'
          : hour < 18
            ? 'afternoon'
            : 'evening';
  return { period, hour12: hour % 12 === 0 ? 12 : hour % 12 };
}

/** 時間是否落在任一時段內。兩端都算在內：12:00 的診落在 08:30–12:00 不該被警告。 */
export function isWithinSlots(time: string, slots: ClinicTimeSlot[]): boolean {
  return slots.some((slot) => slot.open <= time && time <= slot.close);
}

/**
 * 推播時間的顯示：與門診同一天只顯示 HH:MM，跨日（00:30 的診，T-1h 在前一晚）
 * 才加上月日，否則「23:30」會被讀成當天晚上。
 */
export function formatNotifyTime(iso: string, appointmentDate: string): string {
  const parts = parseAppointmentAt(iso);
  if (!parts) return iso;
  return parts.date === appointmentDate ? parts.time : `${parts.month}/${parts.day} ${parts.time}`;
}
