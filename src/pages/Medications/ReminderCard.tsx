import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'lucide-react';

import { SLOT_LABEL_KEY, type MedicationReminder } from '../../types/medication';
import { formatDateDisplay } from '../../utils/date';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { SLOT_TONE } from './slotTone';

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
  const medicationNames = (reminder.medications ?? []).map((med) => med.name).join('、');

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
          {medicationNames && <ItemDescription>{medicationNames}</ItemDescription>}
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
