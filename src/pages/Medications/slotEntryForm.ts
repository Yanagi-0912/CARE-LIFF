import {
  DEFAULT_SLOT_TIMES,
  type Medication,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';

/** 藥品指派：飯前／飯後其中之一，或未指派（null） */
export type Assignment = 'before_meal' | 'after_meal' | null;

export interface TimingFormValues {
  enabled: boolean;
  /** HH:MM */
  time: string;
}

export interface SlotEntryFormValues {
  before: TimingFormValues;
  after: TimingFormValues;
  /** 依藥品 id 索引；未出現在物件裡的藥品視同未指派（null） */
  assignments: Record<string, Assignment>;
}

/**
 * 依既有條目算出表單預設值。刻意只依賴 `reminder`，不依賴 `medications`——
 * 指派狀態的權威來源是條目裡的 medication_ids，藥品清單載入的快慢不該
 * 影響這裡算出來的值：清單還沒回來時，已指派的藥品一樣要能正確顯示在
 * 「飯前」或「飯後」，晚到的清單只是把對應的卡片渲染出來、不需要重算指派。
 */
export function computeDefaultAssignments(entries: ReminderEntry[]): Record<string, Assignment> {
  const assignments: Record<string, Assignment> = {};
  entries.forEach((entry) => {
    entry.medication_ids.forEach((id) => {
      assignments[id] = entry.meal_timing === 'none' ? null : entry.meal_timing;
    });
  });
  return assignments;
}

export function computeDefaults(slot: MedicationSlotType, reminder?: MedicationReminder): SlotEntryFormValues {
  const entries = reminder?.entries ?? [];
  const beforeEntry = entries.find((entry) => entry.meal_timing === 'before_meal');
  const afterEntry = entries.find((entry) => entry.meal_timing === 'after_meal');
  return {
    before: {
      enabled: Boolean(beforeEntry),
      time: beforeEntry?.scheduled_time ?? DEFAULT_SLOT_TIMES[slot],
    },
    after: {
      enabled: Boolean(afterEntry),
      time: afterEntry?.scheduled_time ?? DEFAULT_SLOT_TIMES[slot],
    },
    assignments: computeDefaultAssignments(entries),
  };
}

/**
 * 組出要送出的 entries（before → after → none）。
 *
 * 指派狀態的權威來源是 `values.assignments`，id 的枚舉範圍是「目前載入的
 * 藥品清單」∪「這筆規則既有條目裡的藥品」的聯集，而不是只看載入清單——
 * 藥品清單載入失敗或還沒回來時，若只依 `medications` 篩選，既有規則掛著
 * 的藥品就會因為「不在這次篩選的清單裡」而被整批漏掉、存檔後從所有條目
 * 消失。呼叫端另外要在 `medications` 載入失敗時擋住儲存（見
 * SlotEntryEditor 的 `medicationsError`），這裡是最後一道防線。
 *
 * none 條目只在「有未指派藥品原本屬於這筆規則」時才附上——藥袋辨識掛上、
 * 使用者這次沒特別指派的藥不能因此從規則上消失；但從沒屬於這筆規則、
 * 這次也沒指派的藥（例如剛手動新增的）維持真正的「未指派」，不塞進 none
 * 條目。即使既有規則本來就有 none 條目，只要這次結算下來沒有任何藥品
 * 落在 none，就不生出一個空的 none 條目——空條目會把規則的最早觸發時刻
 * 往前拉，卻沒有任何藥可以顯示，沒有意義。
 */
/**
 * 這筆規則既有條目裡出現過的藥品 id 聯集——buildEntries 與
 * findEmptyEnabledTiming 都需要「這個 id 原本就屬於本規則」這個判斷，
 * 抽成共用函式避免兩處各自維護一份同樣的邏輯。
 */
export function computePriorMemberIds(reminder: MedicationReminder | undefined): Set<string> {
  const priorEntries = reminder?.entries ?? [];
  return new Set(priorEntries.flatMap((entry) => entry.medication_ids));
}

/**
 * 找出「已開啟但沒有任何指派藥品」的時機，且同時有其他條目（另一個時機，
 * 或未指派但原屬本規則、會落入 none 條目的藥品）掛著至少一種藥。
 *
 * Controller ruling（final review）：這種組合不能靜默存檔——buildEntries 仍會
 * 依 values.before.enabled／values.after.enabled 老實產生一個 medication_ids
 * 為空陣列的條目，後端據此把 timeout_anchor_time 訂在這個空條目的時刻上。
 * 若那個時刻比真正掛著藥的條目晚，T+20 催促與 T+30 家屬警報的基準點就會
 * 被一個「其實沒有藥」的時機往後拖，延誤真正該吃藥的那顆藥的升級通知。
 * 因此改成擋下存檔，讓使用者明確指派藥品或關掉這個時機，而不是任由它
 * 悄悄拖慢別顆藥的升級時序。
 *
 * 全部時機都沒有藥（純時間提醒，例如量血壓提醒）不受影響——那種情況下
 * 沒有「其他條目掛著藥」可比較，允許維持現狀存檔。
 *
 * @param priorNoneIds 原本就屬於這筆規則的藥品 id（entries 的 medication_ids
 *   聯集，與 buildEntries 的 priorIds 同一來源）。這次若維持未指派，
 *   buildEntries 會把它們放進 none 條目繼續提醒，因此在這裡等同「掛在
 *   none 時機的藥」，要算進「其他條目是否有藥」的判斷。全新、從未屬於
 *   本規則的藥品維持未指派時不會落入 none，因此不算。
 */
export function findEmptyEnabledTiming(
  values: SlotEntryFormValues,
  priorNoneIds: Set<string>,
): 'before_meal' | 'after_meal' | null {
  let beforeCount = 0;
  let afterCount = 0;
  let noneCount = 0;
  Object.entries(values.assignments).forEach(([id, assignment]) => {
    if (assignment === 'before_meal') beforeCount += 1;
    else if (assignment === 'after_meal') afterCount += 1;
    else if (priorNoneIds.has(id)) noneCount += 1;
  });

  const timings: Array<{ meal: 'before_meal' | 'after_meal'; enabled: boolean; count: number; otherCount: number }> = [
    { meal: 'before_meal', enabled: values.before.enabled, count: beforeCount, otherCount: afterCount },
    { meal: 'after_meal', enabled: values.after.enabled, count: afterCount, otherCount: beforeCount },
  ];

  for (const timing of timings) {
    if (timing.enabled && timing.count === 0 && (timing.otherCount > 0 || noneCount > 0)) {
      return timing.meal;
    }
  }
  return null;
}

export function buildEntries(
  slot: MedicationSlotType,
  reminder: MedicationReminder | undefined,
  medications: Medication[],
  values: SlotEntryFormValues,
): ReminderEntry[] {
  const priorEntries = reminder?.entries ?? [];
  const priorIds = computePriorMemberIds(reminder);
  // 聯集：載入清單在前（維持既有的顯示順序），既有規則裡但這次清單沒帶到的
  // 藥品接在後面——不能因為清單缺席就讓它們憑空消失。
  const allIds = new Set<string>([...medications.map((med) => med.id), ...priorIds]);

  const beforeIds: string[] = [];
  const afterIds: string[] = [];
  const unassignedIds: string[] = [];
  allIds.forEach((id) => {
    const assignment = values.assignments[id] ?? null;
    if (assignment === 'before_meal') beforeIds.push(id);
    else if (assignment === 'after_meal') afterIds.push(id);
    else unassignedIds.push(id);
  });

  const priorNoneEntry = priorEntries.find((entry) => entry.meal_timing === 'none');
  const noneIds = unassignedIds.filter((id) => priorIds.has(id));

  const entries: ReminderEntry[] = [];
  if (values.before.enabled) {
    entries.push({ meal_timing: 'before_meal', scheduled_time: values.before.time, medication_ids: beforeIds });
  }
  if (values.after.enabled) {
    entries.push({ meal_timing: 'after_meal', scheduled_time: values.after.time, medication_ids: afterIds });
  }
  if (noneIds.length > 0) {
    // 時間取既有 none 條目的時刻，缺席時取最早啟用時機的時刻——驗證已保證
    // 至少一個時機啟用，這裡一定找得到。
    const earliestEnabledTime = [
      values.before.enabled ? values.before.time : undefined,
      values.after.enabled ? values.after.time : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    entries.push({
      meal_timing: 'none',
      scheduled_time: priorNoneEntry?.scheduled_time ?? earliestEnabledTime ?? DEFAULT_SLOT_TIMES[slot],
      medication_ids: noneIds,
    });
  }
  return entries;
}
