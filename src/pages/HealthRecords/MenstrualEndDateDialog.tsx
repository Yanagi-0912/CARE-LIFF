import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import type { MenstrualRecord, UpdateMenstrualRecordRequest } from '../../types/health';
import {
  menstrualEndDateDefaults,
  menstrualEndDateSchema,
  type MenstrualEndDateFormValues,
} from './healthRecordForm';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { HealthField, HealthInput } from '../PersonalHealth/HealthFields';

interface MenstrualEndDateDialogProps {
  record: MenstrualRecord;
  onClose: () => void;
  onSubmit: (body: UpdateMenstrualRecordRequest) => Promise<void>;
}

/**
 * 事後補上或修改一筆既有經期紀錄的結束日期（menstrual-cycle-log 規格
 * 「事後補上結束日期」）。只有這一個欄位——開始日期、血量、備註不是這裡
 * 要解決的情境，維持最小的補完動作，同一顆對話框無論「補上」或「修改」
 * 都用得到（差別只在按鈕文字與是否已經有預設值，見 MenstrualTab.tsx）。
 *
 * 驗證規則同新增表單：結束日期不得早於開始日期、天數不得超過上限，最終仍
 * 以後端 422 為準（`healthRecordForm.ts` 的 `menstrualEndDateSchema`）。
 */
export function MenstrualEndDateDialog({ record, onClose, onSubmit }: MenstrualEndDateDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const schema = useMemo(() => menstrualEndDateSchema(t, record.start_date), [t, record.start_date]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MenstrualEndDateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...menstrualEndDateDefaults, endDate: record.end_date ?? '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const save = handleSubmit(async (values) => {
    setSubmitError('');
    setSaving(true);
    try {
      await onSubmit({ end_date: values.endDate });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
    } finally {
      setSaving(false);
    }
  });

  const title = record.end_date ? t('health.menstrual.editEndDate') : t('health.menstrual.setEndDate');

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t('health.menstrual.editEndDateHint', { start: record.start_date })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate>
          <FieldGroup>
            <HealthField
              htmlFor="menstrual-end-date-only"
              label={t('health.menstrual.endDate')}
              error={errors.endDate}
            >
              <HealthInput
                id="menstrual-end-date-only"
                type="text"
                placeholder="YYYY-MM-DD"
                invalid={Boolean(errors.endDate)}
                register={register('endDate')}
              />
            </HealthField>
          </FieldGroup>

          {submitError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <Spinner aria-hidden="true" /> : null}
              {saving ? t('health.form.saving') : t('health.form.save')}
            </Button>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t('health.form.cancel')}
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
