import type { TFunction } from 'i18next';
import { SLOT_LABEL_KEY, type MedicationSlotType } from '../../types/medication';
import type { PrescriptionCommitResult } from '../../types/prescription';

/** 提交完成後，呼叫端量測到的「這次到底建立了什麼」——不是直接沿用
 * result 的欄位，因為 result 沒有告訴我們哪些藥是使用者主動勾選
 * 「這個藥不用定時提醒我」才沒有提醒的，這件事只有送出當下的表單
 * 知道。 */
export interface CommitSummaryInput {
  result: PrescriptionCommitResult;
  /** 這次提交建立的藥品總數 */
  totalCount: number;
  /** 這次提交建立、但最終沒有連結任何提醒的藥品數（PRN 與使用者主動
   * 勾選「不用定時提醒」的藥品皆計入——對使用者而言是同一件事：這顆
   * 藥不會被提醒，訊息不該只認得其中一種成因）。 */
  noReminderCount: number;
}

/**
 * 組出提交成功後的 toast 文案。
 *
 * 不能只看 prn_medication_ids：核對畫面已經用「這個藥不用定時提醒我」
 * 明確告知使用者某顆藥不會有提醒，送出後的訊息如果對此隻字不提、只提
 * PRN，看起來就會前後矛盾（見本次修正的 Fix 3）。
 *
 * reactivated_slots 是後端這次提交實際重新開啟的時段（該時段原本停用、
 * 已過期，或還沒到 start_date）。核對畫面在送出前已經用同一份事實警示
 * 過一次（見 PrescriptionDraftForm 的重新開啟提示），這裡用同一份事實
 * 再說一次，讓使用者知道「剛剛的警告變成真的發生了」，而不是提醒列表
 * 裡突然多了一筆沒人講的變動。
 */
export function buildCommitSummary(
  t: TFunction,
  { result, totalCount, noReminderCount }: CommitSummaryInput,
): string {
  const base =
    noReminderCount > 0
      ? t('meds.scan.draft.commitSuccessWithNoReminder', { n: totalCount, noReminder: noReminderCount })
      : t('meds.scan.draft.commitSuccess', { n: totalCount });

  if (result.reactivated_slots.length === 0) return base;

  const separator = t('meds.scan.draft.slotListSeparator');
  const slots = result.reactivated_slots
    .map((slot: MedicationSlotType) => t(SLOT_LABEL_KEY[slot]))
    .join(separator);
  return `${base} ${t('meds.scan.draft.commitReactivatedNote', { slots })}`;
}
