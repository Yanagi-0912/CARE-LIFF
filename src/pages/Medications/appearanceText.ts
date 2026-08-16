import { splitAppearanceValues } from './appearanceValues';

/**
 * DrugCandidate 與 Medication 共用的外觀欄位形狀（皆為後端慣例：缺席時是
 * 空字串而非 null）。這裡用結構型別而非匯入其中一個具體型別，讓兩種呼叫端
 * 都能直接傳入自己的物件，不需要互相轉型。
 */
export interface AppearanceFields {
  shape: string;
  color: string;
  score_line: string;
  mark_one: string;
  mark_two: string;
  size: string;
}

/**
 * 食藥署原始資料集裡「無」代表這個欄位有記錄、但明確記成「沒有這項特徵」
 * （例如沒有刻痕）——語意上等於缺席，不是一個要呈現給使用者的值。實測
 * `score_line` 6,059 筆非空值中有 3,903 筆（64%）就是字面「無」；照原樣
 * 呈現會變成「刻痕／標示：無、CCP」，把「沒有」講成一個標記。
 */
const ABSENT_VALUE = '無';

function isPresent(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed !== ABSENT_VALUE;
}

/** 單一欄位可能含有食藥署原始資料的多值分隔符（如「紅;;;白」），拆開去重
 *  後用呼叫端指定的分隔符重新接回——顯示面永遠看不到原始的 ';;;'。 */
function normalizeField(value: string, separator: string): string {
  return splitAppearanceValues(value).join(separator);
}

/**
 * 顏色／形狀組成的外觀摘要，例如「白色、圓形」——這兩者是使用者拿著藥丸
 * 一眼就能核對的分類性描述，讀起來不需要單位。
 *
 * 外觀尺寸（size）刻意不在這裡呈現：食藥署資料集的 size 欄位只給裸數字
 * （如「8」「7.5」），全庫查不到任何欄位或文件說明單位是什麼；直接接在
 * 「白色 圓形」後面拼成「白色 圓形 8」會被誤讀成一個打錯或漏印單位的
 * 數字。改由 formatAppearanceSize 把原始值單獨帶標籤呈現，不臆測單位，
 * 見該函式的說明。
 *
 * separator 由呼叫端傳入（通常是 t('meds.scan.draft.slotListSeparator')），
 * 這支函式本身不內建任何標點——不同語言的列舉習慣不同，寫死標點會讓
 * 六語系其中五個語系被迫套用中文的頓號。
 */
export function formatAppearancePrimary(fields: AppearanceFields, separator: string): string {
  return [fields.color, fields.shape]
    .filter(isPresent)
    .map((value) => normalizeField(value, separator))
    .join(separator);
}

/**
 * 刻痕與標註組成的補充描述。160px 縮圖看不清楚這些細節（design.md 決策 6
 * 的實測結論），因此以文字欄位獨立呈現，讓照片與文字互補而非互斥。
 * 「無」（見 ABSENT_VALUE）視為缺席，不算一個要呈現的標記。
 */
export function formatAppearanceMarks(fields: AppearanceFields, separator: string): string {
  return [fields.score_line, fields.mark_one, fields.mark_two]
    .filter(isPresent)
    .map((value) => normalizeField(value, separator))
    .join(separator);
}

/**
 * 外觀尺寸的原始值，不附加任何單位——資料集本身沒有記錄單位是什麼，
 * 呈現面不該替它決定（見 formatAppearancePrimary 的說明）。呼叫端要顯示
 * 時應搭配「外觀尺寸」之類的標籤一起呈現原始值，而不是讓一個裸數字
 * 單獨出現。
 */
export function formatAppearanceSize(fields: Pick<AppearanceFields, 'size'>): string {
  return isPresent(fields.size) ? fields.size.trim() : '';
}

/** 這組外觀欄位是否有任何可呈現的內容——沒有的話呼叫端不需要騰出版面。
 *  分隔符只影響呈現格式，不影響「有沒有內容」這個判斷，因此這裡用什麼
 *  分隔符都不影響結果，固定傳一個佔位字元即可。 */
export function hasAppearanceText(fields: AppearanceFields): boolean {
  return (
    formatAppearancePrimary(fields, ' ') !== '' ||
    formatAppearanceMarks(fields, ' ') !== '' ||
    formatAppearanceSize(fields) !== ''
  );
}
