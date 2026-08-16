/**
 * 外觀資料集裡用來分隔「同一欄位有多個值」的分隔符（例：混色藥丸的顏色
 * 欄位是「紅;;;白」）。這是食藥署原始資料集既有的格式，不是本專案發明的——
 * 後端 `DrugCatalogEntry` 的文件已經明講「原樣帶過原始資料…正規化是呈現
 * 面的事」，這支檔案就是那個呈現面：候選消歧介面與外觀文字都要用同一套
 * 拆解規則，不能各自處理出不一致的結果。
 */
const MULTI_VALUE_DELIMITER = ';;;';

/**
 * 拆開單一外觀欄位可能包含的多個值，去除空白與重複，保留原始出現順序。
 * 空字串回傳空陣列——欄位缺席時沒有值可拆。
 */
export function splitAppearanceValues(raw: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  raw.split(MULTI_VALUE_DELIMITER).forEach((part) => {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      values.push(trimmed);
    }
  });
  return values;
}

/**
 * 這個外觀欄位是否符合使用者指定的目標值。
 *
 * 兩條規則缺一不可：
 * 1. 欄位**拆不出任何值**時視為「未知」而非「不是」——全庫只有
 *    6,095/66,478 筆藥證記錄顏色，把「沒記錄」當成「不符合」會讓多候選
 *    集合裡佔多數的未知候選在使用者一回答顏色就整批消失，介面卻宣稱
 *    「已收窄到這幾種」，等於用一句謊言換來一個看似可信的短清單。
 *    「拆不出值」不等於「空字串」：原始資料裡有 17 筆藥證的顏色欄位是
 *    `';;;'`、`';;;;;;'`、`';;;;;;;;;'` 這種只有分隔符的字串——非空、
 *    truthy，拆完卻是空陣列。只擋 `!raw` 會讓這 17 筆變成「有記錄但
 *    不符合任何顏色」，被每一個顏色答案排除掉；它們**全部都有照片**，
 *    等於在最需要照片的地方把候選悄悄刪掉，正是上面那句謊言的另一半。
 *    （形狀欄位目前沒有這種資料，但同一條規則一併套用，不押寶在
 *    「另一個欄位剛好乾淨」這種會隨資料更新失效的前提上。）
 * 2. 混色等多值欄位（「紅;;;白」）只要任一值符合就算符合，不是整串
 *    字面比對——否則「白」與「紅;;;白」會被當成兩個互斥的答案，選其一
 *    會誤删另一個其實符合的候選。
 */
export function appearanceValueMatches(raw: string, target: string): boolean {
  const values = splitAppearanceValues(raw);
  return values.length === 0 || values.includes(target);
}
