import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { buildCommitSummary } from '../pages/Medications/commitSummary';
import type { PrescriptionCommitResult } from '../types/prescription';

function makeResult(overrides: Partial<PrescriptionCommitResult> = {}): PrescriptionCommitResult {
  return {
    medication_ids: ['m-1'],
    prn_medication_ids: [],
    reminder_ids: ['r-1'],
    reactivated_slots: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-TW');
});

// 這是本輪修正 Fix 3 的回歸測試：送出後的訊息不能只看 prn_medication_ids，
// 否則使用者剛在核對畫面被告知「這項藥不會建立定時提醒」（勾選了「這個藥
// 不用定時提醒我」），送出後卻只看到「已建立 1 項藥品與對應提醒」，前後
// 矛盾。也不能漏掉 reactivated_slots：核對畫面已經提前警示過一次，送出後
// 的訊息要用同一份事實再說一次。
describe('buildCommitSummary', () => {
  it('沒有任何藥缺提醒、也沒有重新開啟任何時段時，使用基本訊息', () => {
    const message = buildCommitSummary(i18n.t.bind(i18n), {
      result: makeResult(),
      totalCount: 2,
      noReminderCount: 0,
    });

    expect(message).toBe('已建立 2 項藥品與對應提醒');
  });

  it('有藥沒有提醒時（不論是 PRN 或使用者主動勾選不用提醒），訊息要提到這件事', () => {
    const message = buildCommitSummary(i18n.t.bind(i18n), {
      result: makeResult(),
      totalCount: 3,
      noReminderCount: 1,
    });

    expect(message).toBe('已建立 3 項藥品，其中 1 項不會有定時提醒');
  });

  it('這次提交重新開啟了某個時段時，訊息要附上這件事，且沿用核對畫面同一份事實', () => {
    const message = buildCommitSummary(i18n.t.bind(i18n), {
      result: makeResult({ reactivated_slots: ['morning'] }),
      totalCount: 1,
      noReminderCount: 0,
    });

    expect(message).toBe('已建立 1 項藥品與對應提醒 「早」的提醒已重新開啟。');
  });

  it('同時有沒提醒的藥、也重新開啟了時段時，兩件事都要出現在訊息裡', () => {
    const message = buildCommitSummary(i18n.t.bind(i18n), {
      result: makeResult({ reactivated_slots: ['morning', 'evening'] }),
      totalCount: 2,
      noReminderCount: 1,
    });

    expect(message).toBe(
      '已建立 2 項藥品，其中 1 項不會有定時提醒 「早、晚」的提醒已重新開啟。',
    );
  });

  it('冪等重放時 reactivated_slots 為空，訊息不提重新開啟這件事', () => {
    const message = buildCommitSummary(i18n.t.bind(i18n), {
      result: makeResult({ reactivated_slots: [] }),
      totalCount: 1,
      noReminderCount: 0,
    });

    expect(message).not.toContain('重新開啟');
  });
});
