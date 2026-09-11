import { describe, expect, it } from 'vitest';
import { buildEntries, computeDefaults, findEmptyEnabledTiming } from '../pages/Medications/slotEntryForm';
import type { Medication, MedicationReminder, ReminderEntry } from '../types/medication';

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

describe('computeDefaults', () => {
  it('依既有條目算出開關、時間與指派', () => {
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
      { meal_timing: 'none', scheduled_time: '07:30', medication_ids: ['m-c'] },
    ]);

    const defaults = computeDefaults('morning', reminder);

    expect(defaults.before).toEqual({ enabled: true, time: '07:30' });
    expect(defaults.after).toEqual({ enabled: true, time: '08:30' });
    expect(defaults.assignments).toEqual({
      'm-a': 'before_meal',
      'm-b': 'after_meal',
      'm-c': null,
    });
  });

  it('沒有既有規則時兩個時機都關閉，時間套用該時段的預設值', () => {
    const defaults = computeDefaults('evening', undefined);

    expect(defaults.before).toEqual({ enabled: false, time: '18:00' });
    expect(defaults.after).toEqual({ enabled: false, time: '18:00' });
    expect(defaults.assignments).toEqual({});
  });
});

describe('buildEntries', () => {
  it('飯前飯後都有指派時，依 before → after 順序輸出', () => {
    const medA = makeMedication('m-a');
    const medB = makeMedication('m-b');
    const entries = buildEntries('morning', undefined, [medA, medB], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: true, time: '08:30' },
      assignments: { 'm-a': 'before_meal', 'm-b': 'after_meal' },
    });

    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
    ]);
  });

  it('既有 none 條目維持它原本的時刻，不是取最早啟用時機', () => {
    // 既有規則：飯前 07:30 掛 A、其他（none）09:00 掛 C（例如藥袋辨識掛上、
    // 使用者從未特別指派）。這次只調整了時間，C 仍未指派。
    const medA = makeMedication('m-a');
    const medC = makeMedication('m-c');
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:00', medication_ids: ['m-a'] },
      { meal_timing: 'none', scheduled_time: '09:00', medication_ids: ['m-c'] },
    ]);

    const entries = buildEntries('morning', reminder, [medA, medC], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: false, time: '08:00' },
      assignments: { 'm-a': 'before_meal', 'm-c': null },
    });

    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'none', scheduled_time: '09:00', medication_ids: ['m-c'] },
    ]);
  });

  it('未指派但原本屬於這筆規則的藥品，落入 none 條目（取最早啟用時機，因為原本沒有 none 條目）', () => {
    const medA = makeMedication('m-a');
    const medB = makeMedication('m-b');
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: ['m-b'] },
    ]);

    // 使用者把 B 從飯後移除指派（未指派），但 B 原本就屬於這筆規則
    const entries = buildEntries('morning', reminder, [medA, medB], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: true, time: '08:30' },
      assignments: { 'm-a': 'before_meal', 'm-b': null },
    });

    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'after_meal', scheduled_time: '08:30', medication_ids: [] },
      { meal_timing: 'none', scheduled_time: '07:30', medication_ids: ['m-b'] },
    ]);
  });

  it('全新、從未指派過的藥品維持未指派，不進 none 條目', () => {
    const medA = makeMedication('m-a');
    const medNew = makeMedication('m-new');
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
    ]);

    // m-new 從未出現在這筆規則的任何條目裡，這次也沒指派
    const entries = buildEntries('morning', reminder, [medA, medNew], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: false, time: '08:00' },
      assignments: { 'm-a': 'before_meal', 'm-new': null },
    });

    expect(entries).toEqual([{ meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] }]);
  });

  it('即使既有規則本來就有 none 條目，這次結算下來沒有藥落在 none 時就不輸出空的 none 條目', () => {
    const medA = makeMedication('m-a');
    const medC = makeMedication('m-c');
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'none', scheduled_time: '09:00', medication_ids: ['m-c'] },
    ]);

    // 使用者這次把原本在 none 的 C 也指派到飯前，none 應該整個消失，
    // 不能因為「舊規則有 none」就硬生出一個 medication_ids: [] 的空條目
    // ——空條目會把規則最早觸發時刻往前拉，卻沒有任何藥可以顯示。
    const entries = buildEntries('morning', reminder, [medA, medC], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: false, time: '08:00' },
      assignments: { 'm-a': 'before_meal', 'm-c': 'before_meal' },
    });

    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a', 'm-c'] },
    ]);
  });

  it('藥品清單缺席／載入失敗時，仍保留既有規則掛著的藥品指派，不會被目前的清單篩掉', () => {
    // 這是 review fix 1 的回歸測試：medications 傳入空陣列（模擬 GET /medications
    // 失敗或還沒回來），但既有規則已經掛著 A（飯前）與 B（未指派、原屬本規則）。
    const reminder = makeReminder([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'none', scheduled_time: '07:30', medication_ids: ['m-b'] },
    ]);

    const entries = buildEntries('morning', reminder, [], {
      before: { enabled: true, time: '07:30' },
      after: { enabled: false, time: '08:00' },
      assignments: { 'm-a': 'before_meal', 'm-b': null },
    });

    expect(entries).toEqual([
      { meal_timing: 'before_meal', scheduled_time: '07:30', medication_ids: ['m-a'] },
      { meal_timing: 'none', scheduled_time: '07:30', medication_ids: ['m-b'] },
    ]);
  });

  it('兩個時機都沒開啟時不輸出任何條目（呼叫端的驗證應該先擋下這種情況）', () => {
    const entries = buildEntries('morning', undefined, [], {
      before: { enabled: false, time: '08:00' },
      after: { enabled: false, time: '08:00' },
      assignments: {},
    });

    expect(entries).toEqual([]);
  });
});

