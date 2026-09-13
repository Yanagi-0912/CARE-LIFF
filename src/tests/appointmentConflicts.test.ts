import { describe, expect, it } from 'vitest';
import { findAppointmentConflicts, type AppointmentDraft } from '../utils/appointmentConflicts';
import type { AppointmentReminder } from '../types/appointment';

function appt(overrides: Partial<AppointmentReminder> = {}): AppointmentReminder {
  return {
    id: 'a-1',
    user_id: 'U-self',
    creator_user_id: 'U-self',
    appointment_at: '2026-09-16T09:00:00+08:00',
    facility_id: 'fac-1',
    hospital_name: '臺大醫院',
    department: '心臟內科',
    status: 'scheduled',
    enabled: true,
    notify_at: [],
    created_at: '2026-09-14T10:00:00+08:00',
    updated_at: '2026-09-14T10:00:00+08:00',
    ...overrides,
  };
}

function draft(overrides: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return {
    appointmentAt: '2026-09-16T09:00:00+08:00',
    facilityId: 'fac-1',
    hospitalName: '臺大醫院',
    department: '心臟內科',
    ...overrides,
  };
}

describe('findAppointmentConflicts', () => {
  it('同一時間、同醫院、同科別是重複', () => {
    const existing = appt();
    expect(findAppointmentConflicts(draft(), [existing]).duplicate).toBe(existing);
  });

  it('比的是瞬間：同一刻換一種 offset 寫法仍是重複', () => {
    const existing = appt();
    expect(
      findAppointmentConflicts(draft({ appointmentAt: '2026-09-16T01:00:00Z' }), [existing])
        .duplicate,
    ).toBe(existing);
  });

  it('兩邊都有 facility_id 時只看 id：同名的連鎖分院不是重複，但時間撞在一起', () => {
    const existing = appt({ facility_id: 'branch-a', hospital_name: '仁愛診所' });
    const found = findAppointmentConflicts(
      draft({ facilityId: 'branch-b', hospitalName: '仁愛診所' }),
      [existing],
    );
    expect(found.duplicate).toBeNull();
    expect(found.sameTime).toEqual([existing]);
  });

  it('手動輸入的院所沒有 id，改比院名，並忽略空白', () => {
    const existing = appt({ facility_id: null, hospital_name: '仁愛診所', department: '家庭醫學科' });
    expect(
      findAppointmentConflicts(
        draft({ facilityId: null, hospitalName: '仁愛 診所', department: ' 家庭醫學科' }),
        [existing],
      ).duplicate,
    ).toBe(existing);
  });

  it('同一時間不同科別只算撞時間，不算重複', () => {
    const existing = appt({ department: '眼科' });
    const found = findAppointmentConflicts(draft(), [existing]);
    expect(found.duplicate).toBeNull();
    expect(found.sameTime).toEqual([existing]);
  });

  it('同一天、同醫院同科別、不同時間：可能是同一張掛號單建了兩次', () => {
    const existing = appt({ appointment_at: '2026-09-16T14:00:00+08:00' });
    const found = findAppointmentConflicts(draft(), [existing]);
    expect(found.duplicate).toBeNull();
    expect(found.sameTime).toEqual([]);
    expect(found.sameDay).toEqual([existing]);
  });

  it('不同天、已取消、或正在編輯的那一筆自己都不算', () => {
    const otherDay = appt({ id: 'a-2', appointment_at: '2026-09-17T09:00:00+08:00' });
    const cancelled = appt({ id: 'a-3', status: 'cancelled' });
    const self = appt({ id: 'a-self' });
    const found = findAppointmentConflicts(draft(), [otherDay, cancelled, self], 'a-self');
    expect(found).toEqual({ duplicate: null, sameTime: [], sameDay: [] });
  });
});
