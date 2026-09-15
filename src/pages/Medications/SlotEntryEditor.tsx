import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeftIcon, PauseCircleIcon } from 'lucide-react';

import {
  MEAL_LABEL_KEY,
  SLOT_LABEL_KEY,
  type Medication,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';
import { cn } from '@/lib/utils';
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
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatAppearancePrimary } from './appearanceText';
import { PillThumbnail } from './PillThumbnail';
import {
  buildEntries,
  computeDefaults,
  computePriorMemberIds,
  findEmptyEnabledTiming,
  type Assignment,
} from './slotEntryForm';

interface SlotEntryEditorProps {
  slot: MedicationSlotType;
  /** 該時段既有的規則；undefined 代表這個時段尚未設定過，儲存時走建立 */
  reminder?: MedicationReminder;
  medications: Medication[];
  medicationsLoading: boolean;
  /** 藥品清單載入失敗的訊息；非 null 時擋住儲存——buildEntries 雖然會保留
   *  既有規則掛著的藥品，但清單缺席時使用者看不到完整的指派畫面，不該讓
   *  他在看不全的狀態下按下儲存。 */
  medicationsError?: string | null;
  onAddMedication: (name: string) => Promise<Medication>;
  onSave: (entries: ReminderEntry[]) => Promise<void>;
  onBack: () => void;
}

