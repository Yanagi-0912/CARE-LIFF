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
 * （例如沒有刻痕）——語意上等於缺席，不是一個要呈現給使用者的值。
 *
 * 這個值一定要在「拆解多值分隔符之後」逐一比對，不能拿整個原始欄位字面
 * 跟「無」比對——後者會漏掉「無;;;無」這種還沒拆解就不等於「無」的字串
 * （score_line 有 63 筆是這個形狀），也會漏掉「無;;;直線」這種一部分是
 * 「無」、另一部分是真實記錄的混合值（真實資料庫裡就有這一筆）。前一輪
 * 修正只做了字串層級的比對就是這裡漏掉的原因：3,903 筆單純的「無」被擋
 * 住了，但拆解後才會出現的「無」沒有。
 */
const ABSENT_VALUE = '無';

/**
 * 單一外觀欄位 -> 可呈現的字串。
 *
 * 順序固定為「先拆解多值分隔符、再逐一過濾掉『無』與空白、去重、最後才
 * 用呼叫端指定的分隔符接回」——這是本檔案唯一組裝顯示字串的地方，
 * formatAppearancePrimary／formatAppearanceMarks／formatAppearanceSize
 * 都透過它，不再各自比對原始字串，避免重蹈「比對順序錯了」的覆轍。
 */
function normalizeField(value: string, separator: string): string {
  return splitAppearanceValues(value)
    .filter((v) => v !== ABSENT_VALUE)
    .join(separator);
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
    .map((value) => normalizeField(value, separator))
    .filter(Boolean)
    .join(separator);
}

/**
 * 刻痕與標註組成的補充描述。160px 縮圖看不清楚這些細節（design.md 決策 6
 * 的實測結論），因此以文字欄位獨立呈現，讓照片與文字互補而非互斥。
 * 「無」（見 ABSENT_VALUE）視為缺席，不算一個要呈現的標記，即使它跟其他
 * 真實值混在同一個以 ';;;' 分隔的欄位裡也一樣要被濾掉。
 */
export function formatAppearanceMarks(fields: AppearanceFields, separator: string): string {
  return [fields.score_line, fields.mark_one, fields.mark_two]
    .map((value) => normalizeField(value, separator))
    .filter(Boolean)
    .join(separator);
}

/**
 * 外觀尺寸的原始值，不附加任何單位——資料集本身沒有記錄單位是什麼，
 * 呈現面不該替它決定（見 formatAppearancePrimary 的說明）。呼叫端要顯示
 * 時應搭配「外觀尺寸」之類的標籤一起呈現原始值，而不是讓一個裸數字
 * 單獨出現。
 *
 * 同樣要先經過 normalizeField：size 欄位有 69 筆是「10;;;10」這種同值
 * 重複的多值格式，不拆解就會把分隔符原封不動印在畫面上（例如
 * 「外觀尺寸：10;;;10」）；拆解去重後才是使用者該看到的「外觀尺寸：10」。
 */
export function formatAppearanceSize(
  fields: Pick<AppearanceFields, 'size'>,
  separator: string,
): string {
  return normalizeField(fields.size, separator);
}

/** 這組外觀欄位是否有任何可呈現的內容——沒有的話呼叫端不需要騰出版面。
 *  分隔符只影響呈現格式，不影響「有沒有內容」這個判斷，因此這裡用什麼
 *  分隔符都不影響結果，固定傳一個佔位字元即可。 */
export function hasAppearanceText(fields: AppearanceFields): boolean {
  return (
    formatAppearancePrimary(fields, ' ') !== '' ||
    formatAppearanceMarks(fields, ' ') !== '' ||
    formatAppearanceSize(fields, ' ') !== ''
  );
}
