import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SLOT_TIMES,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationSlotType,
} from '../../types/medication';
import { todayLocalDateString } from '../../utils/date';

interface ReminderFormDialogProps {
  /** 提醒對象名稱，僅顯示用；對象由頁面上方的 chips 決定 */
  targetName: string;
  /** 該對象已設定的時段，會被停用以避免重複建立 */
  existingSlots: MedicationSlotType[];
  onSubmit: (slots: MedicationSlotType[], startDate: string, endDate?: string) => Promise<void>;
  onClose: () => void;
}

export function ReminderFormDialog({
  targetName,
  existingSlots,
  onSubmit,
  onClose,
}: ReminderFormDialogProps) {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<MedicationSlotType[]>([]);
  const [startDate, setStartDate] = useState(todayLocalDateString());
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const allSlotsUsed = SLOT_TYPES.every((slot) => existingSlots.includes(slot));

  const toggleSlot = (slot: MedicationSlotType) => {
    setFormError(null);
    setSelected((prev) =>
      prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot],
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      setFormError(t('meds.add.needSlot'));
      return;
    }
    // YYYY-MM-DD 可直接字串比較，不需解析日期
    if (endDate && endDate < startDate) {
      setFormError(t('meds.add.dateOrderError'));
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(selected, startDate, endDate || undefined);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('meds.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="medDialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="medDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="med-add-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="medDialogClose"
          aria-label={t('meds.close')}
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="med-add-title">{t('meds.add.title')}</h2>

        <p className="medDialogTarget">
          <span>{t('meds.add.targetField')}</span>
          <strong>{targetName}</strong>
        </p>

        <fieldset className="medSlotPicker">
          <legend>{t('meds.add.slotsField')}</legend>
          {SLOT_TYPES.map((slot) => {
            const taken = existingSlots.includes(slot);
            return (
              <label key={slot} className={`medSlotOption${taken ? ' isTaken' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(slot)}
                  disabled={taken || submitting}
                  onChange={() => toggleSlot(slot)}
                />
                <span className="medSlotOptionName">{t(SLOT_LABEL_KEY[slot])}</span>
                <span className="medSlotOptionTime">
                  {taken ? t('meds.add.slotExists') : DEFAULT_SLOT_TIMES[slot]}
                </span>
              </label>
            );
          })}
        </fieldset>

        {allSlotsUsed && <p className="medDialogNote">{t('meds.add.allSlotsUsed')}</p>}

        <label className="medField">
          <span>{t('meds.add.startDate')}</span>
          <input
            type="date"
            value={startDate}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setStartDate(event.target.value);
            }}
          />
        </label>

        <label className="medField">
          <span>{t('meds.add.endDate')}</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setEndDate(event.target.value);
            }}
          />
          <small>{t('meds.add.endDateOptional')}</small>
        </label>

        <p className="medDialogNote">{t('meds.add.timeNote')}</p>

        {formError && (
          <p className="medDialogError" role="alert">
            {formError}
          </p>
        )}

        <div className="medDialogActions">
          <button type="button" className="medButtonGhost" onClick={onClose} disabled={submitting}>
            {t('meds.cancel')}
          </button>
          <button
            type="button"
            className="medButtonPrimary"
            onClick={() => void handleSubmit()}
            disabled={submitting || allSlotsUsed}
          >
            {submitting ? t('meds.add.submitting') : t('meds.add.submit')}
          </button>
        </div>
      </section>
    </div>
  );
}
