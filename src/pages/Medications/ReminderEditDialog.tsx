import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SLOT_LABEL_KEY,
  type MedicationReminder,
  type UpdateReminderRequest,
} from '../../types/medication';

interface ReminderEditDialogProps {
  reminder: MedicationReminder;
  onSave: (patch: UpdateReminderRequest) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function ReminderEditDialog({
  reminder,
  onSave,
  onDelete,
  onClose,
}: ReminderEditDialogProps) {
  const { t } = useTranslation();

  const [time, setTime] = useState(reminder.scheduled_time);
  const [startDate, setStartDate] = useState(reminder.start_date);
  const [endDate, setEndDate] = useState(reminder.end_date ?? '');
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slotLabel = t(SLOT_LABEL_KEY[reminder.slot_type]);
  const hadEndDate = Boolean(reminder.end_date);

  const handleSave = async () => {
    if (!time) {
      setFormError(t('meds.updateFailed'));
      return;
    }
    if (endDate && endDate < startDate) {
      setFormError(t('meds.add.dateOrderError'));
      return;
    }
    // 後端會濾掉 null 欄位，無法把已設定的結束日期清成「長期」
    if (hadEndDate && !endDate) {
      setFormError(t('meds.edit.endDateNote'));
      return;
    }

    const patch: UpdateReminderRequest = {};
    if (time !== reminder.scheduled_time) patch.scheduled_time = time;
    if (startDate !== reminder.start_date) patch.start_date = startDate;
    if (endDate && endDate !== reminder.end_date) patch.end_date = endDate;
    if (enabled !== reminder.enabled) patch.enabled = enabled;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await onSave(patch);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('meds.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      await onDelete();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('meds.updateFailed'));
      setConfirmingDelete(false);
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
        aria-labelledby="med-edit-title"
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

        <h2 id="med-edit-title">{t('meds.edit.title')}</h2>

        <p className="medDialogTarget">
          <span>{t('meds.add.slotsField')}</span>
          <strong>{slotLabel}</strong>
        </p>

        <label className="medField">
          <span>{t('meds.edit.time')}</span>
          <input
            type="time"
            value={time}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setTime(event.target.value);
            }}
          />
        </label>

        <label className="medField">
          <span>{t('meds.edit.startDate')}</span>
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
          <span>{t('meds.edit.endDate')}</span>
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
          {hadEndDate && <small>{t('meds.edit.endDateNote')}</small>}
        </label>

        <label className="medFieldInline">
          <input
            type="checkbox"
            checked={enabled}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setEnabled(event.target.checked);
            }}
          />
          <span>{t('meds.edit.enabled')}</span>
        </label>

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
            onClick={() => void handleSave()}
            disabled={submitting}
          >
            {submitting ? t('meds.edit.saving') : t('meds.edit.save')}
          </button>
        </div>

        <div className="medDangerZone">
          {confirmingDelete ? (
            <>
              <p role="alert">{t('meds.edit.deleteConfirm')}</p>
              <div className="medDialogActions">
                <button
                  type="button"
                  className="medButtonGhost"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={submitting}
                >
                  {t('meds.edit.deleteConfirmNo')}
                </button>
                <button
                  type="button"
                  className="medButtonDanger"
                  onClick={() => void handleDelete()}
                  disabled={submitting}
                >
                  {t('meds.edit.deleteConfirmYes')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="medDeleteLink"
              onClick={() => setConfirmingDelete(true)}
              disabled={submitting}
            >
              {t('meds.edit.delete')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
