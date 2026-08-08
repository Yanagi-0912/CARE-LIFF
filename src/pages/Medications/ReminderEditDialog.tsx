import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  SLOT_LABEL_KEY,
  type MedicationReminder,
  type UpdateReminderRequest,
} from '../../types/medication';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as S from './styles';

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

  // 刪除確認仍是 UI 狀態，不屬於表單值
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const slotLabel = t(SLOT_LABEL_KEY[reminder.slot_type]);
  const hadEndDate = Boolean(reminder.end_date);

  // 三條驗證規則集中在 schema（原本是 handleSave 開頭的三段 if）
  const schema = useMemo(
    () =>
      z
        .object({
          time: z.string().min(1, t('meds.updateFailed')),
          startDate: z.string().min(1),
          endDate: z.string(),
          enabled: z.boolean(),
        })
        .refine((v) => !v.endDate || v.endDate >= v.startDate, {
          message: t('meds.add.dateOrderError'),
          path: ['endDate'],
        })
        // 後端會濾掉 null 欄位，無法把已設定的結束日期清成「長期」
        .refine((v) => !hadEndDate || Boolean(v.endDate), {
          message: t('meds.edit.endDateNote'),
          path: ['endDate'],
        }),
    [t, hadEndDate],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      time: reminder.scheduled_time,
      startDate: reminder.start_date,
      endDate: reminder.end_date ?? '',
      enabled: reminder.enabled,
    },
  });

  const formError =
    errors.root?.message ?? errors.time?.message ?? errors.endDate?.message ?? null;

  const submit = handleSubmit(async (values) => {
    // 只送出真正變動的欄位
    const patch: UpdateReminderRequest = {};
    if (values.time !== reminder.scheduled_time) patch.scheduled_time = values.time;
    if (values.startDate !== reminder.start_date) patch.start_date = values.startDate;
    if (values.endDate && values.endDate !== reminder.end_date) patch.end_date = values.endDate;
    if (values.enabled !== reminder.enabled) patch.enabled = values.enabled;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await onSave(patch);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const busy = isSubmitting || deleting;

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

        <DialogTitle className={S.DIALOG_H2}>{t('meds.edit.title')}</DialogTitle>

        <p className={S.DIALOG_TARGET}>
          <span>{t('meds.add.slotsField')}</span>
          <strong className={S.DIALOG_TARGET_STRONG}>{slotLabel}</strong>
        </p>

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.edit.time')}</span>
          <input
            className={S.FIELD_INPUT}
            type="time"
            disabled={busy}
            {...register('time')}
          />
        </label>

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.edit.startDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            disabled={busy}
            {...register('startDate')}
          />
        </label>

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.edit.endDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            disabled={busy}
            {...register('endDate')}
          />
          {hadEndDate && <small className={S.FIELD_HINT}>{t('meds.edit.endDateNote')}</small>}
        </label>

        <label className={S.FIELD_INLINE}>
          <input
            className={S.SLOT_CHECKBOX}
            type="checkbox"
            disabled={busy}
            {...register('enabled')}
          />
          <span>{t('meds.edit.enabled')}</span>
        </label>

        {formError && (
          <p className={S.ERROR} role="alert">
            {formError}
          </p>
        )}

        <div className={S.ACTIONS}>
          <Button type="button" className={S.BTN_GHOST} onClick={onClose} disabled={busy}>
            {t('meds.cancel')}
          </Button>
          <Button
            type="button"
            className={S.BTN_PRIMARY}
            onClick={() => void submit()}
            disabled={busy}
          >
            {isSubmitting ? t('meds.edit.saving') : t('meds.edit.save')}
          </Button>
        </div>

        <div className={S.DANGER_ZONE}>
          {confirmingDelete ? (
            <>
              <p className={S.DANGER_P} role="alert">{t('meds.edit.deleteConfirm')}</p>
              <div className={S.ACTIONS}>
                <Button
                  type="button"
                  className={S.BTN_GHOST}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                >
                  {t('meds.edit.deleteConfirmNo')}
                </Button>
                <Button
                  type="button"
                  className={S.BTN_DANGER}
                  onClick={() => void handleDelete()}
                  disabled={busy}
                >
                  {t('meds.edit.deleteConfirmYes')}
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className={S.DELETE_LINK}
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              {t('meds.edit.delete')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
