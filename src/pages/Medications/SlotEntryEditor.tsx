import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeftIcon } from 'lucide-react';

import {
  DEFAULT_SLOT_TIMES,
  MEAL_LABEL_KEY,
  SLOT_LABEL_KEY,
  type Medication,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatAppearancePrimary } from './appearanceText';
import { PillThumbnail } from './PillThumbnail';

/** 藥品指派：飯前／飯後其中之一，或未指派（null） */
type Assignment = 'before_meal' | 'after_meal' | null;

interface TimingFormValues {
  enabled: boolean;
  /** HH:MM */
  time: string;
}

interface SlotEntryFormValues {
  before: TimingFormValues;
  after: TimingFormValues;
  /** 依藥品 id 索引；未出現在物件裡的藥品視同未指派（null） */
  assignments: Record<string, Assignment>;
}

interface SlotEntryEditorProps {
  slot: MedicationSlotType;
  /** 該時段既有的規則；undefined 代表這個時段尚未設定過，儲存時走建立 */
  reminder?: MedicationReminder;
  medications: Medication[];
  medicationsLoading: boolean;
  onAddMedication: (name: string) => Promise<Medication>;
  onSave: (entries: ReminderEntry[]) => Promise<void>;
  onBack: () => void;
}

/**
 * 依既有條目算出表單預設值。刻意只依賴 `reminder`，不依賴 `medications`——
 * 指派狀態的權威來源是條目裡的 medication_ids，藥品清單載入的快慢不該
 * 影響這裡算出來的值：清單還沒回來時，已指派的藥品一樣要能正確顯示在
 * 「飯前」或「飯後」，晚到的清單只是把對應的卡片渲染出來、不需要重算指派。
 */
function computeDefaultAssignments(entries: ReminderEntry[]): Record<string, Assignment> {
  const assignments: Record<string, Assignment> = {};
  entries.forEach((entry) => {
    entry.medication_ids.forEach((id) => {
      assignments[id] = entry.meal_timing === 'none' ? null : entry.meal_timing;
    });
  });
  return assignments;
}

function computeDefaults(slot: MedicationSlotType, reminder?: MedicationReminder): SlotEntryFormValues {
  const entries = reminder?.entries ?? [];
  const beforeEntry = entries.find((entry) => entry.meal_timing === 'before_meal');
  const afterEntry = entries.find((entry) => entry.meal_timing === 'after_meal');
  return {
    before: {
      enabled: Boolean(beforeEntry),
      time: beforeEntry?.scheduled_time ?? DEFAULT_SLOT_TIMES[slot],
    },
    after: {
      enabled: Boolean(afterEntry),
      time: afterEntry?.scheduled_time ?? DEFAULT_SLOT_TIMES[slot],
    },
    assignments: computeDefaultAssignments(entries),
  };
}

/**
 * 組出要送出的 entries（before → after → none）。
 *
 * none 條目只在「既有規則本來就有 none 條目」或「有未指派藥品原本屬於這筆
 * 規則」時才附上——藥袋辨識掛上、使用者這次沒特別指派的藥不能因此從規則
 * 上消失（design.md 決策 7／brief 10.3）；但從沒屬於這筆規則、這次也沒指派
 * 的藥（例如剛手動新增的）維持真正的「未指派」，不塞進 none 條目。
 */
