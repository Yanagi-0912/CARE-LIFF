import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'lucide-react';

import { SLOT_LABEL_KEY, type Medication, type MedicationReminder } from '../../types/medication';
import { formatDateDisplay } from '../../utils/date';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { SLOT_TONE } from './slotTone';
import { PillThumbnail } from './PillThumbnail';
import { formatAppearanceMarks, formatAppearancePrimary } from './appearanceText';

/**
 * 單一藥品的外觀呈現列：縮圖＋藥名＋外觀摘要（含刻痕／標註）。
 *
 * 縮圖網址由後端在讀取當下就地解析（MedicationService.
 * get_user_reminders_with_medications 用 resolve_drug_appearance_image_url，
 * 與 DrugCandidate.thumbnail_url 走同一條規則），前端只負責顯示，不再自行
 * 用證號重算雜湊路徑——只有後端知道那個檔案是否真的存在，前端猜的 URL
 * 在縮圖覆蓋率只有一成左右的情況下多數會 404，留下一次瞬間的空圖片框與
 * 一次浪費的請求。
 *
 * 刻痕／標註（I2）在這裡也要顯示：這張卡片是「照片缺席時的降級」最常
 * 發生的地方（多數藥品沒有落地的縮圖），而 mark_one 等欄位正是縮圖在
 * 160px 看不清楚標記時的文字補償，不能因為卡片本來只顯示 primary 摘要
 * 就被漏掉。
 */
function MedicationAppearanceRow({ medication }: { medication: Medication }) {
  const { t } = useTranslation();
  const separator = t('meds.scan.draft.slotListSeparator');
  const primary = formatAppearancePrimary(medication, separator);
  const marks = formatAppearanceMarks(medication, separator);
  const appearanceText = [primary, marks].filter(Boolean).join(separator);

  return (
    // role="listitem" 補上 ItemGroup 的 role="list" 需要的成員角色——shadcn 的
    // Item 本身不帶角色，少了這個就是一個沒有項目的空清單。
    <Item size="xs" role="listitem" className="gap-2.5 p-0">
      {/* 刻意不用 ItemMedia 的 image variant：它會帶進 [&_img]:object-cover，
          而那個後代選擇器的權重高過 PillThumbnail 自己的 object-contain，會把
          官方照片的尺規裁掉——尺規正是分辨同名同形藥品的關鍵（見 PillThumbnail
          的說明）。default variant 只負責對齊，尺寸與 object-fit 留給縮圖自己決定。 */}
      <ItemMedia>
        <PillThumbnail
          src={medication.thumbnail_url}
          alt={medication.name}
          className="size-11 rounded-lg"
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
          <ItemDescription className="line-clamp-none break-words">
            {appearanceText}
          </ItemDescription>
        )}
      </ItemContent>
    </Item>
  );
}

interface ReminderCardProps {
  reminder: MedicationReminder;
  /** 切換啟用狀態（由頁面負責樂觀更新與 toast） */
  onToggle: (reminder: MedicationReminder) => void;
  onEdit: (reminder: MedicationReminder) => void;
  /** 該卡片正在送出請求時停用互動 */
  busy?: boolean;
}

export function ReminderCard({ reminder, onToggle, onEdit, busy = false }: ReminderCardProps) {
  const { t } = useTranslation();

  const slotLabel = t(SLOT_LABEL_KEY[reminder.slot_type]);
  const dateRange = reminder.end_date
    ? t('meds.dateRangeClosed', {
        start: formatDateDisplay(reminder.start_date),
        end: formatDateDisplay(reminder.end_date),
      })
    : t('meds.dateRangeOpen', { start: formatDateDisplay(reminder.start_date) });
  // 藥袋辨識建立的提醒才會關聯到藥品；手動建立的提醒沒有這個欄位，維持原本只顯示時間的樣子
  const medications = reminder.medications ?? [];

  return (
    <Item
      variant="outline"
      className={cn('gap-0 p-0 transition-opacity', !reminder.enabled && 'opacity-60')}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-l-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => onEdit(reminder)}
        aria-label={t('meds.editAria', { slot: slotLabel, time: reminder.scheduled_time })}
      >
        <ItemMedia>
          {/* 時段色票。Badge 的語意色由 SLOT_TONE 查表，四個時段各有自己的色系 */}
          <Badge
            variant="secondary"
            className={cn('size-11 rounded-xl text-sm font-extrabold', SLOT_TONE[reminder.slot_type])}
          >
            {slotLabel}
          </Badge>
        </ItemMedia>

        <ItemContent>
          <ItemTitle className="num text-2xl font-extrabold">{reminder.scheduled_time}</ItemTitle>
          <ItemDescription>{dateRange}</ItemDescription>
          {medications.length > 0 && (
            // ItemGroup 依子項的 data-size=xs 自己收斂間距（has-data-[size=xs]:gap-2），
            // 不需要也不該在這裡另外指定 gap。
            <ItemGroup className="mt-1">
              {medications.map((med) => (
                <MedicationAppearanceRow key={med.id} medication={med} />
              ))}
            </ItemGroup>
          )}
        </ItemContent>

        <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
      </button>

      <Separator orientation="vertical" className="self-stretch" />

      {/* 整塊直向區域是點擊區，內含開關與狀態文字。
          Switch 本身負責軌道／滑鈕與 role="switch"＋aria-checked；
          外層 label 讓點擊文字也能切換，不需要額外的 button 包裝。 */}
      <label className="flex w-[84px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 self-stretch px-2 py-3 has-disabled:cursor-progress has-disabled:opacity-60">
        <Switch
          checked={reminder.enabled}
          disabled={busy}
          onCheckedChange={() => onToggle(reminder)}
          aria-label={t('meds.toggleAria', { slot: slotLabel })}
        />
        <span className="text-xs font-semibold text-muted-foreground">
          {reminder.enabled ? t('meds.statusOn') : t('meds.statusOff')}
        </span>
      </label>
    </Item>
  );
}
