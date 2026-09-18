import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import type { CreateMeasurementRequest, MealContext, MeasurementKind } from '../../types/health';
import {
  MEAL_CONTEXT_OPTIONS,
  bloodGlucoseDefaults,
  bloodGlucoseSchema,
  bloodPressureDefaults,
  bloodPressureSchema,
  type BloodGlucoseFormValues,
  type BloodPressureFormValues,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { HealthField, HealthInput } from '../PersonalHealth/HealthFields';

interface MeasurementFormDialogProps {
  kind: MeasurementKind;
  onClose: () => void;
  onSubmit: (body: CreateMeasurementRequest) => Promise<void>;
}

/**
 * 新增一筆血壓或血糖紀錄。血壓、血糖各自的欄位不同，但共用同一個對話框骨架
 * ——同 healthApi 的 `CreateMeasurementRequest` 是同一個端點的聯集，這裡是
 * 表單層的鏡射。
 *
 * `measured_at` 不提供輸入欄位：多數情況是量測完立刻記錄，讓後端補上送出
 * 當下時間就好；補記較舊的量測不是這裡要解決的情境，日後有需要再加。
 */
export function MeasurementFormDialog({ kind, onClose, onSubmit }: MeasurementFormDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (kind === 'blood_pressure') {
    return (
      <BloodPressureForm
        t={t}
        saving={saving}
        submitError={submitError}
        onClose={onClose}
        onSave={async (values) => {
          setSubmitError('');
          setSaving(true);
          try {
            await onSubmit({
              systolic: Number(values.systolic),
              diastolic: Number(values.diastolic),
              pulse: values.pulse.trim() ? Number(values.pulse) : undefined,
            });
          } catch (err) {
            setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
          } finally {
            setSaving(false);
          }
        }}
      />
    );
  }

  return (
    <BloodGlucoseForm
      t={t}
      saving={saving}
      submitError={submitError}
      onClose={onClose}
      onSave={async (values) => {
        setSubmitError('');
        setSaving(true);
        try {
          await onSubmit({
            glucose_mg_dl: Number(values.glucose),
            // schema 已驗證非空，這裡的型別窄化只是讓 TS 滿意
            meal_context: values.mealContext as MealContext,
          });
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}

type TFn = (key: string, options?: Record<string, string | number>) => string;

function BloodPressureForm({
  t,
  saving,
  submitError,
  onClose,
  onSave,
}: {
  t: TFn;
  saving: boolean;
  submitError: string;
  onClose: () => void;
  onSave: (values: BloodPressureFormValues) => Promise<void>;
}) {
  const schema = useMemo(() => bloodPressureSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BloodPressureFormValues>({
    resolver: zodResolver(schema),
    defaultValues: bloodPressureDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('health.form.addBloodPressure')}</DialogTitle>
          <DialogDescription>{t('health.form.bloodPressureHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} noValidate>
          <FieldGroup>
            <HealthField
              htmlFor="bp-systolic"
              label={t('health.field.systolic')}
              hint={t('health.form.rangeHint', { min: 50, max: 300, unit: 'mmHg' })}
              error={errors.systolic}
            >
              <HealthInput
                id="bp-systolic"
                type="number"
                invalid={Boolean(errors.systolic)}
                register={register('systolic')}
              />
            </HealthField>
            <HealthField
              htmlFor="bp-diastolic"
              label={t('health.field.diastolic')}
              hint={t('health.form.rangeHint', { min: 30, max: 200, unit: 'mmHg' })}
              error={errors.diastolic}
            >
              <HealthInput
                id="bp-diastolic"
                type="number"
                invalid={Boolean(errors.diastolic)}
                register={register('diastolic')}
              />
            </HealthField>
            <HealthField
              htmlFor="bp-pulse"
              label={t('health.field.pulse')}
              hint={t('health.form.optionalHint')}
              error={errors.pulse}
            >
              <HealthInput
                id="bp-pulse"
                type="number"
                invalid={Boolean(errors.pulse)}
                register={register('pulse')}
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

function BloodGlucoseForm({
  t,
  saving,
  submitError,
  onClose,
  onSave,
}: {
  t: TFn;
  saving: boolean;
  submitError: string;
  onClose: () => void;
  onSave: (values: BloodGlucoseFormValues) => Promise<void>;
}) {
  const schema = useMemo(() => bloodGlucoseSchema(t), [t]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<BloodGlucoseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: bloodGlucoseDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const mealContext = useWatch({ control, name: 'mealContext' });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('health.form.addBloodGlucose')}</DialogTitle>
          <DialogDescription>{t('health.form.bloodGlucoseHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} noValidate>
          <FieldGroup>
            <HealthField
              htmlFor="glucose-value"
              label={t('health.field.glucoseWithUnit')}
              hint={t('health.form.rangeHint', { min: 20, max: 800, unit: 'mg/dL' })}
              error={errors.glucose}
            >
              <HealthInput
                id="glucose-value"
                type="number"
                invalid={Boolean(errors.glucose)}
                register={register('glucose')}
              />
            </HealthField>

            <HealthField
              htmlFor="glucose-meal-context"
              label={t('health.field.mealContext')}
              error={errors.mealContext}
            >
              <Select
                value={mealContext}
                onValueChange={(value) => setValue('mealContext', (value ?? '') as typeof mealContext, {
                  shouldValidate: true,
                  shouldDirty: true,
                })}
              >
                <SelectTrigger id="glucose-meal-context" className="w-full">
                  <SelectValue placeholder={t('health.form.mealContextPlaceholder')}>
                    {(value) => {
                      const option = MEAL_CONTEXT_OPTIONS.find((o) => o.value === value);
                      return option ? t(option.labelKey) : t('health.form.mealContextPlaceholder');
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MEAL_CONTEXT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
