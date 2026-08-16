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
});
