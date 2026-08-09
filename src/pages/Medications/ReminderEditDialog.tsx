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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** 表單掛在 dialog body 上，儲存鈕在 DialogFooter，靠 form 屬性連回來 */
const FORM_ID = 'edit-reminder-form';

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
    watch,
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

  const startDate = watch('startDate');

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      // 失敗時收掉確認框，錯誤訊息顯示在下層的編輯表單裡
      setConfirmOpen(false);
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    } finally {
      setDeleting(false);
    }
  };

  const busy = isSubmitting || deleting;

  return (
    // Dialog 內建焦點鎖定、Escape、焦點歸位、背景鎖捲，關閉鈕用 DialogContent 內建那顆。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('meds.add.slotsField')} <strong className="text-foreground">{slotLabel}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* 只讓表單本體捲動，標題與底部按鈕（含右上關閉鈕）固定不動 */}
        <form id={FORM_ID} onSubmit={(e) => void submit(e)} className="overflow-y-auto">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.time)}>
              <FieldLabel htmlFor="edit-time">{t('meds.edit.time')}</FieldLabel>
              <Input
                id="edit-time"
                type="time"
                aria-invalid={Boolean(errors.time)}
                disabled={busy}
                {...register('time')}
              />
              <FieldError errors={[errors.time]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-start">{t('meds.edit.startDate')}</FieldLabel>
              <Input id="edit-start" type="date" disabled={busy} {...register('startDate')} />
            </Field>

            <Field data-invalid={Boolean(errors.endDate)}>
              <FieldLabel htmlFor="edit-end">{t('meds.edit.endDate')}</FieldLabel>
              <Input
                id="edit-end"
                type="date"
                min={startDate}
                aria-invalid={Boolean(errors.endDate)}
                disabled={busy}
                {...register('endDate')}
              />
              {hadEndDate && <FieldDescription>{t('meds.edit.endDateNote')}</FieldDescription>}
              <FieldError errors={[errors.endDate]} />
            </Field>

            {/* Base UI 的 Checkbox 不是原生 input，register 的 onChange 對不上，
                所以這一欄改由 Controller 接 checked / onCheckedChange */}
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                // FieldLabel 包住 Field 就會變成可點的選取卡片，勾選高亮是元件內建的
                <FieldLabel htmlFor="edit-enabled">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="edit-enabled"
                      checked={field.value}
                      disabled={busy}
                      onCheckedChange={field.onChange}
                    />
                    <FieldContent>
                      <FieldTitle>{t('meds.edit.enabled')}</FieldTitle>
                      <FieldDescription>
                        {field.value ? t('meds.statusOn') : t('meds.statusOff')}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              )}
            />

            {errors.root?.message && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          {/* 刪除確認交給 AlertDialog（原本是自刻的 confirmingDelete 分支） */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={<Button variant="destructive" disabled={busy} className="sm:mr-auto" />}
            >
              {t('meds.edit.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('meds.edit.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('meds.edit.deleteConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>
                  {t('meds.edit.deleteConfirmNo')}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  {t('meds.edit.deleteConfirmYes')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('meds.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={busy}>
            {isSubmitting ? t('meds.edit.saving') : t('meds.edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
