import type { AppointmentReminder } from '../types/appointment';
import { parseAppointmentAt } from './appointmentTime';

/**
 * 新增／編輯掛號時，找出與這筆草稿撞在一起的其他掛號（同一位就診者）。
 *
 * - `duplicate`：同一時間、同醫院、同科別。後端會擋成 409，比對規則與這裡相同；
 *   前端先擋，是為了在送出之前就講清楚撞到的是哪一筆。
 * - `sameTime`：同一時間，但醫院或科別不同。**表單一樣擋下**（產品決策）：
 *   同一個人不可能同時出現在兩個診間，放行只會讓兩則推播同時響、清單上兩張卡
 *   同一個時間，長輩分不清該去哪一個。後端也擋同一時間（不論醫院科別），前端先擋
 *   是為了在送出前講清楚撞到的是哪一筆。
 * - `sameDay`：同一天、同醫院、同科別，但時間不同。多半是同一張掛號單建了兩次、
 *   其中一次時間填錯。只提示。
 *
 * 已取消的不算（後端也不算）：那一筆已經不會推播了。
 */
export interface AppointmentDraft {
  /** 帶 offset 的完整 ISO 字串，與送出時組的是同一個 */
  appointmentAt: string;
  facilityId: string | null;
  hospitalName: string;
  department: string;
}

export interface AppointmentConflicts {
  duplicate: AppointmentReminder | null;
  sameTime: AppointmentReminder[];
  sameDay: AppointmentReminder[];
}

export const NO_CONFLICTS: AppointmentConflicts = { duplicate: null, sameTime: [], sameDay: [] };

/** 比對用：去掉所有空白、不分大小寫（與後端 `_norm_key` 相同） */
export function normKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 是不是同一家醫院的同一個科。兩邊都有 facility_id 時只看 id：連鎖診所的
 * 分院常常同名，名稱相同不代表是同一家。有一邊沒有 id（手動輸入）才比院名。
 */
export function isSameVisit(draft: AppointmentDraft, other: AppointmentReminder): boolean {
  if (normKey(draft.department) !== normKey(other.department)) return false;
  if (draft.facilityId && other.facility_id) return draft.facilityId === other.facility_id;
  return normKey(draft.hospitalName) === normKey(other.hospital_name);
}

export function findAppointmentConflicts(
  draft: AppointmentDraft,
  existing: readonly AppointmentReminder[],
  excludeId?: string,
): AppointmentConflicts {
  const draftInstant = Date.parse(draft.appointmentAt);
  const draftDate = parseAppointmentAt(draft.appointmentAt)?.date;
  if (!Number.isFinite(draftInstant) || !draftDate) return NO_CONFLICTS;

  const result: AppointmentConflicts = { duplicate: null, sameTime: [], sameDay: [] };
  for (const other of existing) {
    if (other.id === excludeId || other.status === 'cancelled') continue;
    const sameInstant = Date.parse(other.appointment_at) === draftInstant;
    const sameVisit = isSameVisit(draft, other);
    if (sameInstant && sameVisit) {
      result.duplicate ??= other;
    } else if (sameInstant) {
      result.sameTime.push(other);
    } else if (sameVisit && parseAppointmentAt(other.appointment_at)?.date === draftDate) {
      result.sameDay.push(other);
    }
  }
  return result;
}
