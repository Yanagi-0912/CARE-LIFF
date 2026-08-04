import { useTranslation } from 'react-i18next';
import { SLOT_LABEL_KEY, type MedicationReminder } from '../../types/medication';
import { formatDateDisplay } from '../../utils/date';

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
    <article className={`medCard slot-${reminder.slot_type}${reminder.enabled ? '' : ' isOff'}`}>
      <button
        type="button"
        className="medCardMain"
        onClick={() => onEdit(reminder)}
        aria-label={t('meds.editAria', { slot: slotLabel, time: reminder.scheduled_time })}
      >
        <span className="medSlotBadge" aria-hidden="true">
          {slotLabel}
        </span>
        <span className="medCardInfo">
          <strong className="medTime">{reminder.scheduled_time}</strong>
          <span className="medDateRange">{dateRange}</span>
        </span>
        <span className="medChevron" aria-hidden="true">
          ›
        </span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={reminder.enabled}
        className="medToggle"
        disabled={busy}
        onClick={() => onToggle(reminder)}
        aria-label={t('meds.toggleAria', { slot: slotLabel })}
      >
        <span className="medToggleTrack" aria-hidden="true">
          <span className="medToggleThumb" />
        </span>
        <span className="medToggleText">
          {reminder.enabled ? t('meds.statusOn') : t('meds.statusOff')}
        </span>
      </button>
    </article>
  );
}
