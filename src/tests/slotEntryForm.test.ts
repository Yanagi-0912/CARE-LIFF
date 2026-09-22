import { describe, expect, it } from 'vitest';
import { buildEntries, computeDefaults, findEmptyEnabledTiming } from '../pages/Medications/slotEntryForm';
import type { Medication, MedicationReminder, ReminderEntry } from '../types/medication';
import type { SlotEntryFormValues } from '../pages/Medications/slotEntryForm';

function makeReminder(entries: ReminderEntry[]): MedicationReminder {
  const scheduled_time = entries[0]?.scheduled_time ?? '08:00';
  return {
    id: 'r-1',
    creator_user_id: 'U-self',
    user_id: 'U-self',
    slot_type: 'morning',
    scheduled_time,
    timeout_anchor_time: scheduled_time,
    entries,
    start_date: '2026-08-01',
    end_date: null,
    enabled: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

function makeMedication(id: string): Medication {
  return {
    id,
    user_id: 'U-self',
    created_by_user_id: 'U-self',
    name: `藥品${id}`,
    generic_name: null,
    license_number: null,
    shape: '',
    color: '',
    score_line: '',
    mark_one: '',
    mark_two: '',
    size: '',
    thumbnail_url: null,
    unit_content: null,
    total_quantity: null,
    usage_raw: null,
    frequency_code: 'QD',
    indication: null,
    spc_indication: null,
    spc_indication_summary: null,
    source: 'manual',
    start_date: '2026-08-01',
    end_date: null,
    enabled: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

/** 三個時機的表單值；沒列到的時機一律關閉、時刻 08:00 */
function values(
  timings: Partial<Record<'before_meal' | 'after_meal' | 'none', string>>,
  assignments: SlotEntryFormValues['assignments'] = {},
): SlotEntryFormValues {
  const timing = (meal: 'before_meal' | 'after_meal' | 'none') => ({
    enabled: meal in timings,
    time: timings[meal] ?? '08:00',
  });
  return {
    timings: { before_meal: timing('before_meal'), after_meal: timing('after_meal'), none: timing('none') },
    assignments,
  };
}

describe('computeDefaults', () => {
  it('依既有條目算出三個時機的開關、時間與指派', () => {
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
      { meal_timing: 'none', scheduled_time: '07:45', medication_ids: ['m-c'] },
    ]);
    expect(computeDefaults('morning', reminder)).toEqual({
      timings: {
        before_meal: { enabled: true, time: '07:30' },
        after_meal: { enabled: true, time: '08:30' },
        none: { enabled: true, time: '07:45' },
      },
      assignments: { 'm-a': 'before_meal', 'm-b': 'after_meal', 'm-c': 'none' },
    });
  });

  it('只有單一 none 條目的簡單提醒：只開「不分飯前後」，時刻照原本的', () => {
    const reminder = makeReminder([{ meal_timing: 'none', scheduled_time: '07:10', medication_ids: [] }]);
    expect(computeDefaults('morning', reminder).timings).toEqual({
      before_meal: { enabled: false, time: '08:00' },
      after_meal: { enabled: false, time: '08:00' },
      none: { enabled: true, time: '07:10' },
    });
  });

  it('沒有既有規則時預設只開「不分飯前後」，時間套用該時段的預設值', () => {
    // 長輩點進時段直接按儲存，就得到與舊簡易表單相同的單一時刻提醒
    expect(computeDefaults('bedtime')).toEqual({
      timings: {
        before_meal: { enabled: false, time: '21:30' },
        after_meal: { enabled: false, time: '21:30' },
        none: { enabled: true, time: '21:30' },
      },
      assignments: {},
    });
  });
});

describe('buildEntries', () => {
  it('依 before → after → none 順序輸出開啟中的時機', () => {
    const entries = buildEntries(
      undefined,
      [makeMedication('m-a'), makeMedication('m-b'), makeMedication('m-c')],
      values(
        { none: '07:45', after_meal: '08:30', before_meal: '07:30' },
        { 'm-a': 'before_meal', 'm-b': 'after_meal', 'm-c': 'none' },
      ),
    );
    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
      { meal_timing: 'none', scheduled_time: '07:45', medication_ids: ['m-c'] },
    ]);
  });

  it('只開「不分飯前後」且沒有藥：輸出單一 none 條目（純時間提醒）', () => {
    expect(buildEntries(undefined, [], values({ none: '07:10' }))).toEqual([
      { meal_timing: 'none', scheduled_time: '07:10', medication_ids: [] },
    ]);
  });

  it('未指派的藥品不進任何條目——即使它原本屬於這筆規則', () => {
    // 以前 none 不是可開關的時機，未指派的既有藥品會自動落進隱形的 none 條目；
    // 現在畫面上看得到 none，未指派就是使用者要把它從這個時段拿掉。
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a', 'm-b'] },
    ]);
    const entries = buildEntries(
      reminder,
      [makeMedication('m-a'), makeMedication('m-b')],
      values({ before_meal: '07:30' }, { 'm-a': 'before_meal', 'm-b': null }),
    );
    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
    ]);
  });

  it('指派到已關閉時機的藥品不會出現在任何條目', () => {
    const entries = buildEntries(
      undefined,
      [makeMedication('m-a')],
      values({ none: '08:00' }, { 'm-a': 'after_meal' }),
    );
    expect(entries).toEqual([{ meal_timing: 'none', scheduled_time: '08:00', medication_ids: [] }]);
  });

  it('藥品清單缺席／載入失敗時，仍保留既有規則掛著的藥品指派，不會被目前的清單篩掉', () => {
    const reminder = makeReminder([
      { meal_timing: 'none', scheduled_time: '08:00', medication_ids: ['m-a'] },
    ]);
    const entries = buildEntries(reminder, [], values({ none: '08:15' }, { 'm-a': 'none' }));
    expect(entries).toEqual([{ meal_timing: 'none', scheduled_time: '08:15', medication_ids: ['m-a'] }]);
  });

  it('三個時機都沒開啟時不輸出任何條目（呼叫端的驗證應該先擋下這種情況）', () => {
    expect(buildEntries(undefined, [makeMedication('m-a')], values({}, { 'm-a': null }))).toEqual([]);
  });
});

describe('findEmptyEnabledTiming', () => {
  it('飯後開啟但沒有指派、飯前有藥時，回傳 after_meal', () => {
    expect(
      findEmptyEnabledTiming(values({ before_meal: '07:30', after_meal: '08:30' }, { 'm-a': 'before_meal' })),
    ).toBe('after_meal');
  });

  it('「不分飯前後」開著卻沒藥、飯前有藥時，回傳 none', () => {
    expect(
      findEmptyEnabledTiming(values({ before_meal: '07:30', none: '08:00' }, { 'm-a': 'before_meal' })),
    ).toBe('none');
  });

  it('所有時機都沒有指派任何藥品時回傳 null（純時間提醒，允許存檔）', () => {
    expect(findEmptyEnabledTiming(values({ before_meal: '07:30', none: '08:00' }))).toBeNull();
  });

  it('每個開啟的時機都有藥時回傳 null', () => {
    expect(
      findEmptyEnabledTiming(
        values({ before_meal: '07:30', none: '08:00' }, { 'm-a': 'before_meal', 'm-b': 'none' }),
      ),
    ).toBeNull();
  });

  it('未開啟的時機即使沒有藥也不算違規；指派到未開啟時機的藥也不算數', () => {
    expect(
      findEmptyEnabledTiming(values({ before_meal: '07:30' }, { 'm-a': 'before_meal', 'm-b': 'after_meal' })),
    ).toBeNull();
  });
});
