import { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SLOT_TIMES,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationSlotType,
} from '../../types/medication';
import { todayLocalDateString } from '../../utils/date';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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

  const allSlotsUsed = SLOT_TYPES.every((slot) => existingSlots.includes(slot));

  // 驗證規則集中在 schema。訊息需要 t，故隨語言重建。
  const schema = useMemo(
    () =>
      z
        .object({
          slots: z.array(z.enum(SLOT_TYPES)).min(1, t('meds.add.needSlot')),
          startDate: z.string().min(1),
          endDate: z.string(),
        })
        // YYYY-MM-DD 可直接字串比較，不需解析日期
        .refine((v) => !v.endDate || v.endDate >= v.startDate, {
          message: t('meds.add.dateOrderError'),
          path: ['endDate'],
        }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { slots: [], startDate: todayLocalDateString(), endDate: '' },
  });

  const startDate = watch('startDate');

  // 送出失敗的訊息掛在 root 上，與欄位錯誤共用同一套顯示機制
  const formError =
    errors.root?.message ?? errors.slots?.message ?? errors.endDate?.message ?? null;

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values.slots, values.startDate, values.endDate || undefined);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  return (
    // Dialog 取代手刻遮罩：焦點鎖定、Escape、焦點歸位、背景鎖捲皆內建。
    // 關閉鈕用 DialogContent 內建的那顆（原本是自刻的 × 按鈕）。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.add.title')}</DialogTitle>
          <DialogDescription>
            {t('meds.add.targetField')} <strong className="text-foreground">{targetName}</strong>
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          {/* 複選欄位交給 Controller 管理陣列值 */}
          <Controller
            control={control}
            name="slots"
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">{t('meds.add.slotsField')}</FieldLegend>
                <div className="flex flex-col gap-2">
                  {SLOT_TYPES.map((slot) => {
                    const taken = existingSlots.includes(slot);
                    const checked = field.value.includes(slot);
                    return (
                      <Field
                        key={slot}
                        orientation="horizontal"
                        className={cn(
                          'rounded-xl border p-3 transition-colors has-data-checked:border-primary has-data-checked:bg-primary/5',
                          taken && 'opacity-55',
                        )}
                      >
                        <Checkbox
                          id={`slot-${slot}`}
                          checked={checked}
                          disabled={taken || isSubmitting}
                          onCheckedChange={() =>
                            field.onChange(
                              checked
                                ? field.value.filter((item) => item !== slot)
                                : [...field.value, slot],
                            )
                          }
                        />
                        <FieldLabel htmlFor={`slot-${slot}`} className="text-base">
                          {t(SLOT_LABEL_KEY[slot])}
                        </FieldLabel>
                        {taken ? (
                          <Badge variant="secondary">{t('meds.add.slotExists')}</Badge>
                        ) : (
                          <span className="num text-sm text-muted-foreground">
                            {DEFAULT_SLOT_TIMES[slot]}
                          </span>
                        )}
                      </Field>
                    );
                  })}
                </div>
                {allSlotsUsed && (
                  <FieldDescription>{t('meds.add.allSlotsUsed')}</FieldDescription>
                )}
              </FieldSet>
            )}
          />

          <Field>
            <FieldLabel htmlFor="startDate">{t('meds.add.startDate')}</FieldLabel>
            <Input id="startDate" type="date" disabled={isSubmitting} {...register('startDate')} />
          </Field>

          <Field>
            <FieldLabel htmlFor="endDate">{t('meds.add.endDate')}</FieldLabel>
            <Input
              id="endDate"
              type="date"
              min={startDate}
              disabled={isSubmitting}
              {...register('endDate')}
            />
            <FieldDescription>{t('meds.add.endDateOptional')}</FieldDescription>
          </Field>

          <FieldDescription>{t('meds.add.timeNote')}</FieldDescription>
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
            disabled={isSubmitting}
          >
            {t('meds.cancel')}
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => void submit()}
            disabled={isSubmitting || allSlotsUsed}
          >
            {isSubmitting ? t('meds.add.submitting') : t('meds.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
