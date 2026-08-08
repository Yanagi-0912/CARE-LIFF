import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SLOT_TIMES,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationSlotType,
} from '../../types/medication';
import { todayLocalDateString } from '../../utils/date';
import { cn } from '@/lib/utils';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as S from './styles';

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
    // Dialog 取代手刻遮罩：焦點鎖定、Escape、焦點歸位、背景鎖捲皆內建。
    // showCloseButton={false}：沿用原本的 × 鈕（其 aria-label 為既有無障礙標籤）。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={S.DIALOG} showCloseButton={false}>
        <DialogClose
          render={
            <button type="button" className={S.DIALOG_CLOSE} aria-label={t('meds.close')}>×</button>
          }
        />

        <DialogTitle className={S.DIALOG_H2}>{t('meds.add.title')}</DialogTitle>

        <p className={S.DIALOG_TARGET}>
          <span>{t('meds.add.targetField')}</span>
          <strong className={S.DIALOG_TARGET_STRONG}>{targetName}</strong>
        </p>

        <fieldset className={S.SLOT_PICKER}>
          <legend className={S.SLOT_LEGEND}>{t('meds.add.slotsField')}</legend>
          {SLOT_TYPES.map((slot) => {
            const taken = existingSlots.includes(slot);
            return (
              <label key={slot} className={cn(S.SLOT_OPTION, taken && S.SLOT_TAKEN)}>
                <input
                  className={S.SLOT_CHECKBOX}
                  type="checkbox"
                  checked={selected.includes(slot)}
                  disabled={taken || submitting}
                  onChange={() => toggleSlot(slot)}
                />
                <span className={S.SLOT_NAME}>{t(SLOT_LABEL_KEY[slot])}</span>
                <span className={S.SLOT_TIME}>
                  {taken ? t('meds.add.slotExists') : DEFAULT_SLOT_TIMES[slot]}
                </span>
              </label>
            );
          })}
        </fieldset>

        {allSlotsUsed && <p className={S.NOTE}>{t('meds.add.allSlotsUsed')}</p>}

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.add.startDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            value={startDate}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setStartDate(event.target.value);
            }}
          />
        </label>

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.add.endDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            value={endDate}
            min={startDate}
            disabled={submitting}
            onChange={(event) => {
              setFormError(null);
              setEndDate(event.target.value);
            }}
          />
          <small className={S.FIELD_HINT}>{t('meds.add.endDateOptional')}</small>
        </label>

        <p className={S.NOTE}>{t('meds.add.timeNote')}</p>

        {formError && (
          <p className={S.ERROR} role="alert">
            {formError}
          </p>
        )}

        <div className={S.ACTIONS}>
          <Button type="button" className={S.BTN_GHOST} onClick={onClose} disabled={submitting}>
            {t('meds.cancel')}
          </Button>
          <Button
            type="button"
            className={S.BTN_PRIMARY}
            onClick={() => void handleSubmit()}
            disabled={submitting || allSlotsUsed}
          >
            {submitting ? t('meds.add.submitting') : t('meds.add.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