export function SlotEntryEditor({
  slot,
  reminder,
  medications,
  medicationsLoading,
  medicationsError,
  onAddMedication,
  onSave,
  onBack,
}: SlotEntryEditorProps) {
  const { t } = useTranslation();
  const separator = t('meds.scan.draft.slotListSeparator');
  const slotLabel = t(SLOT_LABEL_KEY[slot]);

  // 驗證訊息需要 t，故隨語言重建；只依賴 slot／reminder 的預設值同理。
  const defaultValues = useMemo(() => computeDefaults(slot, reminder), [slot, reminder]);

  // 原本就屬於這筆規則的藥品 id：這次若維持未指派會落入 none 條目繼續被
  // 提醒（見 buildEntries），findEmptyEnabledTiming 判斷「其他條目是否有藥」
  // 時要把這些算進去，否則會誤判成「全部都沒藥」而放行。
  const priorNoneIds = useMemo(() => computePriorMemberIds(reminder), [reminder]);

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
          // Controller ruling（final review item 2）：開啟卻沒指派藥品的時機，
          // 若另一個時機（或落入 none 的既有藥品）已經掛著藥，不能放行存檔
          // ——buildEntries 仍會產生一個空條目，讓後端把 timeout_anchor_time
          // 訂在它的時刻，拖慢真正有藥的時機的 T+20/T+30 升級。全部時機都
          // 沒有藥（純時間提醒）不受影響，findEmptyEnabledTiming 對此回傳 null。
          const emptyTiming = findEmptyEnabledTiming(values, priorNoneIds);
          if (emptyTiming) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.detailed.emptyTiming', { meal: t(MEAL_LABEL_KEY[emptyTiming]) }),
              path: [emptyTiming === 'before_meal' ? 'before' : 'after', 'enabled'],
            });
          }
        }),
    [t, priorNoneIds],
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

  // 關掉某個時機的開關時，原本指派在它底下的藥品要跟著清成未指派——不然
  // chip 停用了但指派值還留著「before_meal」／「after_meal」，儲存時
  // buildEntries 不會把它算進任何一個啟用中的條目，等於這顆藥悄悄從規則
  // 上消失。清成 null 之後，若它原本屬於這筆規則，會落進 none 條目繼續
  // 被提醒；全新指派過的藥則單純變回未指派。
  const clearAssignmentsFor = (mealTiming: 'before_meal' | 'after_meal') => {
    setValue(
      'assignments',
      Object.fromEntries(
        Object.entries(assignments).map(([id, value]) => [id, value === mealTiming ? null : value]),
      ),
      { shouldDirty: true },
    );
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
  // 「時機開著卻沒指派藥品」則可能掛在 before 或 after 任一邊，取決於是哪個
  // 時機違規——但呈現面比照 root 錯誤，一樣顯示成表單底部的 Alert，不是掛在
  // 對應開關旁邊：這兩種錯誤講的都是跨欄位的組合，不是單一欄位本身有問題。
  const formError =
    errors.root?.message ?? errors.before?.enabled?.message ?? errors.after?.enabled?.message;
  const saveDisabled = isSubmitting || medicationsLoading || Boolean(medicationsError);

  const renderTiming = (key: 'before' | 'after', mealTiming: 'before_meal' | 'after_meal') => {
    const mealLabel = t(MEAL_LABEL_KEY[mealTiming]);
    const enabled = key === 'before' ? beforeEnabled : afterEnabled;
    const timeError = key === 'before' ? errors.before?.time : errors.after?.time;
    const switchId = `slot-entry-${key}-enabled`;
    return (
      <Field key={key}>
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name={`${key}.enabled`}
            render={({ field }) => (
              <Switch
                id={switchId}
                checked={field.value}
                onCheckedChange={(next) => {
                  field.onChange(next);
                  if (!next) clearAssignmentsFor(mealTiming);
                }}
                disabled={isSubmitting}
                aria-label={t('meds.detailed.enableTiming', { meal: mealLabel })}
              />
            )}
          />
          {/* 文字接上 htmlFor，點文字也能切換開關——與 ReminderCard 開關列
              同一個「整個可點區域」慣例，長輩不必精準點在 16px 的滑鈕上。 */}
          <label
            htmlFor={switchId}
            className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium"
          >
            {mealLabel}
          </label>
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

          {medicationsError ? (
            <Alert variant="destructive">
              <AlertDescription>{medicationsError}</AlertDescription>
            </Alert>
          ) : medicationsLoading ? (
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
                // 已停用的藥品（Medication.enabled === false）不該再被指派新的服藥
                // 時機——它多半是療程已結束或被家屬手動停用，指派了也不會再被
                // 提醒。既有指派仍照原樣顯示，只是不能再改，這裡刻意只看
                // enabled，不連動 end_date（YAGNI，之後真的需要再加）。
                const medDisabled = !med.enabled;
                return (
                  <Item
                    key={med.id}
                    size="xs"
                    role="listitem"
                    className={cn('gap-2.5 p-0', medDisabled && 'opacity-60')}
                  >
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
                          disabled={!beforeEnabled || isSubmitting || medDisabled}
                          aria-label={t('meds.detailed.assignTo', { meal: t(MEAL_LABEL_KEY.before_meal) })}
                        >
                          {t(MEAL_LABEL_KEY.before_meal)}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="after_meal"
                          disabled={!afterEnabled || isSubmitting || medDisabled}
                          aria-label={t('meds.detailed.assignTo', { meal: t(MEAL_LABEL_KEY.after_meal) })}
                        >
                          {t(MEAL_LABEL_KEY.after_meal)}
                        </ToggleGroupItem>
                      </ToggleGroup>
                      {!value && <Badge variant="secondary">{t('meds.detailed.unassigned')}</Badge>}
                      {/* 三重編碼：opacity-60（色）＋ PauseCircleIcon（圖示）＋ 文字，
                          不只靠淡化的視覺差異表達「這顆藥已經停用」。 */}
                      {medDisabled && (
                        <Badge variant="secondary" className="gap-1">
                          <PauseCircleIcon className="size-3.5 shrink-0" />
                          {t('meds.detailed.medDisabled')}
                        </Badge>
                      )}
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
              placeholder={t('meds.detailed.addMedName')}
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

        <Button type="submit" disabled={saveDisabled}>
          {t('meds.detailed.save')}
        </Button>
      </form>
    </div>
  );
}
