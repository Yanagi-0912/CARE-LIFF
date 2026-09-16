import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Undo2Icon } from 'lucide-react';

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
 * 「事後補上結束日期或修正紀錄」）。只有這一個欄位——開始日期、血量、備註
 * 不是這裡要解決的情境，維持最小的補完動作，同一顆對話框無論「補上」或
 * 「修改」都用得到（差別只在按鈕文字與是否已經有預設值，見
 * MenstrualTab.tsx）。
 *
 * 驗證規則同新增表單：結束日期不得早於開始日期、天數不得超過上限，最終仍
 * 以後端 422 為準（`healthRecordForm.ts` 的 `menstrualEndDateSchema`）。
 *
 * 已經有結束日期時另外提供「恢復為進行中」：後端 PATCH 明確支援
 * `end_date: null` 重新打開一筆紀錄（app/routers/users/health.py 的
 * docstring），現實情境是使用者標記結束後經期又持續，這是唯一能修正的
 * 方法。這個動作**不**走 `menstrualEndDateSchema`／`handleSubmit`——它送出
 * 的是固定的 `{ end_date: null }`，不是使用者輸入的文字，沒有欄位需要驗證；
 * 「設定／修正」那顆 Save 鈕的必填規則維持不變，兩個動作各自獨立。
 */
export function MenstrualEndDateDialog({ record, onClose, onSubmit }: MenstrualEndDateDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
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

  const handleClear = async () => {
    setSubmitError('');
    setClearing(true);
    try {
      await onSubmit({ end_date: null });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('health.form.genericError'));
    } finally {
      setClearing(false);
    }
  };

  const title = record.end_date ? t('health.menstrual.editEndDate') : t('health.menstrual.setEndDate');
  const busy = saving || clearing;

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
                // 同 MenstrualFormDialog：純文字框會讓格式不合的輸入變成字串比較
                // 的誤判。min 帶開始日期，選不到比開始日期還早的日子。
                type="date"
                min={record.start_date}
                invalid={Boolean(errors.endDate)}
                register={register('endDate')}
              />
            </HealthField>
          </FieldGroup>

          {record.end_date && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('health.menstrual.clearEndDateHint')}
            </p>
          )}

          {submitError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={busy}>
              {saving ? <Spinner aria-hidden="true" /> : null}
              {saving ? t('health.form.saving') : t('health.form.save')}
            </Button>
            {/* 只有已經有結束日期時才出現：進行中的紀錄本來就沒有值可清除，
                顯示這顆按鈕只會讓人以為還要再按一次才算數（§8 反 slop：不要
                給一個永遠沒有作用的動作）。 */}
            {record.end_date && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleClear()}
              >
                {clearing ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Undo2Icon data-icon="inline-start" />
                )}
                {clearing ? t('health.form.saving') : t('health.menstrual.clearEndDate')}
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>
              {t('health.form.cancel')}
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