describe('findEmptyEnabledTiming', () => {
  // final review item 2：開啟但沒指派藥品的時機，若放任存檔，buildEntries
  // 仍會老實產生一個空條目，後端據此把 timeout_anchor_time 訂在它的時刻，
  // 可能拖慢真正掛著藥的那個時機的 T+20/T+30 升級。

  it('飯後開啟但沒有指派、飯前有藥時，回傳 after_meal', () => {
    const result = findEmptyEnabledTiming(
      {
        before: { enabled: true, time: '07:30' },
        after: { enabled: true, time: '08:30' },
        assignments: { 'm-a': 'before_meal' },
      },
      new Set(),
    );

    expect(result).toBe('after_meal');
  });

  it('兩個時機都沒有指派任何藥品時回傳 null（純時間提醒，允許存檔）', () => {
    const result = findEmptyEnabledTiming(
      {
        before: { enabled: true, time: '07:30' },
        after: { enabled: true, time: '08:30' },
        assignments: {},
      },
      new Set(),
    );

    expect(result).toBeNull();
  });

  it('兩個時機都有藥時回傳 null', () => {
    const result = findEmptyEnabledTiming(
      {
        before: { enabled: true, time: '07:30' },
        after: { enabled: true, time: '08:30' },
        assignments: { 'm-a': 'before_meal', 'm-b': 'after_meal' },
      },
      new Set(),
    );

    expect(result).toBeNull();
  });

  it('未開啟的時機即使沒有藥也不算違規', () => {
    const result = findEmptyEnabledTiming(
      {
        before: { enabled: true, time: '07:30' },
        after: { enabled: false, time: '08:30' },
        assignments: { 'm-a': 'before_meal' },
      },
      new Set(),
    );

    expect(result).toBeNull();
  });

  it('未指派但原屬本規則、會落入 none 的藥品，也算另一個條目有藥', () => {
    // m-c 原本就屬於這筆規則（priorNoneIds 有它），這次沒特別指派，
    // buildEntries 會把它放進 none 條目——飯後開著卻沒有藥，一樣要擋。
    const result = findEmptyEnabledTiming(
      {
        before: { enabled: false, time: '07:30' },
        after: { enabled: true, time: '08:30' },
        assignments: { 'm-c': null },
      },
      new Set(['m-c']),
    );

    expect(result).toBe('after_meal');
  });
});
