import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  SLOT_LABEL_KEY,
  type MedicationReminder,
  type UpdateReminderRequest,
} from '../../types/medication';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

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
    control,
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('meds.add.slotsField')} <strong className="text-foreground">{slotLabel}</strong>
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-time">{t('meds.edit.time')}</FieldLabel>
            <Input id="edit-time" type="time" disabled={busy} {...register('time')} />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-start">{t('meds.edit.startDate')}</FieldLabel>
            <Input id="edit-start" type="date" disabled={busy} {...register('startDate')} />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-end">{t('meds.edit.endDate')}</FieldLabel>
            <Input id="edit-end" type="date" disabled={busy} {...register('endDate')} />
            {hadEndDate && <FieldDescription>{t('meds.edit.endDateNote')}</FieldDescription>}
          </Field>

          {/* Base UI 的 Checkbox 不是原生 input，register 的 onChange 對不上，
              所以這一欄改由 Controller 接 checked / onCheckedChange */}
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="edit-enabled"
                  checked={field.value}
                  disabled={busy}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="edit-enabled" className="text-base">
                  {t('meds.edit.enabled')}
                </FieldLabel>
              </Field>
            )}
          />
        </FieldGroup>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={busy}
          >
            {t('meds.cancel')}
          </Button>
          <Button type="button" className="flex-1" onClick={() => void submit()} disabled={busy}>
            {isSubmitting ? t('meds.edit.saving') : t('meds.edit.save')}
          </Button>
        </DialogFooter>

        <Separator />

        <div className="flex flex-col gap-2">
          {confirmingDelete ? (
            <>
              <Alert variant="destructive">
                <AlertDescription>{t('meds.edit.deleteConfirm')}</AlertDescription>
              </Alert>
              <div className="flex gap-2 [&>button]:flex-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                >
                  {t('meds.edit.deleteConfirmNo')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
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
              className="self-center text-destructive underline hover:text-destructive"
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
