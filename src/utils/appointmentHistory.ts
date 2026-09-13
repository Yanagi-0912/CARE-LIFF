import type { AppointmentReminder } from '../types/appointment';
import { isSameVisit, normKey } from './appointmentConflicts';
import { compareAppointmentAt, parseAppointmentAt, todayInOffset } from './appointmentTime';

/**
 * 掛號清單的「歷史」面：整理出常去的醫院、「再掛一次」要帶入哪些欄位，以及
 * 哪些未到診還需要處理。長輩的掛號多半是回診——同一家醫院、同一科、同一位醫師，
 * 只差日期——這些工具讓他們不必每次都從搜尋醫院開始。
 *
 * 「即將到來／過去」的分區不在這裡：那條界線（當日已結束或已取消）只存在後端，
 * 列表與「刪除全部歷史紀錄」共用同一份判定，前端再算一次只會跟它對不上。
 */

/** 未到診在「需要處理」停留幾天（已拍板） */
export const NEEDS_ATTENTION_DAYS = 7;

/** YYYY-MM-DD 加幾天。用 UTC 只是為了避開裝置時區，不是在做換算 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * 這筆未到診是不是已經改約過了：同一家醫院的同一科，已經有一筆比它晚、
 * 而且沒有取消的掛號。不論那一筆是從「改約」建的還是另外新增的，都算。
 *
 * 不這樣判定的話，長輩按「改約」建好新掛號、回到清單，那張「未到診」還會掛在
 * 最上面好幾天，他會以為沒成功，再掛一次。
 */
function isRebooked(missed: AppointmentReminder, list: readonly AppointmentReminder[]): boolean {
  const visit = {
    appointmentAt: missed.appointment_at,
    facilityId: missed.facility_id ?? null,
    hospitalName: missed.hospital_name,
    department: missed.department,
  };
  return list.some(
    (other) =>
      other.id !== missed.id &&
      other.status !== 'cancelled' &&
      compareAppointmentAt(other.appointment_at, missed.appointment_at) > 0 &&
      isSameVisit(visit, other),
  );
}

/**
 * 「需要處理」：未到診、門診後 7 天內、還沒改約過的門診，新的在上面。
 *
 * 7 天以門診自己的 offset 下的日期算：9/15 的門診從 9/16 顯示到 9/22，9/23 起
 * 只留在「過去的門診」。不需要「知道了」按鈕，也不需要後端記已讀——沒人處理的
 * 話它會自己消失。
 *
 * `list` 傳手上有的全部（即將到來＋已載入的過去）：改約建的那一筆在即將到來裡。
 * 過去的門診只載入第一頁（最近 20 筆），7 天內的未到診一定在裡面，除非那 7 天
 * 之後又累積了 20 筆以上的過去紀錄，實務上不會發生。
 */
export function needsAttention(
  list: readonly AppointmentReminder[],
  now: number = Date.now(),
): AppointmentReminder[] {
  return list
    .filter((item) => {
      if (item.status !== 'missed') return false;
      const parts = parseAppointmentAt(item.appointment_at);
      if (!parts) return false;
      const lastDay = addDays(parts.date, NEEDS_ATTENTION_DAYS);
      if (todayInOffset(parts.offsetMinutes, now) > lastDay) return false;
      return !isRebooked(item, list);
    })
    .sort((a, b) => compareAppointmentAt(b.appointment_at, a.appointment_at));
}

export interface FrequentHospital {
  /** 分組用的 key；有 facility_id 時以 id 為準 */
  key: string;
  facilityId: string | null;
  name: string;
  address: string | null;
  phone: string | null;
}

/**
 * 常去的醫院：依出現次數排序，次數相同時最近的在前。
 *
 * 呼叫端傳即將到來的門診與最近 20 筆過去的門診（過去的第一頁），不另外去抓
 * 更早的紀錄——最近 20 次門診已經足以代表常去哪幾家，更早的院所多半已經不去了。
 *
 * 有 facility_id 的以 id 分組（連鎖診所的分院常常同名，名稱相同不代表同一家）；
 * 手動輸入、沒有 id 的才以院名分組，比對規則與重複檢查相同。
 * 已取消的不算——那一次並沒有去。
 */
export function frequentHospitals(
  list: readonly AppointmentReminder[],
  limit = 4,
): FrequentHospital[] {
  const groups = new Map<string, { hospital: FrequentHospital; count: number; latest: string }>();
  for (const item of list) {
    if (item.status === 'cancelled') continue;
    const key = item.facility_id ? `id:${item.facility_id}` : `name:${normKey(item.hospital_name)}`;
    const hospital: FrequentHospital = {
      key,
      facilityId: item.facility_id ?? null,
      name: item.hospital_name,
      address: item.hospital_address ?? null,
      phone: item.hospital_phone ?? null,
    };
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { hospital, count: 1, latest: item.appointment_at });
      continue;
    }
    group.count += 1;
    // 名稱、地址以最近一筆為準：院所改名或搬家時，帶入的是最新的寫法
    if (compareAppointmentAt(item.appointment_at, group.latest) > 0) {
      group.latest = item.appointment_at;
      group.hospital = hospital;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || compareAppointmentAt(b.latest, a.latest))
    .slice(0, limit)
    .map((group) => group.hospital);
}

/** 「再掛一次」預先帶入表單的欄位 */
export interface AppointmentSeed {
  facilityId: string | null;
  hospitalName: string;
  hospitalAddress: string | null;
  hospitalPhone: string | null;
  department: string;
  doctorName: string | null;
}

/**
 * 從過去的一次門診帶出醫院、科別、醫師。
 *
 * 看診號與備註**不帶**：那是上一次門診的，這次的號碼一定不同，帶過來只會被
 * 誤當成這次的號碼；備註（「記得帶上次的抽血報告」）也多半只適用那一次。
 */
export function seedFromAppointment(item: AppointmentReminder): AppointmentSeed {
  return {
    facilityId: item.facility_id ?? null,
    hospitalName: item.hospital_name,
    hospitalAddress: item.hospital_address ?? null,
    hospitalPhone: item.hospital_phone ?? null,
    department: item.department,
    doctorName: item.doctor_name ?? null,
  };
}
