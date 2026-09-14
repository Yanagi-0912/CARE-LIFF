import { describe, expect, it } from 'vitest';
import {
  frequentHospitals, needsAttention, seedFromAppointment,
} from '../utils/appointmentHistory';
import type { AppointmentReminder } from '../types/appointment';

function makeAppointment(overrides: Partial<AppointmentReminder> = {}): AppointmentReminder {
  return {
    id: 'a-1',
    user_id: 'U-self',
    creator_user_id: 'U-self',
    appointment_at: '2026-09-15T09:30:00+08:00',
    facility_id: 'fac-1',
    hospital_name: '臺大醫院',
    hospital_address: '臺北市中正區中山南路7號',
    hospital_phone: '0223123456',
    department: '心臟內科',
    doctor_name: '林建宏',
    serial_number: '23',
    note: '記得帶健保卡',
    status: 'scheduled',
    departed_at: null,
    departed_by_user_id: null,
    attended_at: null,
    attended_by_user_id: null,
    enabled: true,
    notify_at: [],
    created_at: '2026-09-01T10:00:00+08:00',
    updated_at: '2026-09-01T10:00:00+08:00',
    ...overrides,
  };
}

/** 9/15 09:30 臺大心臟內科，沒去成 */
const missed = makeAppointment({ id: 'missed', status: 'missed' });

describe('needsAttention', () => {
  it('以門診自己的日期算 7 天：9/15 的門診顯示到 9/22 當天結束，9/23 起不再列出', () => {
    expect(needsAttention([missed], Date.parse('2026-09-16T08:00:00+08:00'))).toEqual([missed]);
    expect(needsAttention([missed], Date.parse('2026-09-22T23:59:00+08:00'))).toEqual([missed]);
    expect(needsAttention([missed], Date.parse('2026-09-23T00:00:00+08:00'))).toEqual([]);
  });

  it('只列未到診：已到診、已取消的不需要處理', () => {
    const now = Date.parse('2026-09-16T08:00:00+08:00');
    const list = [
      makeAppointment({ id: 'attended', status: 'attended' }),
      makeAppointment({ id: 'cancelled', status: 'cancelled' }),
      missed,
    ];

    expect(needsAttention(list, now).map((a) => a.id)).toEqual(['missed']);
  });

  it('同醫院同科已經有下一次、沒取消的掛號，就算改約過了，不再列出', () => {
    const now = Date.parse('2026-09-16T08:00:00+08:00');
    const rebooked = makeAppointment({ id: 'next', appointment_at: '2026-09-22T10:00:00+08:00' });

    expect(needsAttention([missed, rebooked], now)).toEqual([]);
  });

  it('下一次是已取消的、別的科、或是更早的，都不算改約過', () => {
    const now = Date.parse('2026-09-16T08:00:00+08:00');
    const cancelledNext = makeAppointment({
      id: 'cancelled-next',
      appointment_at: '2026-09-22T10:00:00+08:00',
      status: 'cancelled',
    });
    const otherDepartment = makeAppointment({
      id: 'other-dept',
      appointment_at: '2026-09-22T11:00:00+08:00',
      department: '家庭醫學科',
    });
    const earlier = makeAppointment({
      id: 'earlier',
      appointment_at: '2026-08-25T10:00:00+08:00',
      status: 'attended',
    });

    expect(
      needsAttention([missed, cancelledNext, otherDepartment, earlier], now).map((a) => a.id),
    ).toEqual(['missed']);
  });

  it('手動輸入的院所（沒有 facility_id）以院名比對，忽略空白', () => {
    const now = Date.parse('2026-09-16T08:00:00+08:00');
    const manualMissed = makeAppointment({
      id: 'manual-missed',
      facility_id: null,
      hospital_name: '仁愛診所',
      status: 'missed',
    });
    const manualNext = makeAppointment({
      id: 'manual-next',
      facility_id: null,
      hospital_name: ' 仁愛 診所 ',
      appointment_at: '2026-09-22T10:00:00+08:00',
    });

    expect(needsAttention([manualMissed, manualNext], now)).toEqual([]);
  });

  it('新的在上面', () => {
    const now = Date.parse('2026-09-16T08:00:00+08:00');
    const olderMissed = makeAppointment({
      id: 'older',
      appointment_at: '2026-09-11T10:00:00+08:00',
      department: '骨科',
      status: 'missed',
    });

    expect(needsAttention([olderMissed, missed], now).map((a) => a.id)).toEqual([
      'missed',
      'older',
    ]);
  });
});

describe('frequentHospitals', () => {
  it('同一個 facility_id 算同一家；次數多的在前，次數相同時最近的在前', () => {
    const list = [
      makeAppointment({ id: '1', facility_id: 'fac-1', appointment_at: '2026-07-01T10:00:00+08:00' }),
      makeAppointment({ id: '2', facility_id: 'fac-1', appointment_at: '2026-08-01T10:00:00+08:00' }),
      makeAppointment({
        id: '3',
        facility_id: 'fac-2',
        hospital_name: '馬偕紀念醫院',
        appointment_at: '2026-09-20T10:00:00+08:00',
      }),
      makeAppointment({
        id: '4',
        facility_id: 'fac-3',
        hospital_name: '國泰綜合醫院',
        appointment_at: '2026-06-01T10:00:00+08:00',
      }),
    ];

    expect(frequentHospitals(list).map((h) => h.name)).toEqual([
      '臺大醫院',
      '馬偕紀念醫院',
      '國泰綜合醫院',
    ]);
  });

  it('沒有 facility_id 的（手動輸入）以院名分組，忽略空白與大小寫', () => {
    const list = [
      makeAppointment({ id: '1', facility_id: null, hospital_name: '仁愛診所' }),
      makeAppointment({ id: '2', facility_id: null, hospital_name: ' 仁愛 診所 ' }),
    ];

    const result = frequentHospitals(list);
    expect(result).toHaveLength(1);
    expect(result[0].facilityId).toBeNull();
  });

  it('已取消的不算：那一次並沒有去', () => {
    const list = [
      makeAppointment({ id: '1', status: 'cancelled' }),
      makeAppointment({ id: '2', facility_id: 'fac-2', hospital_name: '馬偕紀念醫院' }),
    ];

    expect(frequentHospitals(list).map((h) => h.name)).toEqual(['馬偕紀念醫院']);
  });

  it('名稱與地址以最近一筆為準，並且最多列出 limit 家', () => {
    const list = [
      makeAppointment({ id: '1', hospital_name: '台大醫院', appointment_at: '2026-07-01T10:00:00+08:00' }),
      makeAppointment({ id: '2', hospital_name: '臺大醫院', appointment_at: '2026-08-01T10:00:00+08:00' }),
      makeAppointment({ id: '3', facility_id: 'fac-2', hospital_name: '馬偕紀念醫院' }),
    ];

    const result = frequentHospitals(list, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('臺大醫院');
  });
});

describe('seedFromAppointment', () => {
  it('帶入醫院、科別、醫師；不帶看診號與備註（那是上一次的）', () => {
    const seed = seedFromAppointment(makeAppointment());

    expect(seed).toEqual({
      facilityId: 'fac-1',
      hospitalName: '臺大醫院',
      hospitalAddress: '臺北市中正區中山南路7號',
      hospitalPhone: '0223123456',
      department: '心臟內科',
      doctorName: '林建宏',
    });
    expect(seed).not.toHaveProperty('serialNumber');
    expect(seed).not.toHaveProperty('note');
  });
});
