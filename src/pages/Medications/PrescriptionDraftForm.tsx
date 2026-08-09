import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { TriangleAlertIcon } from 'lucide-react';
import { useFamily } from '../../hooks/useFamily';
import { getLineUserId } from '../../utils/auth';
import { commitPrescriptionDraft } from '../../api/medicationApi';
import { SLOT_LABEL_KEY, SLOT_TYPES, type MedicationSlotType } from '../../types/medication';
import {
  FREQUENCY_TO_SLOTS,
  type CommitDrugItem,
  type PrescriptionCommitResult,
  type PrescriptionDraft,
  type RecognizedDrug,
} from '../../types/prescription';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const FORM_ID = 'prescription-draft-form';

interface PrescriptionDraftFormProps {
  draft: PrescriptionDraft;
  onCommitted: (result: PrescriptionCommitResult) => void;
  onClose: () => void;
}

/** 每一列藥品的表單值，name／slots／durationDays 是使用者可編輯的部分，其餘欄位直接沿用辨識結果 */
interface DrugFormValue {
  include: boolean;
  name: string;
  slots: MedicationSlotType[];
  /** 療程天數；null 代表使用者未填（長期用藥，不設結束日） */
  durationDays: number | null;
}

/**
 * 驗證規則集中在這裡：OTHER 頻次的藥若被勾選要建立，就必須指定至少一個時段，
 * 否則後端會以 400 SlotsRequiredError 拒絕——這條規則要在表單層擋下，
 * 讓使用者在畫面上直接看到欄位錯誤，而不是送出後才收到一則伺服器錯誤。
 */
