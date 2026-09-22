import {
  DEFAULT_SLOT_TIMES,
  MEAL_TIMING_ORDER,
  type MealTiming,
  type Medication,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';

/** 藥品指派：飯前／飯後／不分飯前後其中之一，或未指派（null） */
export type Assignment = MealTiming | null;

export interface TimingFormValues {
  enabled: boolean;
  /** HH:MM */
  time: string;
}

export interface SlotEntryFormValues {
  timings: Record<MealTiming, TimingFormValues>;
  /** 依藥品 id 索引；未出現在物件裡的藥品視同未指派（null） */
  assignments: Record<string, Assignment>;
}

/**
 * 依既有條目算出表單預設值。刻意只依賴 `reminder`，不依賴 `medications`——
 * 指派狀態的權威來源是條目裡的 medication_ids，藥品清單載入的快慢不該
 * 影響這裡算出來的值：清單還沒回來時，已指派的藥品一樣要能正確顯示在
 * 對應的時機，晚到的清單只是把對應的卡片渲染出來、不需要重算指派。
 */
export function computeDefaultAssignments(entries: ReminderEntry[]): Record<string, Assignment> {
  const assignments: Record<string, Assignment> = {};
  entries.forEach((entry) => {
    entry.medication_ids.forEach((id) => {
      assignments[id] = entry.meal_timing;
    });
  });
  return assignments;
}

/**
 * 新增與編輯都走詳細設定之後（原本的簡易新增表單已移除），「不分飯前後」
 * 必須是一個可開關、可改時刻的正式時機——最常見的提醒就是「早上 8 點吃藥」
 * 這種單一時刻，以前只能在簡易表單設定，詳細設定只有飯前／飯後兩個開關。
 *
 * 尚未設定過的時段預設開啟「不分飯前後」、時刻套用該時段預設值：長輩點進
 * 時段直接按儲存，就得到與舊簡易表單相同的單一時刻提醒，不必先搞懂飯前飯後。
 */
export function computeDefaults(slot: MedicationSlotType, reminder?: MedicationReminder): SlotEntryFormValues {
  const entries = reminder?.entries ?? [];
  const timingFor = (meal: MealTiming): TimingFormValues => {
    const entry = entries.find((item) => item.meal_timing === meal);
    return {
      enabled: reminder ? Boolean(entry) : meal === 'none',
      time: entry?.scheduled_time ?? DEFAULT_SLOT_TIMES[slot],
    };
  };
  return {
    timings: {
      before_meal: timingFor('before_meal'),
      after_meal: timingFor('after_meal'),
      none: timingFor('none'),
    },
    assignments: computeDefaultAssignments(entries),
  };
}

/**
 * 這筆規則既有條目裡出現過的藥品 id 聯集——buildEntries 用它把「清單缺席
 * 時仍屬於本規則」的藥品一起結算進去。
 */
export function computePriorMemberIds(reminder: MedicationReminder | undefined): Set<string> {
  const priorEntries = reminder?.entries ?? [];
  return new Set(priorEntries.flatMap((entry) => entry.medication_ids));
}

/**
 * 找出「已開啟但沒有任何指派藥品」的時機，且同時有另一個開啟中的時機
 * 掛著至少一種藥。
 *
 * Controller ruling（final review）：這種組合不能靜默存檔——buildEntries 仍會
 * 老實產生一個 medication_ids 為空陣列的條目，後端據此把 timeout_anchor_time
 * 訂在這個空條目的時刻上。若那個時刻比真正掛著藥的條目晚，T+20 催促與
 * T+30 家屬警報的基準點就會被一個「其實沒有藥」的時機往後拖，延誤真正
 * 該吃藥的那顆藥的升級通知。因此改成擋下存檔，讓使用者明確指派藥品或
 * 關掉這個時機。
 *
 * 全部時機都沒有藥（純時間提醒，例如量血壓提醒）不受影響——那種情況下
 * 沒有「其他條目掛著藥」可比較，允許維持現狀存檔。
 *
 * 以前「不分飯前後」不是可開關的時機，未指派但原屬本規則的藥品會自動
 * 落進一個隱形的 none 條目；現在 none 是畫面上看得到的時機，指派狀態
 * 一律以畫面為準，那條隱形規則已經拿掉。
 */
export function findEmptyEnabledTiming(values: SlotEntryFormValues): MealTiming | null {
  const counts: Record<MealTiming, number> = { before_meal: 0, after_meal: 0, none: 0 };
  Object.values(values.assignments).forEach((assignment) => {
    if (assignment && values.timings[assignment].enabled) counts[assignment] += 1;
  });

  const anyWithMeds = MEAL_TIMING_ORDER.some((meal) => values.timings[meal].enabled && counts[meal] > 0);
  if (!anyWithMeds) return null;
  return MEAL_TIMING_ORDER.find((meal) => values.timings[meal].enabled && counts[meal] === 0) ?? null;
}

/**
 * 組出要送出的 entries（before → after → none，同 MEAL_TIMING_ORDER）。
 *
 * 指派狀態的權威來源是 `values.assignments`，id 的枚舉範圍是「目前載入的
 * 藥品清單」∪「這筆規則既有條目裡的藥品」的聯集，而不是只看載入清單——
 * 藥品清單載入失敗或還沒回來時，若只依 `medications` 篩選，既有規則掛著
 * 的藥品就會因為「不在這次篩選的清單裡」而被整批漏掉、存檔後從所有條目
 * 消失。呼叫端另外要在 `medications` 載入失敗時擋住儲存（見
 * SlotEntryEditor 的 `medicationsError`），這裡是最後一道防線。
 *
 * 指派到已關閉時機的藥品不會出現在任何條目（SlotEntryEditor 關閉時機時
 * 會先把它們清成未指派，這裡只是不信任呼叫端）。
 */
export function buildEntries(
  reminder: MedicationReminder | undefined,
  medications: Medication[],
  values: SlotEntryFormValues,
): ReminderEntry[] {
  // 聯集：載入清單在前（維持既有的顯示順序），既有規則裡但這次清單沒帶到的
  // 藥品接在後面——不能因為清單缺席就讓它們憑空消失。
  const allIds = new Set<string>([
    ...medications.map((med) => med.id),
    ...computePriorMemberIds(reminder),
  ]);

  const idsByTiming: Record<MealTiming, string[]> = { before_meal: [], after_meal: [], none: [] };
  allIds.forEach((id) => {
    const assignment = values.assignments[id] ?? null;
    if (assignment) idsByTiming[assignment].push(id);
  });

  return MEAL_TIMING_ORDER.filter((meal) => values.timings[meal].enabled).map((meal) => ({
    meal_timing: meal,
    scheduled_time: values.timings[meal].time,
    medication_ids: idsByTiming[meal],
  }));
}
