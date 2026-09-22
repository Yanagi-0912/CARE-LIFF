import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeftIcon, PauseCircleIcon } from 'lucide-react';

import {
  MEAL_LABEL_KEY,
  MEAL_TIMING_ORDER,
  SLOT_LABEL_KEY,
  type MealTiming,
  type Medication,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatAppearancePrimary } from './appearanceText';
import { PillThumbnail } from './PillThumbnail';
import { todayLocalDateString } from '../../utils/date';
import { buildEntries, computeDefaults, findEmptyEnabledTiming, type Assignment } from './slotEntryForm';

/** 儲存時交給呼叫端的內容；日期欄位原本在簡易新增／編輯視窗，兩者移除後併到這裡 */
export interface SlotEntrySaveValues {
  entries: ReminderEntry[];
  startDate: string;
  /** 空字串代表長期提醒（沒有結束日期） */
  endDate: string;
}

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
  onSave: (values: SlotEntrySaveValues) => Promise<void>;
  /** 只有既有規則才有刪除；尚未設定的時段不渲染刪除鈕 */
  onDelete?: () => Promise<void>;
  onBack: () => void;
}

const timingSchema = z.object({ enabled: z.boolean(), time: z.string() });

/** 畫面上的時機排列：最常用的「不分飯前後」放第一個，飯前飯後接在後面 */
const TIMING_DISPLAY_ORDER: readonly MealTiming[] = ['none', 'before_meal', 'after_meal'];

