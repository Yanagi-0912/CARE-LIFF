import type { NearbyHospitalsResponse } from '../../types/medical';

/**
 * 把後端回傳的搜尋事實組成「要說哪幾句話」。
 *
 * 對應後端 `medical_tools._build_range_subtitle`——LINE 在伺服器端把同一組事實
 * 組成中文字串，這裡則產出 i18n key + 參數，交給 react-i18next 用使用者在設定頁
 * 選的語言渲染。為什麼不讓後端直接回句子：API 路由沒有語言中介層，
 * `get_request_language()` 對 LIFF 請求一律回 zh-TW，選了日文的使用者會拿到中文。
 *
 * 這裡只做「渲染規則」的對應，不重算任何判定：搜到多遠、湊不湊得滿、科別對到誰、
 * 藥局最近一家多遠，全部是後端算好送來的欄位。
 */
export interface SummaryLine {
  key: string;
  params?: Record<string, string | number>;
}

/** 第一級搜尋範圍（公尺），與後端 NEARBY_SEARCH_STEPS[0] 一致。 */
const FIRST_TIER_METERS = 5000;

/** 公尺轉公里字串，整數不留小數點（5000 → "5"，2500 → "2.5"）。 */
export function formatKm(meters: number): string {
  const km = meters / 1000;
  return Number.isInteger(km) ? String(km) : String(Number(km.toFixed(1)));
}

/** 無條件進位到整數公里。用於「最遠 / 最近一家在幾公里外」這種要保守估的數字。 */
export function ceilKm(meters: number): number {
  return Math.ceil(meters / 1000);
}

/** 卡片上的距離文字。1 公里以下用公尺，才不會出現「0.3 km」這種難以換算的說法。 */
export function formatDistance(meters?: number | null): string | null {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * 有結果時的說明句。
 *
 * 順序即優先序，與後端一致：
 * 1. 要求營業中卻一家都沒開 —— 比搜尋範圍重要，先講。
 * 2. 要求營業中且有開的。
 * 3. 湊不滿目標筆數 —— 重點是「我已經找到這麼遠了」，所以報搜尋上限。
 * 4. 曾放寬到第一級以外 —— 報最遠院所的實際距離而非階梯級距：階梯跳到 50 公里
 *    不代表使用者真的要跑 50 公里，實際最遠可能只有 27 公里，講級距會讓人
 *    高估交通成本。
 * 5. 第一級內就湊滿。
 *
 * 之後再視情況追加科別別名與藥局資料缺口兩句補充。
 */
export function buildResultSummary(result: NearbyHospitalsResponse): SummaryLine[] {
  const count = result.count;
  const lines: SummaryLine[] = [];

  if (result.open_now_fallback) {
    lines.push({ key: 'nearby.summary.openNowNone' });
  } else if (result.open_now_requested) {
    lines.push({ key: 'nearby.summary.openNowFound', params: { count } });
  } else if (!result.satisfied) {
    lines.push({
      key: 'nearby.summary.partial',
      params: { radiusKm: formatKm(result.reached_meters), count },
    });
  } else if (result.expanded) {
    lines.push({
      key: 'nearby.summary.expanded',
      params: {
        radiusKm: ceilKm(result.furthest_meters ?? result.reached_meters),
        count,
      },
    });
  } else {
    lines.push({
      key: 'nearby.summary.foundWithin',
      params: { radiusKm: formatKm(FIRST_TIER_METERS), count },
    });
  }

  // 使用者說的科別與部定專科不同時，必須誠實說明這層對應，否則使用者會以為
  // 系統真的有「腸胃科」這個分類，而非把它併進了「內科」。
  if (result.department?.is_alias) {
    lines.push({
      key: 'nearby.summary.departmentAlias',
      params: {
        requested: result.department.requested,
        canonical: result.department.canonical,
      },
    });
  }

  // 藥局收錄量遠低於實際家數（資料庫 116 家，全台數千家），「查到了但很遠」時
  // 卡片看起來完全正常，實際是資料缺口撐出來的結果，必須揭露。
  if (result.pharmacy_data_gap_meters != null) {
    lines.push({
      key: 'nearby.summary.pharmacyDataGap',
      params: { radiusKm: ceilKm(result.pharmacy_data_gap_meters) },
    });
  }

  return lines;
}

/**
 * 沒有結果時該說哪一句。
 *
 * 「看不懂你說的科別／類型」與「附近真的沒有」是兩件完全不同的事：前者混進後者，
 * 使用者會以為系統聽懂了他的需求、只是附近剛好沒有，於是放棄換個說法再問。
 */
export function buildEmptyStateMessage(result: NearbyHospitalsResponse): SummaryLine {
  if (result.unresolved_department) {
    return {
      key: 'nearby.empty.unknownDepartment',
      params: { department: result.unresolved_department },
    };
  }
  if (result.unresolved_facility_type) {
    return {
      key: 'nearby.empty.unknownFacilityType',
      params: { facilityType: result.unresolved_facility_type },
    };
  }
  // 藥局查無結果多半是「本系統沒收錄」而非「附近真的沒有」，通用文案會誤導。
  if (result.facility_type?.category === '藥局') {
    return {
      key: 'nearby.empty.pharmacyNone',
      params: { radiusKm: formatKm(result.max_meters) },
    };
  }
  if (result.department) {
    return {
      key: 'nearby.empty.department',
      params: {
        department: result.department.requested,
        radiusKm: formatKm(result.max_meters),
      },
    };
  }
  return {
    key: 'nearby.empty.none',
    params: { radiusKm: formatKm(result.max_meters) },
  };
}
