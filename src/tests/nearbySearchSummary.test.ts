import { describe, it, expect } from 'vitest';
import type { NearbyHospitalsResponse } from '../types/medical';
import {
  buildEmptyStateMessage,
  buildResultSummary,
  ceilKm,
  formatDistance,
  formatKm,
} from '../pages/NearbyHospitals/searchSummary';

/**
 * 這些說明句是「誠實揭露」的載體：擴大了範圍、湊不滿、科別被換成別的名字、
 * 藥局其實沒收錄齊——每一句漏掉，畫面看起來都一樣正常，但使用者會據此做出
 * 錯誤的判斷（以為附近真的只有 18 公里外那幾家藥局）。因此逐條釘住。
 */
function makeResult(
  overrides: Partial<NearbyHospitalsResponse> = {},
): NearbyHospitalsResponse {
  return {
    facilities: [],
    count: 5,
    reached_meters: 5000,
    satisfied: true,
    expanded: false,
    furthest_meters: 900,
    max_meters: 50000,
    open_now_requested: false,
    open_now_fallback: false,
    department: null,
    facility_type: null,
    unresolved_department: null,
    unresolved_facility_type: null,
    pharmacy_data_gap_meters: null,
    ...overrides,
  };
}

describe('公里格式化', () => {
  it('整數公里不留小數點', () => {
    expect(formatKm(5000)).toBe('5');
    expect(formatKm(50000)).toBe('50');
  });

  it('非整數保留一位小數', () => {
    expect(formatKm(2500)).toBe('2.5');
  });

  it('ceilKm 無條件進位，避免低報實際距離', () => {
    expect(ceilKm(18001)).toBe(19);
    expect(ceilKm(20000)).toBe(20);
  });

  it('一公里以下用公尺，不顯示 0.3 km', () => {
    expect(formatDistance(320)).toBe('320 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(null)).toBeNull();
  });
});

describe('搜尋結果說明句', () => {
  it('第一級內湊滿時只講找到幾家', () => {
    expect(buildResultSummary(makeResult())).toEqual([
      { key: 'nearby.summary.foundWithin', params: { radiusKm: '5', count: 5 } },
    ]);
  });

  it('擴大範圍時報最遠院所的實際距離，而非階梯級距', () => {
    // 階梯停在 20 公里但最遠其實只有 12.3 公里；報 20 會讓人高估交通成本。
    const lines = buildResultSummary(
      makeResult({ expanded: true, reached_meters: 20000, furthest_meters: 12300 }),
    );

    expect(lines[0]).toEqual({
      key: 'nearby.summary.expanded',
      params: { radiusKm: 13, count: 5 },
    });
  });

  it('湊不滿時報搜尋上限——重點是「我已經找到這麼遠了」', () => {
    const lines = buildResultSummary(
      makeResult({ satisfied: false, reached_meters: 50000, count: 2 }),
    );

    expect(lines[0]).toEqual({
      key: 'nearby.summary.partial',
      params: { radiusKm: '50', count: 2 },
    });
  });

  it('要求營業中卻一家都沒開時，這件事優先於搜尋範圍', () => {
    const lines = buildResultSummary(
      makeResult({ open_now_requested: true, open_now_fallback: true, expanded: true }),
    );

    expect(lines[0]).toEqual({ key: 'nearby.summary.openNowNone' });
  });

  it('科別是別名時追加對應說明', () => {
    const lines = buildResultSummary(
      makeResult({
        department: { requested: '腸胃科', canonical: '內科', is_alias: true },
      }),
    );

    expect(lines).toContainEqual({
      key: 'nearby.summary.departmentAlias',
      params: { requested: '腸胃科', canonical: '內科' },
    });
  });

  it('科別與部定專科同名時不加多餘說明', () => {
    const lines = buildResultSummary(
      makeResult({ department: { requested: '內科', canonical: '內科', is_alias: false } }),
    );

    expect(lines).toHaveLength(1);
  });

  it('藥局查到了但很遠時，必須揭露資料缺口', () => {
    const lines = buildResultSummary(makeResult({ pharmacy_data_gap_meters: 18000 }));

    expect(lines).toContainEqual({
      key: 'nearby.summary.pharmacyDataGap',
      params: { radiusKm: 18 },
    });
  });
});

describe('查無結果的說明', () => {
  it('看不懂科別與「附近真的沒有」必須分開講', () => {
    expect(
      buildEmptyStateMessage(makeResult({ count: 0, unresolved_department: '宇宙科' })),
    ).toEqual({
      key: 'nearby.empty.unknownDepartment',
      params: { department: '宇宙科' },
    });
  });

  it('看不懂院所類型也有專屬說明', () => {
    expect(
      buildEmptyStateMessage(makeResult({ count: 0, unresolved_facility_type: '宇宙站' })),
    ).toEqual({
      key: 'nearby.empty.unknownFacilityType',
      params: { facilityType: '宇宙站' },
    });
  });

  it('藥局查無結果用專屬文案，不用通用的「附近沒有」', () => {
    expect(
      buildEmptyStateMessage(
        makeResult({
          count: 0,
          facility_type: { requested: '藥局', category: '藥局', is_alias: false },
        }),
      ),
    ).toEqual({ key: 'nearby.empty.pharmacyNone', params: { radiusKm: '50' } });
  });

  it('指定科別但查無結果時，說明句要帶上使用者原本的說法', () => {
    expect(
      buildEmptyStateMessage(
        makeResult({
          count: 0,
          department: { requested: '腸胃科', canonical: '內科', is_alias: true },
        }),
      ),
    ).toEqual({
      key: 'nearby.empty.department',
      params: { department: '腸胃科', radiusKm: '50' },
    });
  });

  it('沒有任何條件時走通用文案', () => {
    expect(buildEmptyStateMessage(makeResult({ count: 0 }))).toEqual({
      key: 'nearby.empty.none',
      params: { radiusKm: '50' },
    });
  });
});