function buildEntries(
  slot: MedicationSlotType,
  reminder: MedicationReminder | undefined,
  medications: Medication[],
  values: SlotEntryFormValues,
): ReminderEntry[] {
  const beforeIds = medications
    .filter((med) => values.assignments[med.id] === 'before_meal')
    .map((med) => med.id);
  const afterIds = medications
    .filter((med) => values.assignments[med.id] === 'after_meal')
    .map((med) => med.id);
  const unassignedIds = medications
    .filter((med) => !values.assignments[med.id])
    .map((med) => med.id);

  const priorEntries = reminder?.entries ?? [];
  const priorNoneEntry = priorEntries.find((entry) => entry.meal_timing === 'none');
  const belongsToReminder = new Set(priorEntries.flatMap((entry) => entry.medication_ids));
  const noneIds = unassignedIds.filter((id) => belongsToReminder.has(id));

  const entries: ReminderEntry[] = [];
  if (values.before.enabled) {
    entries.push({ meal_timing: 'before_meal', scheduled_time: values.before.time, medication_ids: beforeIds });
  }
  if (values.after.enabled) {
    entries.push({ meal_timing: 'after_meal', scheduled_time: values.after.time, medication_ids: afterIds });
  }
  if (priorNoneEntry || noneIds.length > 0) {
    // 時間取既有 none 條目的時刻，缺席時取最早啟用時機的時刻——驗證已保證
    // 至少一個時機啟用，這裡一定找得到。
    const earliestEnabledTime = [
      values.before.enabled ? values.before.time : undefined,
      values.after.enabled ? values.after.time : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    entries.push({
      meal_timing: 'none',
      scheduled_time: priorNoneEntry?.scheduled_time ?? earliestEnabledTime ?? DEFAULT_SLOT_TIMES[slot],
      medication_ids: noneIds,
    });
  }
  return entries;
}

export function SlotEntryEditor({
  slot,
  reminder,
  medications,
  medicationsLoading,
  onAddMedication,
  onSave,
  onBack,
}: SlotEntryEditorProps) {
  const { t } = useTranslation();
  const separator = t('meds.scan.draft.slotListSeparator');
  const slotLabel = t(SLOT_LABEL_KEY[slot]);

  // 驗證訊息需要 t，故隨語言重建；只依賴 slot／reminder 的預設值同理。
  const defaultValues = useMemo(() => computeDefaults(slot, reminder), [slot, reminder]);

  const schema = useMemo(
    () =>
      z
        .object({
          before: z.object({ enabled: z.boolean(), time: z.string() }),
          after: z.object({ enabled: z.boolean(), time: z.string() }),
          assignments: z.record(
            z.string(),
            z.union([z.literal('before_meal'), z.literal('after_meal'), z.null()]),
          ),
        })
        .superRefine((values, ctx) => {
          if (!values.before.enabled && !values.after.enabled) {
            // 注意：react-hook-form 的 handleSubmit 在判斷「這次送出算不算通過驗證」
            // 時，會先把 errors.root 整個拿掉才檢查是否還有其他錯誤——root 是保留給
            // setError('root', …) 這種「送出後才知道失敗」的情境，schema 驗證的錯誤
            // 掛在 root 上並不會擋下 onValid 的呼叫。這裡必須掛在一個真實欄位上
            // （before.enabled）才擋得住送出。
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.detailed.needTiming'),
              path: ['before', 'enabled'],
            });
          }
          const timeRe = /^\d{2}:\d{2}$/;
          if (values.before.enabled && !timeRe.test(values.before.time)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.edit.timeRequired'),
              path: ['before', 'time'],
            });
          }
          if (values.after.enabled && !timeRe.test(values.after.time)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.edit.timeRequired'),
              path: ['after', 'time'],
            });
          }
        }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const beforeEnabled = watch('before.enabled');
  const afterEnabled = watch('after.enabled');
  const assignments = watch('assignments');

  const [addName, setAddName] = useState('');
  const [addingMed, setAddingMed] = useState(false);

  const handleAssignmentChange = (medicationId: string, value: Assignment) => {
    setValue('assignments', { ...assignments, [medicationId]: value }, { shouldDirty: true });
  };

  const handleAddMedication = async () => {
    const trimmed = addName.trim();
    if (!trimmed) return;
    setAddingMed(true);
    try {
      await onAddMedication(trimmed);
      setAddName('');
      toast.success(t('meds.detailed.addMedSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meds.updateFailed'));
    } finally {
      setAddingMed(false);
    }
  };

  const submit = handleSubmit(async (values) => {
    try {
      const entries = buildEntries(slot, reminder, medications, values);
      await onSave(entries);
    } catch (err) {
      // 送出失敗掛在 root，與欄位錯誤分開顯示在表單底部（同 ReminderFormDialog）
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  // 「至少開一個服藥時機」掛在 before.enabled 欄位上（見上面 superRefine 的註解），
  // 但呈現面比照 root 錯誤，一樣顯示成表單底部的 Alert，不是掛在飯前開關旁邊——
  // 這個錯誤講的是飯前飯後兩者的組合，不是飯前這一個欄位本身有問題。
  const formError = errors.root?.message ?? errors.before?.enabled?.message;

  const renderTiming = (key: 'before' | 'after', mealTiming: 'before_meal' | 'after_meal') => {
    const mealLabel = t(MEAL_LABEL_KEY[mealTiming]);
    const enabled = key === 'before' ? beforeEnabled : afterEnabled;
    const timeError = key === 'before' ? errors.before?.time : errors.after?.time;
    return (
      <Field key={key}>
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name={`${key}.enabled`}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isSubmitting}
                aria-label={t('meds.detailed.enableTiming', { meal: mealLabel })}
              />
            )}
          />
          <FieldTitle>{mealLabel}</FieldTitle>
        </div>

        {enabled && (
          <Field className="pl-[3.25rem]">
            <FieldLabel htmlFor={`slot-entry-${key}-time`}>
              {t('meds.detailed.timeFor', { meal: mealLabel })}
            </FieldLabel>
            <Input
              id={`slot-entry-${key}-time`}
              type="time"
              className="num"
              aria-invalid={Boolean(timeError)}
              disabled={isSubmitting}
              {...register(`${key}.time`)}
            />
            <FieldError errors={[timeError]} />
          </Field>
        )}
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" className="w-fit" onClick={onBack} disabled={isSubmitting}>
        <ArrowLeftIcon data-icon="inline-start" />
        {t('meds.detailed.back')}
      </Button>

      <h2 className="text-xl font-extrabold">{slotLabel}</h2>

      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
        <FieldGroup>
          {renderTiming('before', 'before_meal')}
          {renderTiming('after', 'after_meal')}
        </FieldGroup>

        <FieldSet>
          <FieldLegend variant="label">{t('meds.detailed.medsHeading')}</FieldLegend>

          {medicationsLoading ? (
            <div className="flex flex-col gap-2.5" aria-busy="true" aria-label={t('meds.loading')}>
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : medications.length === 0 ? (
            <p className="text-base text-muted-foreground">{t('meds.detailed.noMeds')}</p>
          ) : (
            <ItemGroup className="gap-2.5" aria-label={t('meds.detailed.medsHeading')}>
              {medications.map((med) => {
                const primary = formatAppearancePrimary(med, separator);
                const value = assignments[med.id] ?? null;
                return (
                  <Item key={med.id} size="xs" role="listitem" className="gap-2.5 p-0">
                    <ItemMedia>
                      <PillThumbnail src={med.thumbnail_url} alt={med.name} className="size-16 rounded-lg" />
                    </ItemMedia>
                    <ItemContent className="min-w-32 gap-0.5">
                      <ItemTitle className="w-full line-clamp-none font-semibold break-words">
                        {med.name}
                      </ItemTitle>
                      {primary && (
                        <ItemDescription className="line-clamp-none break-words">{primary}</ItemDescription>
                      )}
                    </ItemContent>

                    <div className="flex flex-wrap items-center gap-2">
                      <ToggleGroup
                        variant="primary"
                        value={value ? [value] : []}
                        onValueChange={(next) =>
                          handleAssignmentChange(
                            med.id,
                            (next[0] as 'before_meal' | 'after_meal' | undefined) ?? null,
                          )
                        }
                      >
                        <ToggleGroupItem
                          value="before_meal"
                          disabled={!beforeEnabled || isSubmitting}
                          aria-label={t('meds.detailed.assignTo', { meal: t(MEAL_LABEL_KEY.before_meal) })}
                        >
                          {t(MEAL_LABEL_KEY.before_meal)}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="after_meal"
                          disabled={!afterEnabled || isSubmitting}
                          aria-label={t('meds.detailed.assignTo', { meal: t(MEAL_LABEL_KEY.after_meal) })}
                        >
                          {t(MEAL_LABEL_KEY.after_meal)}
                        </ToggleGroupItem>
                      </ToggleGroup>
                      {!value && <Badge variant="secondary">{t('meds.detailed.unassigned')}</Badge>}
                    </div>
                  </Item>
                );
              })}
            </ItemGroup>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              aria-label={t('meds.detailed.addMedName')}
              disabled={addingMed}
              className="min-w-40 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleAddMedication()}
              disabled={addingMed || !addName.trim()}
            >
              {t('meds.detailed.addMed')}
            </Button>
          </div>
        </FieldSet>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {t('meds.detailed.save')}
        </Button>
      </form>
    </div>
  );
}
