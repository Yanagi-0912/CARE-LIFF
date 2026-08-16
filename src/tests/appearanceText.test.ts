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
    expect(formatAppearanceSize(fields({ size: '8' }))).toBe('8');
    expect(formatAppearanceSize(fields({ size: '6.5' }))).toBe('6.5');
  });

  it('缺席時回傳空字串', () => {
    expect(formatAppearanceSize(fields())).toBe('');
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
