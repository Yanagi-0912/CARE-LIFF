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

        {/* 複選欄位交給 Controller 管理陣列值 */}
        <Controller
          control={control}
          name="slots"
          render={({ field }) => (
            <fieldset className={S.SLOT_PICKER}>
              <legend className={S.SLOT_LEGEND}>{t('meds.add.slotsField')}</legend>
              {SLOT_TYPES.map((slot) => {
                const taken = existingSlots.includes(slot);
                const checked = field.value.includes(slot);
                return (
                  <label key={slot} className={cn(S.SLOT_OPTION, taken && S.SLOT_TAKEN)}>
                    <input
                      className={S.SLOT_CHECKBOX}
                      type="checkbox"
                      checked={checked}
                      disabled={taken || isSubmitting}
                      onChange={() =>
                        field.onChange(
                          checked
                            ? field.value.filter((item) => item !== slot)
                            : [...field.value, slot],
                        )
                      }
                    />
                    <span className={S.SLOT_NAME}>{t(SLOT_LABEL_KEY[slot])}</span>
                    <span className={S.SLOT_TIME}>
                      {taken ? t('meds.add.slotExists') : DEFAULT_SLOT_TIMES[slot]}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        />

        {allSlotsUsed && <p className={S.NOTE}>{t('meds.add.allSlotsUsed')}</p>}

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.add.startDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            disabled={isSubmitting}
            {...register('startDate')}
          />
        </label>

        <label className={S.FIELD}>
          <span className={S.FIELD_LABEL}>{t('meds.add.endDate')}</span>
          <input
            className={S.FIELD_INPUT}
            type="date"
            min={startDate}
            disabled={isSubmitting}
            {...register('endDate')}
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
          <Button type="button" className={S.BTN_GHOST} onClick={onClose} disabled={isSubmitting}>
            {t('meds.cancel')}
          </Button>
          <Button
            type="button"
            className={S.BTN_PRIMARY}
            onClick={() => void submit()}
            disabled={isSubmitting || allSlotsUsed}
          >
            {isSubmitting ? t('meds.add.submitting') : t('meds.add.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