function buildSchema(t: TFunction, drugs: RecognizedDrug[]) {
  return z.object({
    targetUserId: z.string().min(1, t('meds.scan.draft.targetRequired')),
    drugs: z
      .array(
        z.object({
          include: z.boolean(),
          name: z.string().min(1, t('meds.scan.draft.nameRequired')),
          slots: z.array(z.enum(SLOT_TYPES)),
          durationDays: z
            .number({ error: t('meds.scan.draft.durationDaysInvalid') })
            .int({ message: t('meds.scan.draft.durationDaysInvalid') })
            .positive({ message: t('meds.scan.draft.durationDaysInvalid') })
            .nullable(),
        }),
      )
      .superRefine((rows, ctx) => {
        rows.forEach((row, index) => {
          const isOther = drugs[index]?.frequency_code === 'OTHER';
          if (row.include && isOther && row.slots.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.scan.draft.slotsRequired'),
              path: [index, 'slots'],
            });
          }
        });
      }),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

function toCommitDrug(original: RecognizedDrug, row: DrugFormValue): CommitDrugItem {
  // 使用者把藥名改成別的字串之後，掃描當下比對到的許可證字號就不再保證對應
  // 這個新名字——沿用舊證號等於把一個藥名和另一顆藥的許可證字號存在一起。
  // 重新比對是下一次掃描的責任，這裡只能清掉，不能悄悄留著舊值。
  const nameEdited = row.name !== original.name;
  return {
    name: row.name,
    generic_name: original.generic_name ?? undefined,
    license_number: nameEdited ? undefined : (original.license_number ?? undefined),
    unit_content: original.unit_content ?? undefined,
    total_quantity: original.total_quantity ?? undefined,
    usage_raw: original.usage_raw ?? undefined,
    frequency_code: original.frequency_code,
    indication: original.indication ?? undefined,
    duration_days: row.durationDays ?? undefined,
    // PRN 不論使用者勾了什麼都不帶時段：後端一律忽略、絕不建立提醒。
    // 其餘頻次一律照使用者目前的勾選狀態原樣送出，包含「全部取消勾選」——
    // 空陣列（使用者明確不要定時提醒）與「沒有覆寫」不是同一件事，
    // 後端不能因為收到空陣列就退回頻次代碼算出的預設時段。
    slots: original.frequency_code === 'PRN' ? undefined : row.slots,
    include: row.include,
  };
}

export function PrescriptionDraftForm({ draft, onCommitted, onClose }: PrescriptionDraftFormProps) {
  const { t } = useTranslation();
  const { members } = useFamily();

  const [selfUserId] = useState<string | undefined>(() => {
    try {
      return getLineUserId();
    } catch {
      return undefined;
    }
  });

  const targets = useMemo(
    () =>
      [
        { userId: selfUserId, name: t('meds.self') },
        ...members.map((member) => ({ userId: member.user_id, name: member.display_name || t('family.unset') })),
      ].filter((target): target is { userId: string; name: string } => Boolean(target.userId)),
    [selfUserId, members, t],
  );

  const drugs = draft.recognition.drugs;
  const hasOtherFrequency = drugs.some((drug) => drug.frequency_code === 'OTHER');
  // 一鍵確認只在後端判定為高信心、且沒有 OTHER 頻次藥品時提供。目前後端的
  // 信心度計算本就會讓兩者互斥（OTHER 一定落到 medium），這裡再擋一次
  // 是防呆，不依賴那份耦合關係在未來持續成立。
  const canOneTapConfirm = draft.confidence_level === 'high' && !hasOtherFrequency;

  const defaultTargetId =
    (draft.suggested_user_id && targets.some((tg) => tg.userId === draft.suggested_user_id)
      ? draft.suggested_user_id
      : selfUserId) ?? '';

  const schema = useMemo(() => buildSchema(t, drugs), [t, drugs]);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetUserId: defaultTargetId,
      // 時段勾選狀態要「預先」符合送出後實際會建立的提醒（產品規則：核對畫面
      // 是使用者唯一看得到「等一下會發生什麼事」的地方），否則 TID 藥品會顯示
      // 全部未勾選，看起來像不會建立每日三次提醒。PRN／OTHER 在
      // FREQUENCY_TO_SLOTS 裡本就對應空陣列，這裡不需要另外特判。
      drugs: drugs.map((drug) => ({
        include: true,
        name: drug.name,
        slots: FREQUENCY_TO_SLOTS[drug.frequency_code],
        durationDays: drug.duration_days ?? null,
      })),
    },
  });

  const { fields } = useFieldArray({ control, name: 'drugs' });

  const [oneTapSubmitting, setOneTapSubmitting] = useState(false);

  const submit = handleSubmit(async (values) => {
    try {
      const result = await commitPrescriptionDraft(draft.draft_id, {
        user_id: values.targetUserId,
        drugs: values.drugs.map((row, index) => toCommitDrug(drugs[index], row)),
      });
      onCommitted(result);
    } catch (err) {
      setError('root', { message: err instanceof Error ? err.message : t('meds.updateFailed') });
    }
  });

  // 「一鍵建立」是加速路徑，不是繞過核對的路徑：對象 ToggleGroup 與逐筆欄位
  // 在按鈕按下前都還是可編輯、可見的（見下方 canOneTapConfirm 區塊），使用者
  // 完全可能先改選對象或調整某一列再按一鍵建立。所以這裡一律讀 getValues()
  // 取得當下的表單狀態，走跟手動送出完全相同的 toCommitDrug 映射——絕不能有
  // 任一欄位繞過表單、直接沿用渲染當下算出的常數（那正是本次要修的重大缺陷：
  // 使用者在畫面上改了對象，一鍵建立卻沿用了舊的建議值）。
  const handleOneTapConfirm = async () => {
    setOneTapSubmitting(true);
    try {
      const values = getValues();
      const result = await commitPrescriptionDraft(draft.draft_id, {
        user_id: values.targetUserId,
        drugs: values.drugs.map((row, index) => toCommitDrug(drugs[index], row)),
      });
      onCommitted(result);
    } catch (err) {
      setError('root', { message: err instanceof Error ? err.message : t('meds.updateFailed') });
    } finally {
      setOneTapSubmitting(false);
    }
  };

  const busy = isSubmitting || oneTapSubmitting;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('meds.scan.draft.title')}</DialogTitle>
          <DialogDescription>{t('meds.scan.draft.aiNoticeTitle')}</DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} onSubmit={(e) => void submit(e)} className="overflow-y-auto">
          <FieldGroup>
            {/* 責任邊界聲明（產品規則 6）：辨識結果由 AI 產生，確認即代表已對照藥袋核對過 */}
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>{t('meds.scan.draft.aiNoticeTitle')}</AlertTitle>
              <AlertDescription>{t('meds.scan.draft.aiNotice')}</AlertDescription>
            </Alert>

            {draft.recognition.multiple_bags_suspected && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>{t('meds.scan.draft.multipleBagsTitle')}</AlertTitle>
                <AlertDescription>{t('meds.scan.draft.multipleBagsDesc')}</AlertDescription>
              </Alert>
            )}

            {/* 用藥對象：即使有比對到族譜成員的建議值，仍要求使用者親自確認或改選 */}
            <Controller
              control={control}
              name="targetUserId"
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">{t('meds.scan.draft.targetField')}</FieldLegend>
                  <ToggleGroup
                    variant="primary"
                    className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    value={field.value ? [field.value] : []}
                    onValueChange={(next) => next[0] && field.onChange(next[0])}
                    aria-label={t('meds.scan.draft.targetField')}
                  >
                    {targets.map((target) => (
                      <ToggleGroupItem key={target.userId} value={target.userId}>
                        {target.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldError errors={[errors.targetUserId]} />
                </FieldSet>
              )}
            />

            {canOneTapConfirm && (
              <>
                <Button
                  type="button"
                  size="lg"
                  className="h-14 w-full rounded-2xl text-base"
                  disabled={busy}
                  onClick={() => void handleOneTapConfirm()}
                >
                  {oneTapSubmitting ? t('meds.scan.draft.confirming') : t('meds.scan.draft.oneTapConfirm')}
                </Button>
                <FieldSeparator>{t('meds.scan.draft.orReviewEach')}</FieldSeparator>
              </>
            )}

            {fields.map((field, index) => {
              const original = drugs[index];
              const isPrn = original.frequency_code === 'PRN';
              const isOther = original.frequency_code === 'OTHER';
              const nameUnverified = original.name_confidence === 'low';

              return (
                <div
                  key={field.id}
                  data-testid={`drug-row-${index}`}
                  className="rounded-2xl border border-border p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Controller
                      control={control}
                      name={`drugs.${index}.include`}
                      render={({ field: includeField }) => (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox checked={includeField.value} onCheckedChange={includeField.onChange} />
                          {t('meds.scan.draft.includeItem')}
                        </label>
                      )}
                    />
                    {/* 產品規則 2：藥名未通過藥證庫校驗是唯一「模型可能讀錯」的訊號，必須視覺標記 */}
                    {nameUnverified && (
                      <Badge className="bg-warning-soft text-warning">
                        {t('meds.scan.draft.nameUnverified')}
                      </Badge>
                    )}
                  </div>

                  <Field data-invalid={Boolean(errors.drugs?.[index]?.name)}>
                    <FieldLabel htmlFor={`drug-name-${index}`}>{t('meds.scan.draft.drugName')}</FieldLabel>
                    <Input
                      id={`drug-name-${index}`}
                      aria-invalid={Boolean(errors.drugs?.[index]?.name)}
                      disabled={busy}
                      {...register(`drugs.${index}.name`)}
                    />
                    <FieldError errors={[errors.drugs?.[index]?.name]} />
                  </Field>

                  {/* 產品規則 5：對照原文，讓使用者核對的是藥袋實際印的字串，而非 App 的解讀結果 */}
                  <FieldDescription className="mt-2">
                    {t('meds.scan.draft.usageRawLine', {
                      text: original.usage_raw || t('meds.scan.draft.usageRawEmpty'),
                    })}
                  </FieldDescription>

                  {/* 療程天數換算成後端的 end_date，決定這顆藥何時自動停止提醒——
                      OCR 讀錯天數的後果不再只是顯示錯誤，而是提醒停得太早或太晚，
                      所以要讓使用者在這裡看得到、改得動，不能只在辨識階段顯示過。 */}
                  <Controller
                    control={control}
                    name={`drugs.${index}.durationDays`}
                    render={({ field: durationField }) => (
                      <Field className="mt-3" data-invalid={Boolean(errors.drugs?.[index]?.durationDays)}>
                        <FieldLabel htmlFor={`drug-${index}-duration`}>
                          {t('meds.scan.draft.durationDays')}
                        </FieldLabel>
                        <Input
                          id={`drug-${index}-duration`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          disabled={busy}
                          aria-invalid={Boolean(errors.drugs?.[index]?.durationDays)}
                          placeholder={t('meds.scan.draft.durationDaysPlaceholder')}
                          value={durationField.value ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            durationField.onChange(raw === '' ? null : Number(raw));
                          }}
                        />
                        <FieldDescription>{t('meds.scan.draft.durationDaysHint')}</FieldDescription>
                        <FieldError errors={[errors.drugs?.[index]?.durationDays]} />
                      </Field>
                    )}
                  />

                  {isPrn ? (
                    // 產品規則 3：PRN 一律不會出現在任何時段的提醒裡，必須明講原因，
                    // 否則使用者會誤以為 App 漏辨識，自行手動加成定時提醒。
                    <Alert className="mt-3 bg-warning-soft">
                      <TriangleAlertIcon className="text-warning" />
                      <AlertTitle className="text-warning">{t('meds.scan.draft.prnTitle')}</AlertTitle>
                      <AlertDescription className="text-warning/90">
                        {t('meds.scan.draft.prnDesc')}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Controller
                      control={control}
                      name={`drugs.${index}.slots`}
                      render={({ field: slotsField }) => (
                        <>
                          <FieldSet className="mt-3">
                            <FieldLegend variant="label">
                              {isOther
                                ? t('meds.scan.draft.slotsRequiredLabel')
                                : t('meds.scan.draft.slotsLabel')}
                            </FieldLegend>
                            <div className="flex flex-wrap gap-2">
                              {SLOT_TYPES.map((slot) => {
                                const checked = slotsField.value.includes(slot);
                                return (
                                  <FieldLabel key={slot} htmlFor={`drug-${index}-slot-${slot}`}>
                                    <Field orientation="horizontal">
                                      <Checkbox
                                        id={`drug-${index}-slot-${slot}`}
                                        checked={checked}
                                        disabled={busy}
                                        onCheckedChange={() =>
                                          slotsField.onChange(
                                            checked
                                              ? slotsField.value.filter((s) => s !== slot)
                                              : [...slotsField.value, slot],
                                          )
                                        }
                                      />
                                      <FieldTitle>{t(SLOT_LABEL_KEY[slot])}</FieldTitle>
                                    </Field>
                                  </FieldLabel>
                                );
                              })}
                            </div>
                            <FieldError errors={[errors.drugs?.[index]?.slots]} />
                          </FieldSet>
                          {/* 使用者把所有時段都取消勾選之後的結果，和 PRN 完全一樣：
                              這顆藥會被建立，但不會出現在任何時段的提醒裡。核對畫面是
                              使用者唯一看得到「等一下會發生什麼事」的地方，沿用 PRN
                              的說明樣式，不再發明第二套講法。 */}
                          {slotsField.value.length === 0 && (
                            <Alert className="mt-3 bg-warning-soft">
                              <TriangleAlertIcon className="text-warning" />
                              <AlertTitle className="text-warning">
                                {t('meds.scan.draft.noSlotsTitle')}
                              </AlertTitle>
                              <AlertDescription className="text-warning/90">
                                {t('meds.scan.draft.noSlotsDesc')}
                              </AlertDescription>
                            </Alert>
                          )}
                        </>
                      )}
                    />
                  )}
                </div>
              );
            })}

            {errors.root?.message && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('meds.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={busy}>
            {isSubmitting ? t('meds.scan.draft.confirming') : t('meds.scan.draft.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
