import { useTranslation } from 'react-i18next';

import type { Medication } from '../../types/medication';
import { cn } from '@/lib/utils';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { PillThumbnail } from './PillThumbnail';
import { MedicationIndicationSection } from './MedicationIndicationSection';
import { formatAppearanceMarks, formatAppearancePrimary } from './appearanceText';

/**
 * 單一藥品的外觀呈現列：藥丸照片＋藥名＋外觀摘要（含刻痕／標註）。
 *
 * 縮圖網址由後端在讀取當下就地解析（MedicationService.
 * get_user_reminders_with_medications 用 resolve_drug_appearance_image_url，
 * 與 DrugCandidate.thumbnail_url 走同一條規則），前端只負責顯示，不再自行
 * 用證號重算雜湊路徑——只有後端知道那個檔案是否真的存在，前端猜的 URL
 * 在縮圖覆蓋率只有一成左右的情況下多數會 404，留下一次瞬間的空圖片框與
 * 一次浪費的請求。
 *
 * 刻痕／標註（I2）在這裡也要顯示：這是「照片缺席時的降級」最常發生的地方
 * （藥品目錄 66,478 筆裡只有 6,273 筆有外觀圖連結，約 9.4%），而 mark_one
 * 等欄位正是照片看不清楚標記時的文字補償。
 *
 * `size` 決定照片大小，兩檔都用 rem（跟著設定頁的 16/20/24px 字級一起放大，
 * 見前端規範 §2「尺寸用 rem，不用 px」）：
 *
 * - `full`（提醒卡片）：`size-40` = 10rem，在預設字級下剛好是 160px，用滿
 *   落地縮圖的原始解析度（resources/drug_appearance 全部是 160×160，由
 *   scripts/build_drug_catalog.py 的 IMAGE_THUMBNAIL_PX 決定）。再大就是
 *   放大模糊。這一檔在 640px 以下改為上下堆疊——375px 的卡片內寬只有
 *   約 311px，照片與藥名並排時藥名只剩不到 150px，而在 24px 字級下照片
 *   本身就要 240px，並排必定破版。
 * - `compact`（編輯視窗）：`size-16`，那裡的用途是「確認我正在改的是哪幾種
 *   藥」，不是靠外觀認藥，不需要也放不下大圖。
 */
export function MedicationAppearanceRow({
  medication,
  size = 'full',
}: {
  medication: Medication;
  size?: 'full' | 'compact';
}) {
  const { t } = useTranslation();
  const separator = t('meds.scan.draft.slotListSeparator');
  const primary = formatAppearancePrimary(medication, separator);
  const marks = formatAppearanceMarks(medication, separator);
  const appearanceText = [primary, marks].filter(Boolean).join(separator);
  const full = size === 'full';

  return (
    // role="listitem" 補上 ItemGroup 的 role="list" 需要的成員角色——shadcn 的
    // Item 本身不帶角色，少了這個就是一個沒有項目的空清單。
    <Item
      size="xs"
      role="listitem"
      className={cn(
        'gap-2.5 p-0',
        full && 'flex-col items-start sm:flex-row sm:items-center',
      )}
    >
      {/* 刻意不用 ItemMedia 的 image variant：它會帶進 [&_img]:object-cover，
          而那個後代選擇器的權重高過 PillThumbnail 自己的 object-contain，會把
          官方照片的尺規裁掉——尺規正是分辨同名同形藥品的關鍵（例如普拿疼
          膜衣錠與普拿疼速效膜衣錠皆為白色橢圓，唯一差異是尺規顯示的長度）。
          default variant 只負責對齊，尺寸與 object-fit 留給縮圖自己決定。 */}
      <ItemMedia>
        <PillThumbnail
          src={medication.thumbnail_url}
          alt={medication.name}
          className={full ? 'size-40 rounded-xl' : 'size-16 rounded-lg'}
        />
      </ItemMedia>
      <ItemContent className="gap-0.5">
        {/* shadcn 的 ItemTitle／ItemDescription 預設帶 line-clamp-1／line-clamp-2，
            在這裡一律解除：藥名與外觀描述就是使用者用來認藥的全部線索，截掉
            等於把這個功能的目的截掉（`ANROKIN TABLETS (CHLORZOXAZONE)` 被切成
            `ANROKIN TABLETS (CHLORZOXA` 時，剩下的字不足以認出任何東西）。
            版面因此變高是預期的代價，不是退化。 */}
        <ItemTitle className="w-full line-clamp-none font-semibold break-words">
          {medication.name}
        </ItemTitle>
        {appearanceText && (
          <ItemDescription className="line-clamp-none break-words">{appearanceText}</ItemDescription>
        )}
        {/* 適應症只在 full 尺寸呈現。compact 用於編輯視窗，那裡的用途是
            「確認我正在改的是哪幾種藥」，塞進一段可能上百字的適應症只會把
            清單撐長、蓋掉它真正要回答的問題。 */}
        {full && <MedicationIndicationSection medication={medication} />}
      </ItemContent>
    </Item>
  );
}
