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
});
