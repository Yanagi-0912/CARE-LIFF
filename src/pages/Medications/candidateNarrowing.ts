import type { DrugCandidate } from '../../types/prescription';

/**
 * 一次呈現候選照片的上限。
 *
 * 實測 400 筆真實藥品：多候選案例中位數 3 張、80% 落在 5 張以內——spec
 * 「候選過多時以外觀屬性漸進收窄」的量測原文明講「這個量長輩看得完」，
 * 5 直接取自這句話，不是另外拍腦袋訂的數字。超過這個量才要求使用者先
 * 回答顏色／形狀，換取縮到「看得完」的候選數，而不是一次攤開最多 74 張。
 */
export const CANDIDATE_DIRECT_LIST_LIMIT = 5;

export interface CandidateNarrowingFilters {
  color: string | null;
  shape: string | null;
}

export type CandidateNarrowingResult =
  /** 候選數在上限內（或已被篩選收窄到上限內），可直接呈現照片供挑選 */
  | { stage: 'pick'; candidates: DrugCandidate[] }
  /** 候選過多，請使用者先回答顏色 */
  | { stage: 'ask-color'; options: string[] }
  /** 依顏色篩選後仍過多，請使用者再回答形狀 */
  | { stage: 'ask-shape'; options: string[] }
  /** 用盡顏色與形狀仍無法收窄到上限內：不顯示照片，退回純文字 */
  | { stage: 'too-many' };

/** 取候選集合中某外觀欄位的相異非空值，作為下一步詢問的選項。
 *  空字串代表外觀資料集沒收錄這個候選的該欄位，不能當成一個可選的答案。 */
function distinctValues(candidates: DrugCandidate[], key: 'color' | 'shape'): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  candidates.forEach((candidate) => {
    const value = candidate[key];
    if (value && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  });
  return values;
}

/**
 * 決定候選清單目前該呈現「直接挑選」「先問顏色」「先問形狀」還是「候選
 * 過多、退回純文字」。純函式：同樣的候選與篩選條件永遠得到同樣的結果，
 * 呼叫端（DrugCandidateSection）只需要把使用者目前選的顏色／形狀當成
 * filters 傳入，不需要自己重算收窄邏輯。
 *
 * 依序詢問顏色、再詢問形狀（spec 明講的順序：使用者一眼就能回答的外觀
 * 屬性），而不是挑「最能拆分候選」的屬性——後者對長輩來說是「猜系統想
 * 問什麼」，前者才是「看得到就答得出」。
 */
export function narrowCandidates(
  candidates: DrugCandidate[],
  filters: CandidateNarrowingFilters,
  limit: number = CANDIDATE_DIRECT_LIST_LIMIT,
): CandidateNarrowingResult {
  if (candidates.length <= limit) return { stage: 'pick', candidates };

  const byColor = filters.color
    ? candidates.filter((candidate) => candidate.color === filters.color)
    : candidates;

  if (!filters.color) {
    const colors = distinctValues(candidates, 'color');
    // 只有一種顏色（或完全沒有顏色資料）時，問了也篩不出東西，直接跳到形狀。
    if (colors.length > 1) return { stage: 'ask-color', options: colors };
  }

  if (byColor.length <= limit) return { stage: 'pick', candidates: byColor };

  const byShape = filters.shape
    ? byColor.filter((candidate) => candidate.shape === filters.shape)
    : byColor;

  if (!filters.shape) {
    const shapes = distinctValues(byColor, 'shape');
    if (shapes.length > 1) return { stage: 'ask-shape', options: shapes };
  }

  if (byShape.length <= limit) return { stage: 'pick', candidates: byShape };

  // 顏色與形狀都問過（或都問不出分歧）仍超過上限：呈現不可用的選項只會
  // 逼使用者亂選，寧可不給照片（spec「候選過多時以外觀屬性漸進收窄」）。
  return { stage: 'too-many' };
}