export function SlotEntryEditor({
  slot,
  reminder,
  medications,
  medicationsLoading,
  medicationsError,
  onAddMedication,
  onSave,
  onDelete,
  onBack,
}: SlotEntryEditorProps) {
  const { t } = useTranslation();
  const separator = t('meds.scan.draft.slotListSeparator');
  const slotLabel = t(SLOT_LABEL_KEY[slot]);

  // 只依賴 slot／reminder 的預設值；日期沿用既有規則，新規則從今天開始、長期提醒。
  const defaultValues = useMemo(
    () => ({
      ...computeDefaults(slot, reminder),
      startDate: reminder?.start_date ?? todayLocalDateString(),
      endDate: reminder?.end_date ?? '',
    }),
    [slot, reminder],
  );

  const schema = useMemo(
    () =>
      z
        .object({
          timings: z.object({
            before_meal: timingSchema,
            after_meal: timingSchema,
            none: timingSchema,
          }),
          assignments: z.record(
            z.string(),
            z.union([
              z.literal('before_meal'),
              z.literal('after_meal'),
              z.literal('none'),
              z.null(),
            ]),
          ),
          startDate: z.string().min(1, t('meds.edit.startDateRequired')),
          endDate: z.string(),
        })
        .superRefine((values, ctx) => {
          if (!MEAL_TIMING_ORDER.some((meal) => values.timings[meal].enabled)) {
            // 注意：react-hook-form 的 handleSubmit 在判斷「這次送出算不算通過驗證」
            // 時，會先把 errors.root 整個拿掉才檢查是否還有其他錯誤——root 是保留給
            // setError('root', …) 這種「送出後才知道失敗」的情境，schema 驗證的錯誤
            // 掛在 root 上並不會擋下 onValid 的呼叫。這裡必須掛在一個真實欄位上
            // （timings.none.enabled）才擋得住送出。
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.detailed.needTiming'),
              path: ['timings', 'none', 'enabled'],
            });
          }
          MEAL_TIMING_ORDER.forEach((meal) => {
            if (values.timings[meal].enabled && !/^\d{2}:\d{2}$/.test(values.timings[meal].time)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t('meds.edit.timeRequired'),
                path: ['timings', meal, 'time'],
              });
            }
          });
          // Controller ruling（final review item 2）：開啟卻沒指派藥品的時機，
          // 若另一個時機已經掛著藥，不能放行存檔——見 findEmptyEnabledTiming。
          const emptyTiming = findEmptyEnabledTiming(values);
          if (emptyTiming) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.detailed.emptyTiming', { meal: t(MEAL_LABEL_KEY[emptyTiming]) }),
              path: ['timings', emptyTiming, 'enabled'],
            });
          }
          // YYYY-MM-DD 可直接字串比較，不需解析日期
          if (values.endDate && values.endDate < values.startDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('meds.add.dateOrderError'),
              path: ['endDate'],
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

  const timings = watch('timings');
  const assignments = watch('assignments');
  const startDate = watch('startDate');

  const [addName, setAddName] = useState('');
  const [addingMed, setAddingMed] = useState(false);

  const handleAssignmentChange = (medicationId: string, value: Assignment) => {
    setValue('assignments', { ...assignments, [medicationId]: value }, { shouldDirty: true });
  };

  // 關掉某個時機的開關時，原本指派在它底下的藥品要跟著清成未指派——不然
  // chip 停用了但指派值還留著，儲存時 buildEntries 不會把它算進任何一個
  // 啟用中的條目，等於這顆藥悄悄從規則上消失、畫面上卻還顯示有指派。
  // 清成 null 之後藥品卡片會標上「未指派」，使用者看得到要重新指派。
  const clearAssignmentsFor = (mealTiming: MealTiming) => {
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
      await onSave({
        entries: buildEntries(reminder, medications, values),
        startDate: values.startDate,
        endDate: values.endDate,
      });
    } catch (err) {
      // 送出失敗掛在 root，與欄位錯誤分開顯示在表單底部
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      // 失敗時收掉確認框，錯誤訊息顯示在表單底部
      setConfirmOpen(false);
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    } finally {
      setDeleting(false);
    }
  };

  const busy = isSubmitting || deleting;

  // 「至少開一個服藥時機」與「時機開著卻沒指派藥品」都掛在某個時機的 enabled
  // 欄位上（見上面 superRefine 的註解），但呈現面比照 root 錯誤，一樣顯示成
  // 表單底部的 Alert，不是掛在對應開關旁邊：這兩種錯誤講的都是跨欄位的組合，
  // 不是單一欄位本身有問題。
  const formError =
    errors.root?.message ??
    MEAL_TIMING_ORDER.map((meal) => errors.timings?.[meal]?.enabled?.message).find(Boolean);
  const saveDisabled = busy || medicationsLoading || Boolean(medicationsError);

  const renderTiming = (meal: MealTiming) => {
    const mealLabel = t(MEAL_LABEL_KEY[meal]);
    const enabled = timings[meal].enabled;
    const timeError = errors.timings?.[meal]?.time;
    const switchId = `slot-entry-${meal}-enabled`;
    return (
      <Field key={meal}>
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name={`timings.${meal}.enabled`}
            render={({ field }) => (
              <Switch
                id={switchId}
                checked={field.value}
                onCheckedChange={(next) => {
                  field.onChange(next);
                  if (!next) clearAssignmentsFor(meal);
                }}
                disabled={busy}
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
            <FieldLabel htmlFor={`slot-entry-${meal}-time`}>
              {t('meds.detailed.timeFor', { meal: mealLabel })}
            </FieldLabel>
            <Input
              id={`slot-entry-${meal}-time`}
              type="time"
              className="num"
              aria-invalid={Boolean(timeError)}
              disabled={busy}
              {...register(`timings.${meal}.time`)}
            />
            <FieldError errors={[timeError]} />
          </Field>
        )}
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" className="w-fit" onClick={onBack} disabled={busy}>
        <ArrowLeftIcon data-icon="inline-start" />
        {t('meds.detailed.back')}
      </Button>

      <h2 className="text-xl font-extrabold">{slotLabel}</h2>

      {/* noValidate：日期與時間一律交給 zod 檢查。結束日期的 min 只當日期選擇器的
          提示；原生約束驗證若開著，會搶在 zod 之前擋下送出、只跳瀏覽器自己的
          英文氣泡，dateOrderError 永遠到不了畫面。 */}
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
        <FieldGroup>
          {TIMING_DISPLAY_ORDER.map(renderTiming)}
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
                      {/* 三個時機在特大字級下一列放不下，允許換行 */}
                      <ToggleGroup
                        variant="primary"
                        className="flex-wrap"
                        value={value ? [value] : []}
                        onValueChange={(next) =>
                          handleAssignmentChange(med.id, (next[0] as MealTiming | undefined) ?? null)
                        }
                      >
                        {TIMING_DISPLAY_ORDER.map((meal) => (
                          <ToggleGroupItem
                            key={meal}
                            value={meal}
                            disabled={!timings[meal].enabled || busy || medDisabled}
                            aria-label={t('meds.detailed.assignTo', { meal: t(MEAL_LABEL_KEY[meal]) })}
                          >
                            {t(MEAL_LABEL_KEY[meal])}
                          </ToggleGroupItem>
                        ))}
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
              className="min-w-[min(10rem,100%)] flex-1"
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

        <FieldGroup>
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="slot-entry-start-date">{t('meds.add.startDate')}</FieldLabel>
            <Input
              id="slot-entry-start-date"
              type="date"
              aria-invalid={Boolean(errors.startDate)}
              disabled={busy}
              {...register('startDate')}
            />
            <FieldError errors={[errors.startDate]} />
          </Field>

          <Field data-invalid={Boolean(errors.endDate)}>
            <FieldLabel htmlFor="slot-entry-end-date">{t('meds.add.endDate')}</FieldLabel>
            <Input
              id="slot-entry-end-date"
              type="date"
              min={startDate}
              aria-invalid={Boolean(errors.endDate)}
              disabled={busy}
              {...register('endDate')}
            />
            <FieldDescription>{t('meds.add.endDateOptional')}</FieldDescription>
            <FieldError errors={[errors.endDate]} />
          </Field>
        </FieldGroup>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={saveDisabled}>
          {t('meds.detailed.save')}
        </Button>
      </form>

      {/* 刪除放在最下方、以分隔線與儲存隔開（原編輯視窗與掛號提醒同一做法），
          確認交給 AlertDialog。 */}
      {reminder && onDelete && (
        <>
          <Separator className="my-2" />
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={<Button type="button" variant="destructive" disabled={busy} className="w-full" />}
            >
              {t('meds.edit.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('meds.edit.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('meds.edit.deleteConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t('meds.edit.deleteConfirmNo')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  {t('meds.edit.deleteConfirmYes')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
