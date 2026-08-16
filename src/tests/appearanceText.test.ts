import { describe, expect, it } from 'vitest';
import {
  formatAppearanceMarks,
  formatAppearancePrimary,
  formatAppearanceSize,
  hasAppearanceText,
  type AppearanceFields,
} from '../pages/Medications/appearanceText';

function fields(overrides: Partial<AppearanceFields> = {}): AppearanceFields {
  return {
    shape: '',
    color: '',
    score_line: '',
    mark_one: '',
    mark_two: '',
    size: '',
    ...overrides,
  };
}

describe('formatAppearancePrimary（C4：不臆測單位，不把 size 塞進去）', () => {
  it('只組合顏色與形狀，不含尺寸', () => {
    const text = formatAppearancePrimary(fields({ color: '白色', shape: '圓形', size: '8' }), '、');
    expect(text).toBe('白色、圓形');
    // 真實資料集的 size 是裸數字（例如「8」），這裡不該原樣出現在摘要裡，
    // 更不該被附加成從未在資料或文件中出現過的「8mm」。
    expect(text).not.toContain('8');
    expect(text).not.toContain('mm');
  });

  it('缺席欄位不留空格洞', () => {
    expect(formatAppearancePrimary(fields({ color: '白色' }), '、')).toBe('白色');
    expect(formatAppearancePrimary(fields(), '、')).toBe('');
  });

  it('混色等多值欄位（;;; 分隔）拆開去重後用指定分隔符接回，不洩漏原始分隔符', () => {
    const text = formatAppearancePrimary(fields({ color: '紅;;;白', shape: '圓形' }), '、');
    expect(text).toBe('紅、白、圓形');
    expect(text).not.toContain(';;;');
  });

  it('分隔符由呼叫端指定，不寫死中文標點', () => {
    expect(formatAppearancePrimary(fields({ color: '白色', shape: '圓形' }), ', ')).toBe('白色, 圓形');
  });
});

describe('formatAppearanceSize（C4：呈現原始值，不附加未經證實的單位）', () => {
  it('回傳裸值，不加任何單位字樣', () => {
    expect(formatAppearanceSize(fields({ size: '8' }), '、')).toBe('8');
    expect(formatAppearanceSize(fields({ size: '6.5' }), '、')).toBe('6.5');
  });

  it('缺席時回傳空字串', () => {
    expect(formatAppearanceSize(fields(), '、')).toBe('');
  });

  // 回歸測試（Important 1）：真實資料集有 69 筆 size 是「10;;;10」這種
  // 同值重複的多值格式（例如「10;;;10」「9;;;9;;;9;;;9」）。前一輪修正把
  // formatAppearanceSize 從 formatAppearancePrimary 抽成獨立函式時漏了拆解
  // 這一步，直接回傳原始字串，導致畫面出現「外觀尺寸：10;;;10」——分隔符
  // 原封不動洩漏給使用者，正是 C3 要處理的那個症狀，只是換一個函式重演。
  it('多值分隔符先拆解去重，不把 ;;; 洩漏給使用者（Important 1 回歸）', () => {
    const text = formatAppearanceSize(fields({ size: '10;;;10' }), '、');
    expect(text).toBe('10');
    expect(text).not.toContain(';;;');
  });

  it('多值分隔符各值不同時，去重後個別列出', () => {
    expect(formatAppearanceSize(fields({ size: '9;;;9;;;9;;;9' }), '、')).toBe('9');
  });
});

describe('formatAppearanceMarks（C4：「無」視為缺席，不是一個標記）', () => {
  it('score_line 為「無」時不出現在結果中', () => {
    const text = formatAppearanceMarks(fields({ score_line: '無', mark_one: 'CCP' }), '、');
    expect(text).toBe('CCP');
    expect(text).not.toContain('無');
  });

  it('三個欄位皆為「無」或空白時回傳空字串', () => {
    expect(formatAppearanceMarks(fields({ score_line: '無' }), '、')).toBe('');
  });

  it('真正有記錄的刻痕（非「無」）正常呈現', () => {
    expect(formatAppearanceMarks(fields({ score_line: '一字型' }), '、')).toBe('一字型');
  });

  it('多值欄位同樣先拆解去重', () => {
    expect(formatAppearanceMarks(fields({ mark_one: 'A;;;A;;;B' }), '、')).toBe('A、B');
  });

  // 回歸測試（Important 2）：真實資料集有 63 筆 score_line 是「無;;;無」
  // 這種還沒拆解就不等於字面「無」的多值格式。前一輪的 isPresent 是拿
  // 「整個原始欄位」跟「無」比對，比對時根本還沒拆解，「無;;;無」不等於
  // 「無」因此被誤判成「有記錄」，拆解、去重後變成單一個「無」，原封不動
  // 印在畫面上——這正是 C4 原本要修的症狀，只是換了一種還沒拆解就比對的
  // 寫法又重演了一次。
  it('「無;;;無」拆解去重後仍視為缺席，不出現在結果中（Important 2 回歸）', () => {
    const text = formatAppearanceMarks(fields({ score_line: '無;;;無', mark_one: 'CCP' }), '、');
    expect(text).toBe('CCP');
    expect(text).not.toContain('無');
  });

  // 覆核者回報的逐字重現案例：score_line 全部是「無」該被濾掉，
  // mark_one／mark_two 的重複值該去重，三者接起來只剩真正有記錄的部分。
  it('逐字重現覆核者的回歸案例：無;;;無 + 重複值的 mark_one／mark_two', () => {
    const text = formatAppearanceMarks(
      fields({
        score_line: '無;;;無',
        mark_one: 'ARICEPT;;;ARICEPT',
        mark_two: '10;;;10',
      }),
      '、',
    );
    expect(text).toBe('ARICEPT、10');
    expect(text).not.toContain('無');
  });

  // 真實資料集裡也有「無」跟真實值混在同一個欄位的案例（score_line 有一筆
  // 是「無;;;直線」）——這種情況只該濾掉「無」那一部分，保留「直線」，
  // 不能因為欄位裡出現過「無」就把整個欄位當成缺席而連真實值一起丟掉。
  it('「無」與真實值混在同一個多值欄位時，只濾掉「無」，保留真實值', () => {
    const text = formatAppearanceMarks(fields({ score_line: '無;;;直線' }), '、');
    expect(text).toBe('直線');
  });
});

describe('hasAppearanceText', () => {
  it('全部欄位缺席或為「無」時回傳 false', () => {
    expect(hasAppearanceText(fields({ score_line: '無' }))).toBe(false);
  });

  it('只有 size 有值時仍回傳 true（size 雖不進 primary，仍是可呈現內容）', () => {
    expect(hasAppearanceText(fields({ size: '8' }))).toBe(true);
  });

  it('只有顏色或只有刻痕時皆回傳 true', () => {
    expect(hasAppearanceText(fields({ color: '白色' }))).toBe(true);
    expect(hasAppearanceText(fields({ mark_one: 'CCP' }))).toBe(true);
  });
});
