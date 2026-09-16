import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import type { CreateMenstrualRecordRequest, MenstrualFlow } from '../../types/health';
import {
  FLOW_OPTIONS,
  menstrualDefaults,
  menstrualSchema,
  type MenstrualFormValues,
} from './healthRecordForm';
import { todayTaipei } from '@/lib/taipeiCalendar';

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
import { HealthField, HealthInput, HealthTextarea } from '../PersonalHealth/HealthFields';

interface MenstrualFormDialogProps {
  onClose: () => void;
  onSubmit: (body: CreateMenstrualRecordRequest) => Promise<void>;
}

/** 新增一筆經期紀錄。開始日期必填、不得晚於今天；結束日期／血量／備註皆選填。 */
export function MenstrualFormDialog({ onClose, onSubmit }: MenstrualFormDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const schema = useMemo(() => menstrualSchema(t), [t]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MenstrualFormValues>({
    resolver: zodResolver(schema),
    defaultValues: menstrualDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const flow = watch('flow');

  const save = handleSubmit(async (values) => {
    setSubmitError('');
    setSaving(true);
    try {
      await onSubmit({
        start_date: values.startDate,
        end_date: values.endDate.trim() || undefined,
        flow: (values.flow || undefined) as MenstrualFlow | undefined,
        note: values.note.trim() || undefined,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('health.menstrual.addTitle')}</DialogTitle>
          <DialogDescription>{t('health.menstrual.addHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate>
          <FieldGroup>
            <HealthField
              htmlFor="menstrual-start"
              label={t('health.menstrual.startDate')}
              error={errors.startDate}
            >
              <HealthInput
                id="menstrual-start"
                type="text"
                placeholder="YYYY-MM-DD"
                max={todayTaipei()}
                invalid={Boolean(errors.startDate)}
                register={register('startDate')}
              />
            </HealthField>
            <HealthField
              htmlFor="menstrual-end"
              label={t('health.menstrual.endDate')}
              hint={t('health.form.optionalHint')}
              error={errors.endDate}
            >
              <HealthInput
                id="menstrual-end"
                type="text"
                placeholder="YYYY-MM-DD"
                invalid={Boolean(errors.endDate)}
                register={register('endDate')}
              />
            </HealthField>
            <HealthField htmlFor="menstrual-flow" label={t('health.menstrual.flow')}>
              <Select
                value={flow}
                onValueChange={(value) =>
                  setValue('flow', (value ?? '') as typeof flow, { shouldDirty: true })
                }
              >
                <SelectTrigger id="menstrual-flow" className="w-full">
                  <SelectValue placeholder={t('health.form.optionalHint')}>
                    {(value) => {
                      const option = FLOW_OPTIONS.find((o) => o.value === value);
                      return option ? t(option.labelKey) : t('health.form.optionalHint');
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FLOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </HealthField>
            <HealthField htmlFor="menstrual-note" label={t('health.menstrual.note')} error={errors.note}>
              <HealthTextarea id="menstrual-note" register={register('note')} />
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
