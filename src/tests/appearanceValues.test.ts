import { describe, expect, it } from 'vitest';
import { appearanceValueMatches, splitAppearanceValues } from '../pages/Medications/appearanceValues';

describe('splitAppearanceValues（拆解食藥署原始資料的多值分隔符）', () => {
  it('空字串回傳空陣列', () => {
    expect(splitAppearanceValues('')).toEqual([]);
  });

  it('單一值原樣回傳', () => {
    expect(splitAppearanceValues('白色')).toEqual(['白色']);
  });

  it('以 ;;; 分隔的多值拆成個別項目，保留原始順序', () => {
    expect(splitAppearanceValues('紅;;;白')).toEqual(['紅', '白']);
  });

  it('重複值去重（例：白;;;白）', () => {
    expect(splitAppearanceValues('白;;;白')).toEqual(['白']);
  });

  it('每個值都會去除頭尾空白', () => {
    expect(splitAppearanceValues(' 紅 ;;; 白 ')).toEqual(['紅', '白']);
  });
});

describe('appearanceValueMatches（C2：未知不是不符合；C3：多值任一相符即符合）', () => {
  it('欄位缺席時視為未知，永遠符合', () => {
    expect(appearanceValueMatches('', '白色')).toBe(true);
  });

  it('單一值需要完全相符', () => {
    expect(appearanceValueMatches('白色', '白色')).toBe(true);
    expect(appearanceValueMatches('白色', '紅色')).toBe(false);
  });

  it('混色欄位只要任一值相符即算相符', () => {
    expect(appearanceValueMatches('紅;;;白', '白')).toBe(true);
    expect(appearanceValueMatches('紅;;;白', '紅')).toBe(true);
    expect(appearanceValueMatches('紅;;;白', '黃')).toBe(false);
  });

  // 「未知」的判準是「拆不出任何值」，不是「空字串」。原始資料裡有 17 筆
  // 藥證的顏色欄位只有分隔符（';;;'、';;;;;;'、';;;;;;;;;'）——非空、
  // truthy，拆完卻是空陣列。用 `if (!raw) return true` 會讓這 17 筆變成
  // 「有記錄但不符合任何顏色」，被每一個顏色答案排除掉；它們全部都有
  // 照片，等於在最需要照片的地方把候選悄悄刪掉。
  it.each([';;;', ';;;;;;', ';;;;;;;;;', '   ', ';;; ;;;'])(
    '只有分隔符或空白的欄位（%s）拆不出值，一律視為未知而非不符合',
    (raw) => {
      expect(splitAppearanceValues(raw)).toEqual([]);
      expect(appearanceValueMatches(raw, '白色')).toBe(true);
      expect(appearanceValueMatches(raw, '紅色')).toBe(true);
    },
  );
});
