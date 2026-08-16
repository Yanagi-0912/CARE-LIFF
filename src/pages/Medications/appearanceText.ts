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
 * 顏色／形狀／尺寸組成的外觀摘要，例如「白色 圓形 8mm」——這是使用者拿著
 * 藥丸一眼就能核對的部分，因此欄位順序照使用者觀察的順序排（先看顏色、
 * 再看形狀、尺寸最後）。任一欄位缺席就跳過，不留空格洞。
 */
export function formatAppearancePrimary(fields: AppearanceFields): string {
  return [fields.color, fields.shape, fields.size].filter(Boolean).join(' ');
}

/**
 * 刻痕與標註組成的補充描述。160px 縮圖看不清楚這些細節（design.md 決策 6
 * 的實測結論），因此以文字欄位獨立呈現，讓照片與文字互補而非互斥。
 */
export function formatAppearanceMarks(fields: AppearanceFields): string {
  return [fields.score_line, fields.mark_one, fields.mark_two].filter(Boolean).join('、');
}

/** 這組外觀欄位是否有任何可呈現的內容——沒有的話呼叫端不需要騰出版面。 */
export function hasAppearanceText(fields: AppearanceFields): boolean {
  return formatAppearancePrimary(fields) !== '' || formatAppearanceMarks(fields) !== '';
}
