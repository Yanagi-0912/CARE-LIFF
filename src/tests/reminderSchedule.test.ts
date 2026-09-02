import { describe, expect, it } from 'vitest';
import { isReminderSchedulable, nearestSlot } from '../pages/Medications/reminderSchedule';
import type { MedicationReminder } from '../types/medication';

const TODAY = '2026-08-11';

function makeReminder(overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  return {
    id: 'r-1',
    creator_user_id: 'U-family',
    user_id: 'U-patient',
    slot_type: 'morning',
    scheduled_time: '08:00',
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

// 編輯視窗靠這個函式決定「時間改到別的時段範圍時，時段要跳去哪」。它刻意不用
// 「早上是 05:00–10:59」這類區間——那些界線在這個專案裡沒有依據；改用離各時段
// 預設時間（08:00／12:00／18:00／21:30）最近的那個，全部由後端既有的常數推導。
describe('nearestSlot', () => {
  it.each([
    ['08:00', 'morning'],
    ['12:00', 'noon'],
    ['18:00', 'evening'],
    ['21:30', 'bedtime'],
  ])('預設時間 %s 對應到自己的時段', (time, slot) => {
    expect(nearestSlot(time)).toBe(slot);
  });

  it.each([
    ['07:15', 'morning'],
    ['13:30', 'noon'],
    ['19:45', 'evening'],
    ['22:40', 'bedtime'],
  ])('%s 落在最接近的時段', (time, slot) => {
    expect(nearestSlot(time)).toBe(slot);
  });

  it.each([
    ['23:50', 'bedtime'],
    ['00:30', 'bedtime'],
    ['02:00', 'bedtime'],
  ])('%s 以環狀距離計算，深夜屬於睡前而不是早上', (time, slot) => {
    // 一天是環狀的：00:30 離 21:30 是 3 小時，離 08:00 是 7.5 小時。少了這一步
    // 會用線性差值把深夜判成離「早」最近。
    expect(nearestSlot(time)).toBe(slot);
  });

  it.each([
    ['10:00', 'morning'],
    ['15:00', 'noon'],
  ])('等距的 %s 取時段順序中較前者', (time, slot) => {
    // 任意但確定：同一個時間永遠得到同一個答案，使用者看得到也改得掉。
    expect(nearestSlot(time)).toBe(slot);
  });
});
