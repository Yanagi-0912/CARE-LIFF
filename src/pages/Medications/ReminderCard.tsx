import { useTranslation } from 'react-i18next';
import { SLOT_LABEL_KEY, type MedicationReminder } from '../../types/medication';
import { formatDateDisplay } from '../../utils/date';
import { cn } from '@/lib/utils';
import * as S from './styles';

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

  return (
    <article className={cn(S.CARD, !reminder.enabled && S.CARD_OFF)}>
      <button
        type="button"
        className={S.CARD_MAIN}
        onClick={() => onEdit(reminder)}
        aria-label={t('meds.editAria', { slot: slotLabel, time: reminder.scheduled_time })}
      >
        <span className={cn(S.SLOT_BADGE, S.SLOT_TONE[reminder.slot_type])} aria-hidden="true">
          {slotLabel}
        </span>
        <span className={S.CARD_INFO}>
          <strong className={S.TIME}>{reminder.scheduled_time}</strong>
          <span className={S.DATE_RANGE}>{dateRange}</span>
        </span>
        <span className={S.CHEVRON} aria-hidden="true">
          ›
        </span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={reminder.enabled}
        className={S.TOGGLE}
        disabled={busy}
        onClick={() => onToggle(reminder)}
        aria-label={t('meds.toggleAria', { slot: slotLabel })}
      >
        <span className={S.TOGGLE_TRACK} aria-hidden="true">
          <span className={S.TOGGLE_THUMB} />
        </span>
        <span className={S.TOGGLE_TEXT}>
          {reminder.enabled ? t('meds.statusOn') : t('meds.statusOff')}
        </span>
      </button>
    </article>
  );
}
