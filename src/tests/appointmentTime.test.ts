import { describe, expect, it } from 'vitest';
import {
  buildAppointmentAt, clinicDayFor, formatNotifyTime, formatOffset, hourHint, isAppointmentDay,
  isPast, isWithinSlots, parseAppointmentAt, relativeDay, weekdayOf,
} from '../utils/appointmentTime';
import type { ClinicDaySchedule, ClinicTimeSlot } from '../types/medical';

describe('parseAppointmentAt', () => {
  it('照字串取出日期、時間與 offset，不經裝置時區換算', () => {
    expect(parseAppointmentAt('2026-09-15T09:30:00+08:00')).toEqual({
      date: '2026-09-15',
      time: '09:30',
      month: 9,
      day: 15,
      weekday: 'tuesday',
      offset: '+08:00',
      offsetMinutes: 480,
    });
  });

  it('Z 正規化成 +00:00，負 offset 也算得對', () => {
    expect(parseAppointmentAt('2026-09-15T09:30:00Z')?.offset).toBe('+00:00');
    expect(parseAppointmentAt('2026-09-15T09:30:00-03:30')?.offsetMinutes).toBe(-210);
  });

  it('格式不對時回 null，讓呈現面退回原字串而不是崩潰', () => {
    expect(parseAppointmentAt('明天早上九點')).toBeNull();
    // 沒有 offset 的時間後端會擋成 400，這裡也不當作合法格式
    expect(parseAppointmentAt('2026-09-15T09:30:00')).toBeNull();
  });
});

describe('isAppointmentDay', () => {
  const iso = '2026-09-15T09:30:00+08:00';

  it('以門診自己的 offset 判斷「今天」，不是裝置時區', () => {
    // UTC 9/14 17:00＝台灣 9/15 01:00，是門診當天
    expect(isAppointmentDay(iso, Date.parse('2026-09-14T17:00:00Z'))).toBe(true);
    // UTC 9/14 15:00＝台灣 9/14 23:00，還是前一天
    expect(isAppointmentDay(iso, Date.parse('2026-09-14T15:00:00Z'))).toBe(false);
  });

  it('門診當天看完之後到午夜前都還算當天', () => {
    expect(isAppointmentDay(iso, Date.parse('2026-09-15T23:59:00+08:00'))).toBe(true);
    expect(isAppointmentDay(iso, Date.parse('2026-09-16T00:00:00+08:00'))).toBe(false);
  });
});

describe('relativeDay', () => {
  it('以門診自己的 offset 判斷今天、明天', () => {
    const now = Date.parse('2026-09-14T23:30:00+08:00');
    expect(relativeDay('2026-09-14T09:30:00+08:00', now)).toBe('today');
    expect(relativeDay('2026-09-15T09:30:00+08:00', now)).toBe('tomorrow');
    expect(relativeDay('2026-09-16T09:30:00+08:00', now)).toBeNull();
    expect(relativeDay('不是時間', now)).toBeNull();
  });
});

describe('isPast', () => {
  it('以瞬間比較，不同 offset 也正確', () => {
    const now = Date.parse('2026-09-15T08:40:00+08:00');
    expect(isPast('2026-09-15T08:00:00+08:00', now)).toBe(true);
    expect(isPast('2026-09-15T09:30:00+08:00', now)).toBe(false);
    // 同一瞬間的另一種寫法：UTC 00:30＝台灣 08:30，已經過了
    expect(isPast('2026-09-15T00:30:00Z', now)).toBe(true);
  });
});

describe('clinicDayFor／isWithinSlots', () => {
  const wednesdaySlots: ClinicTimeSlot[] = [
    { open: '08:30', close: '12:00' },
    { open: '13:30', close: '17:30' },
  ];
  const clinicTime: Record<string, ClinicDaySchedule> = {
    wednesday: { isClosed: false, slots: wednesdaySlots },
    friday: { isClosed: false, slots: [] },
    sunday: { isClosed: true, slots: [] },
  };

  const slotsOf = (date: string) => {
    const day = clinicDayFor(clinicTime, date);
    return day.kind === 'open' ? day.slots : [];
  };

  it('依日期的星期取出那天的時段', () => {
    expect(weekdayOf('2026-09-16')).toBe('wednesday');
    expect(clinicDayFor(clinicTime, '2026-09-16')).toEqual({ kind: 'open', slots: wednesdaySlots });
  });

  it('休診與查不到分開回報：兩者都要提示，但說法不同', () => {
    expect(clinicDayFor(clinicTime, '2026-09-20')).toEqual({ kind: 'closed' }); // 週日，標成休診
    expect(clinicDayFor(clinicTime, '2026-09-17')).toEqual({ kind: 'unknown' }); // 週四，沒有資料
    expect(clinicDayFor(clinicTime, '2026-09-18')).toEqual({ kind: 'unknown' }); // 週五，有資料但沒時段
    expect(clinicDayFor(null, '2026-09-16')).toEqual({ kind: 'unknown' });
  });

  it('時段兩端都算在內，12:00 的診不該被警告', () => {
    const slots = slotsOf('2026-09-16');
    expect(isWithinSlots('08:30', slots)).toBe(true);
    expect(isWithinSlots('12:00', slots)).toBe(true);
    expect(isWithinSlots('09:47', slots)).toBe(true);
    expect(isWithinSlots('12:30', slots)).toBe(false);
    expect(isWithinSlots('19:00', slots)).toBe(false);
  });
});

describe('hourHint', () => {
  it('24 小時制的時對到口語時段與 12 小時制的數字', () => {
    // 回報的 bug：14:00、19:00 被原生時間欄顯示成 2:00、7:00
    expect(hourHint(14)).toEqual({ period: 'afternoon', hour12: 2 });
    expect(hourHint(19)).toEqual({ period: 'evening', hour12: 7 });
    expect(hourHint(8)).toEqual({ period: 'morning', hour12: 8 });
    // 中午與午夜是 Intl 的 hour12 會寫錯（下午12時／上午12時）的兩個點
    expect(hourHint(12)).toEqual({ period: 'noon', hour12: 12 });
    expect(hourHint(0)).toEqual({ period: 'earlyMorning', hour12: 12 });
  });
});

describe('formatNotifyTime', () => {
  it('與門診同一天只顯示時間，跨日才加月日', () => {
    expect(formatNotifyTime('2026-09-15T08:30:00+08:00', '2026-09-15')).toBe('08:30');
    // 00:30 的診，T-1h 在前一晚——只寫 23:30 會被讀成當天晚上
    expect(formatNotifyTime('2026-09-14T23:30:00+08:00', '2026-09-15')).toBe('9/14 23:30');
  });
});

describe('buildAppointmentAt／formatOffset', () => {
  it('組出後端要求的帶 offset 格式', () => {
    expect(formatOffset(480)).toBe('+08:00');
    expect(formatOffset(0)).toBe('+00:00');
    expect(formatOffset(-210)).toBe('-03:30');
    expect(buildAppointmentAt('2026-09-16', '09:47', '+08:00')).toBe('2026-09-16T09:47:00+08:00');
  });
});
