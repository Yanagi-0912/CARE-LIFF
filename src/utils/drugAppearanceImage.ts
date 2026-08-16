import { BASE_URL } from '../api/medicationApi';

/**
 * 藥丸縮圖的對外路徑前綴，鏡射後端 settings.DRUG_APPEARANCE_IMAGE_URL_PATH
 * 的預設值（app/core/config.py）。後端把縮圖以 PUBLIC_BASE_URL 為前綴對外
 * 服務，而 PUBLIC_BASE_URL 與這支前端呼叫 API 的網域是同一台主機，因此
 * 沿用 BASE_URL 接上這段固定前綴即可組出可用的圖片 URL，不需要另外一支
 * API 回傳這個值。
 */
const DRUG_APPEARANCE_IMAGE_URL_PATH = '/drug-appearance';

/** sha256 的 16 進位字串只取前 16 碼，鏡射後端 thumbnail_filename() 的規則。 */
const HASH_PREFIX_LENGTH = 16;

/**
 * 已解析過的證號 → 縮圖 URL 快取（同一個 license_number 在提醒清單裡常會
 * 重複出現，例如同一顆藥掛在早、午、晚三個時段）。sha256 本身無狀態、
 * 結果穩定，快取只是省下重複計算，不影響正確性。
 */
const urlCache = new Map<string, Promise<string | null>>();

/**
 * 證號 -> 縮圖檔名：sha256 前 16 碼 + .jpg。
 *
 * 與後端 drug_appearance_image_service.thumbnail_filename() 各自獨立實作
 * 同一條規則（design.md 決策 4：檔名走雜湊，不可枚舉，且「知道證號的人
 * 能算出路徑」不構成額外洩漏，藥證與外觀本身就是公開資料）。前端這裡
 * 沒有辦法在請求前確認縮圖檔案是否存在——那項檢查留給 <img onError>，
 * 對應「照片載入失敗時降級為純文字」的需求。
 */
async function thumbnailFilename(licenseNumber: string): Promise<string> {
  const data = new TextEncoder().encode(licenseNumber);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, HASH_PREFIX_LENGTH)}.jpg`;
}

/**
 * 證號 -> 對外縮圖 URL。空字串／null／undefined 一律回傳 null——這與後端
 * resolve_drug_appearance_image_url 的「證號不確定就沒有照片」是同一件事，
 * 只是前端這裡沒有落地的檔案可以直接查，只能先組出「可能有效」的 URL，
 * 真正是否存在交給 <img onError> 判斷。
 */
export function resolveDrugAppearanceImageUrl(
  licenseNumber: string | null | undefined,
): Promise<string | null> {
  if (!licenseNumber || !licenseNumber.trim()) return Promise.resolve(null);

  const cached = urlCache.get(licenseNumber);
  if (cached) return cached;

  const promise = thumbnailFilename(licenseNumber).then(
    (filename) => `${BASE_URL.replace(/\/$/, '')}${DRUG_APPEARANCE_IMAGE_URL_PATH}/${filename}`,
  );
  urlCache.set(licenseNumber, promise);
  return promise;
}
