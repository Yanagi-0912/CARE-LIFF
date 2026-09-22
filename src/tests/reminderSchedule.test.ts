import { describe, expect, it } from 'vitest';
import { isReminderSchedulable } from '../pages/Medications/reminderSchedule';
import type { MedicationReminder } from '../types/medication';

const TODAY = '2026-08-11';

function makeReminder(overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  // entries／timeout_anchor_time 是派生欄位；這支測試只練 isReminderSchedulable
  // 這個純函式，不涉及條目內容，固定用單一 none 條目、時刻跟著
  // scheduled_time 走即可，overrides 帶了 scheduled_time 也會一併反映。
  const scheduled_time = overrides.scheduled_time ?? '08:00';
  return {
    id: 'r-1',
    creator_user_id: 'U-family',
    user_id: 'U-patient',
    slot_type: 'morning',
    scheduled_time,
    timeout_anchor_time: scheduled_time,
    entries: [{ meal_timing: 'none', scheduled_time, medication_ids: [] }],
    start_date: '2026-06-01',
    end_date: null,
    enabled: true,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// 這支檔案原本不存在：藥袋核對畫面的送出前提示（PrescriptionDraftForm）靠
// isReminderSchedulable 決定要不要提前警示「這個時段目前是關閉的」，但先前
// 134 個前端測試裡只有 enabled:false 這條分支被 prescriptionScan.test.tsx
// 間接練到——把 start_date／end_date 兩個分支整個刪掉，全部測試依然全綠。
// 這裡直接測這個純函式，把邏輯對齊後端 _is_schedulable 的每一種情況釘住，
// 尤其是「今天」這個含頭含尾的邊界。
describe('isReminderSchedulable', () => {
  it('enabled 為 true 且沒有日期限制時可排程', () => {
    expect(isReminderSchedulable(makeReminder({ enabled: true }), TODAY)).toBe(true);
  });

  it('enabled 為 false 時不可排程', () => {
    expect(isReminderSchedulable(makeReminder({ enabled: false }), TODAY)).toBe(false);
  });

  describe('end_date', () => {
    it('end_date 為昨天（已過期）時不可排程', () => {
      const reminder = makeReminder({ end_date: '2026-08-10' });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(false);
    });

    it('end_date 為今天時仍可排程（含頭含尾，今天結束的療程今天仍算有效）', () => {
      const reminder = makeReminder({ end_date: TODAY });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(true);
    });

    it('end_date 為明天（尚未到期）時可排程', () => {
      const reminder = makeReminder({ end_date: '2026-08-12' });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(true);
    });

    it('end_date 為 null（長期提醒）時不受限制', () => {
      const reminder = makeReminder({ end_date: null });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(true);
    });
  });

  describe('start_date', () => {
    it('start_date 為昨天（已開始）時可排程', () => {
      const reminder = makeReminder({ start_date: '2026-08-10' });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(true);
    });

    it('start_date 為今天時可排程（含頭含尾，今天開始的療程今天就算有效）', () => {
      const reminder = makeReminder({ start_date: TODAY });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(true);
    });

    it('start_date 為明天（尚未開始）時不可排程', () => {
      const reminder = makeReminder({ start_date: '2026-08-12' });
      expect(isReminderSchedulable(reminder, TODAY)).toBe(false);
    });
  });

  it('enabled 為 false 且 end_date 已過期時仍不可排程（兩個理由同時成立）', () => {
    const reminder = makeReminder({ enabled: false, end_date: '2026-08-10' });
    expect(isReminderSchedulable(reminder, TODAY)).toBe(false);
  });
});
