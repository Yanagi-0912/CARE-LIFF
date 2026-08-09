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
import type {
  CommitDrugItem,
  PrescriptionCommitResult,
  PrescriptionDraft,
  RecognizedDrug,
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

/** 每一列藥品的表單值，name／slots 是使用者可編輯的部分，其餘欄位直接沿用辨識結果 */
interface DrugFormValue {
  include: boolean;
  name: string;
  slots: MedicationSlotType[];
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
  return {
    name: row.name,
    generic_name: original.generic_name ?? undefined,
    license_number: original.license_number ?? undefined,
    unit_content: original.unit_content ?? undefined,
    total_quantity: original.total_quantity ?? undefined,
    usage_raw: original.usage_raw ?? undefined,
    frequency_code: original.frequency_code,
    indication: original.indication ?? undefined,
    // PRN 不論使用者勾了什麼都不帶時段：後端一律忽略、絕不建立提醒；
    // 其餘頻次若使用者沒有勾任何時段，就不帶 slots，讓後端依頻次代碼自動映射。
    slots: original.frequency_code === 'PRN' || row.slots.length === 0 ? undefined : row.slots,
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
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetUserId: defaultTargetId,
      drugs: drugs.map((drug) => ({
        include: true,
        name: drug.name,
        slots: [],
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

  const handleOneTapConfirm = async () => {
    setOneTapSubmitting(true);
    try {
      const result = await commitPrescriptionDraft(draft.draft_id, {
        user_id: defaultTargetId,
        drugs: drugs.map((drug) => toCommitDrug(drug, { include: true, name: drug.name, slots: [] })),
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
