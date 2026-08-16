import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_DIRECT_LIST_LIMIT,
  narrowCandidates,
} from '../pages/Medications/candidateNarrowing';
import type { DrugCandidate } from '../types/prescription';

function candidate(overrides: Partial<DrugCandidate>): DrugCandidate {
  return {
    license_number: 'LIC',
    name_zh: '藥品',
    shape: '',
    color: '',
    score_line: '',
    mark_one: '',
    mark_two: '',
    size: '',
    thumbnail_url: null,
    ...overrides,
  };
}

function many(n: number, color: string, shape: string, prefix: string): DrugCandidate[] {
  return Array.from({ length: n }, (_, i) =>
    candidate({ license_number: `${prefix}-${i}`, color, shape }),
  );
}

describe('narrowCandidates（純邏輯：候選過多時以外觀屬性漸進收窄）', () => {
  it('候選數在上限內時，直接可挑選，不詢問任何屬性', () => {
    const candidates = many(CANDIDATE_DIRECT_LIST_LIMIT, '白色', '圓形', 'A');
    const result = narrowCandidates(candidates, { color: null, shape: null });
    expect(result).toEqual({ stage: 'pick', candidates });
  });

  it('超過上限且顏色有分歧時，先問顏色', () => {
    const candidates = [...many(4, '白色', '圓形', 'W'), ...many(3, '粉紅色', '橢圓形', 'P')];
    const result = narrowCandidates(candidates, { color: null, shape: null });
    expect(result.stage).toBe('ask-color');
    if (result.stage === 'ask-color') {
      expect(result.options).toEqual(['白色', '粉紅色']);
    }
  });

  it('顏色只有一種、無法用顏色分歧時，跳過顏色改問形狀', () => {
    const candidates = [...many(4, '白色', '圓形', 'A'), ...many(3, '白色', '橢圓形', 'B')];
    const result = narrowCandidates(candidates, { color: null, shape: null });
    expect(result.stage).toBe('ask-shape');
    if (result.stage === 'ask-shape') {
      expect(result.options).toEqual(['圓形', '橢圓形']);
    }
  });

  it('選定顏色後若已收窄到上限內，直接呈現可挑選的候選', () => {
    const white = many(4, '白色', '圓形', 'W');
    const candidates = [...white, ...many(3, '粉紅色', '橢圓形', 'P')];
    const result = narrowCandidates(candidates, { color: '白色', shape: null });
    expect(result).toEqual({ stage: 'pick', candidates: white });
  });

  it('選定顏色後仍超過上限，且形狀有分歧時，接著問形狀', () => {
    const candidates = [
      ...many(3, '白色', '圓形', 'WR'),
      ...many(3, '白色', '橢圓形', 'WO'),
      ...many(3, '粉紅色', '圓形', 'PR'),
    ];
    const result = narrowCandidates(candidates, { color: '白色', shape: null });
    expect(result.stage).toBe('ask-shape');
    if (result.stage === 'ask-shape') {
      expect(result.options).toEqual(['圓形', '橢圓形']);
    }
  });

  it('顏色與形狀都選定後仍收窄到上限內，呈現可挑選的候選', () => {
    const target = many(3, '白色', '圓形', 'WR');
    const candidates = [...target, ...many(3, '白色', '橢圓形', 'WO')];
    const result = narrowCandidates(candidates, { color: '白色', shape: '圓形' });
    expect(result).toEqual({ stage: 'pick', candidates: target });
  });

  it('用盡顏色與形狀仍超過上限時，退回純文字（too-many）', () => {
    const candidates = many(8, '白色', '圓形', 'M');
    const result = narrowCandidates(candidates, { color: null, shape: null });
    // 顏色與形狀都只有一種，兩者皆問不出分歧，應直接落到 too-many。
    expect(result).toEqual({ stage: 'too-many' });
  });

  it('顏色與形狀都選定但候選依然超過上限時，退回純文字（too-many）', () => {
    const candidates = many(8, '白色', '圓形', 'M');
    const result = narrowCandidates(candidates, { color: '白色', shape: '圓形' }, 5);
    expect(result).toEqual({ stage: 'too-many' });
  });

  it('可自訂上限（不依賴模組預設值）', () => {
    // 三種顏色各一張，顏色問得出分歧，只是上限剛好卡在 3 這個邊界上。
    const candidates = [
      ...many(1, '白色', '圓形', 'W'),
      ...many(1, '紅色', '圓形', 'R'),
      ...many(1, '藍色', '圓形', 'B'),
    ];
    expect(narrowCandidates(candidates, { color: null, shape: null }, 2).stage).toBe('ask-color');
    expect(narrowCandidates(candidates, { color: null, shape: null }, 3)).toEqual({
      stage: 'pick',
      candidates,
    });
  });

  // C2：全庫只有 6,095/66,478 筆藥證記錄顏色，多候選集合裡佔多數的是
  // 「沒記錄顏色」的候選，不是「記錄成別的顏色」——依顏色篩選時這些候選
  // 要留在集合裡，不能被當成「不符合」排除掉。
  //
  // 這個測試必須真的走到篩選那一步才有意義：候選總數要超過上限（否則
  // narrowCandidates 在第一行就直接回傳，篩選邏輯根本不會被呼叫），
  // filters.color 也要真的帶一個值（否則走的是「還沒篩選」的原樣分支，
  // 一樣不會呼叫比對函式）。同時混入一組「真的是別的顏色」的候選，
  // 讓斷言能分辨「缺席被當成未知（正確：未知保留、別的顏色被篩掉）」
  // 與「缺席被當成不符合（錯誤：未知跟別的顏色一起被篩掉）」——只驗證
  // 篩完還剩幾筆不夠，篩剩的必須是「白色＋未知」這個特定集合。
  it('依顏色篩選時，缺少顏色資料的候選視為未知而保留，記錄成別的顏色則正常排除（C2）', () => {
    const white = many(2, '白色', '圓形', 'W');
    const unknown = many(2, '', '圓形', 'U');
    const pink = many(3, '粉紅色', '圓形', 'P');
    const candidates = [...white, ...unknown, ...pink]; // 7 筆，超過上限 5

    const result = narrowCandidates(candidates, { color: '白色', shape: null }, 5);

    // 白色（相符）與未知（缺席，視為未知）留下共 4 筆；粉紅色（記錄成
    // 別的顏色，真的不符合）3 筆被排除，4 <= 5，直接進入可挑選階段。
    expect(result).toEqual({ stage: 'pick', candidates: [...white, ...unknown] });
  });

  // 同一條規則在第二層篩選（形狀）也要成立：顏色篩完仍超過上限、且形狀
  // 問得出分歧時，缺少形狀資料的候選一樣要在形狀篩選時被保留。這裡直接
  // 帶入兩個篩選值（模擬使用者已經依序回答完顏色與形狀），確定會真的
  // 執行到 byShape 那一段比對，而不是停在中途的某個提早回傳。
  it('依形狀篩選時，缺少形狀資料的候選同樣視為未知而保留（C2）', () => {
    const round = many(2, '白色', '圓形', 'R');
    const unknownShape = many(2, '白色', '', 'U');
    const oval = many(2, '白色', '橢圓形', 'O');
    const candidates = [...round, ...unknownShape, ...oval]; // 6 筆，超過上限 5

    const result = narrowCandidates(candidates, { color: '白色', shape: '圓形' }, 5);

    // 圓形（相符）與未知形狀（缺席，視為未知）留下共 4 筆；橢圓形（記錄
    // 成別的形狀，真的不符合）2 筆被排除。
    expect(result).toEqual({ stage: 'pick', candidates: [...round, ...unknownShape] });
  });

  // C3：食藥署原始資料的混色欄位以 ';;;' 分隔多個值（如「紅;;;白」）。
  it('候選顏色含多值分隔符時，選項各自獨立列出，且任一值相符即算符合（C3）', () => {
    const mixed = candidate({ license_number: 'MIX', color: '紅;;;白', shape: '圓形' });
    const pureWhite = candidate({ license_number: 'W1', color: '白', shape: '圓形' });
    const filler = many(4, '藍', '圓形', 'F');
    const candidates = [mixed, pureWhite, ...filler];

    const askResult = narrowCandidates(candidates, { color: null, shape: null }, 5);
    expect(askResult).toEqual({ stage: 'ask-color', options: ['紅', '白', '藍'] });

    const pickedWhite = narrowCandidates(candidates, { color: '白', shape: null }, 5);
    expect(pickedWhite.stage).toBe('pick');
    if (pickedWhite.stage === 'pick') {
      expect(pickedWhite.candidates.map((c) => c.license_number)).toEqual(['MIX', 'W1']);
    }

    const pickedRed = narrowCandidates(candidates, { color: '紅', shape: null }, 5);
    expect(pickedRed.stage).toBe('pick');
    if (pickedRed.stage === 'pick') {
      expect(pickedRed.candidates.map((c) => c.license_number)).toEqual(['MIX']);
    }
  });
});
