import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LockIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react';

import { fetchAlertThresholds, updateAlertThresholds } from '../../api/healthApi';
import { queryKeys } from '@/lib/queryClient';
import {
  formValuesToThresholdPayload,
  thresholdDefaults,
  thresholdSchema,
  thresholdToFormValues,
  type ThresholdFormValues,
} from './healthRecordForm';

import { Alert, AlertTitle } from '@/components/ui/alert';
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

interface ThresholdFieldMeta {
  name: keyof ThresholdFormValues;
  labelKey: string;
  unit: string;
}

// 一次展示全部七項，不分血壓／血糖分頁各開一份——PUT 是整份覆寫，
// 分開編輯會讓其中一邊的送出把另一邊清空（healthRecordForm.ts 的說明）。
const FIELD_GROUPS: { titleKey: string; fields: ThresholdFieldMeta[] }[] = [
  {
    titleKey: 'health.threshold.groupBloodPressure',
    fields: [
      { name: 'systolicHigh', labelKey: 'health.threshold.systolicHigh', unit: 'mmHg' },
      { name: 'systolicLow', labelKey: 'health.threshold.systolicLow', unit: 'mmHg' },
      { name: 'diastolicHigh', labelKey: 'health.threshold.diastolicHigh', unit: 'mmHg' },
      { name: 'diastolicLow', labelKey: 'health.threshold.diastolicLow', unit: 'mmHg' },
    ],
  },
  {
    titleKey: 'health.threshold.groupBloodGlucose',
    fields: [
      { name: 'glucoseFastingHigh', labelKey: 'health.threshold.glucoseFastingHigh', unit: 'mg/dL' },
      { name: 'glucoseNonfastingHigh', labelKey: 'health.threshold.glucoseNonfastingHigh', unit: 'mg/dL' },
      { name: 'glucoseLow', labelKey: 'health.threshold.glucoseLow', unit: 'mg/dL' },
    ],
  },
];

interface AlertThresholdDialogProps {
  targetUserId?: string;
  /** 本人一律可編輯；代看家人時看 canRecordHealthFor（CAREGIVER 唯讀）。 */
  readOnly: boolean;
  onClose: () => void;
}

/**
 * 提醒範圍設定（9.3）。本人與具寫入權的 GUARDIAN 可編輯，CAREGIVER 唯讀。
 *
 * 唯讀時完全不掛表單——不是把欄位 disable，那樣螢幕閱讀器還是會把它們唸成
 * 「可以互動但按不動」，改成一份純顯示的清單，沒設定的項目顯示「未設定」。
 */
export function AlertThresholdDialog({ targetUserId, readOnly, onClose }: AlertThresholdDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.healthAlertThresholds(targetUserId);

  const { data: threshold, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchAlertThresholds(targetUserId),
  });

  const values = useMemo(
    () => (threshold === undefined ? undefined : thresholdToFormValues(threshold)),
    [threshold],
  );

  const schema = useMemo(() => thresholdSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ThresholdFormValues>({
    resolver: zodResolver(schema),
    defaultValues: thresholdDefaults,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const [submitError, setSubmitError] = useState('');

  const mutation = useMutation({
    mutationFn: (body: ThresholdFormValues) =>
      updateAlertThresholds(formValuesToThresholdPayload(body), targetUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('health.threshold.saveSuccess'));
      onClose();
    },
    onError: (err) => {
      setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
    },
  });

  const loadState = threshold !== undefined ? 'ready' : isError ? 'error' : 'loading';

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('health.threshold.title')}</DialogTitle>
          <DialogDescription>
            {readOnly ? t('health.threshold.readOnlyHint') : t('health.threshold.editHint')}
          </DialogDescription>
        </DialogHeader>

        {loadState === 'loading' ? (
          <p className="flex items-center gap-2 py-6 text-base text-muted-foreground" role="status">
            <Spinner aria-hidden="true" />
            {t('health.loading')}
          </p>
        ) : loadState === 'error' ? (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>{t('health.loadError')}</AlertTitle>
            </Alert>
            <Button
              type="button"
              variant="outline"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <RotateCwIcon data-icon="inline-start" />}
              {t('health.retry')}
            </Button>
          </div>
        ) : readOnly ? (
          <div className="flex flex-col gap-4">
            {readOnly && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LockIcon className="size-4 shrink-0" />
                {t('health.threshold.readOnlyBadge')}
              </p>
            )}
            {FIELD_GROUPS.map((group) => (
              <div key={group.titleKey}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(group.titleKey)}
                </p>
                <dl className="grid gap-2">
                  {group.fields.map((field) => (
                    <div key={field.name} className="flex items-baseline justify-between gap-3">
                      <dt className="text-sm text-muted-foreground">{t(field.labelKey)}</dt>
                      <dd className="num text-right text-sm font-semibold">
                        {values?.[field.name]
                          ? `${values[field.name]} ${field.unit}`
                          : t('health.threshold.unset')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t('health.form.cancel')}
            </DialogClose>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit((formValues) => {
              setSubmitError('');
              mutation.mutate(formValues);
            })}
            noValidate
          >
            <div className="flex flex-col gap-6">
              {FIELD_GROUPS.map((group) => (
                <FieldGroup key={group.titleKey}>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(group.titleKey)}
                  </p>
                  {group.fields.map((field) => (
                    <HealthField
                      key={field.name}
                      htmlFor={`threshold-${field.name}`}
                      label={t(field.labelKey)}
                      hint={field.unit}
                      error={errors[field.name]}
                    >
                      <HealthInput
                        id={`threshold-${field.name}`}
                        type="number"
                        invalid={Boolean(errors[field.name])}
                        register={register(field.name)}
                      />
                    </HealthField>
                  ))}
                </FieldGroup>
              ))}
            </div>

            {submitError && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {submitError}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <Button type="submit" size="lg" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner aria-hidden="true" /> : null}
                {mutation.isPending ? t('health.form.saving') : t('health.form.save')}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>
                {t('health.form.cancel')}
              </DialogClose>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
