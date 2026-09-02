import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SLOT_TIMES,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationSlotType,
  type MedicationReminder,
  type UpdateReminderRequest,
} from '../../types/medication';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ItemGroup } from '@/components/ui/item';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MedicationAppearanceRow } from './MedicationAppearanceRow';
import { nearestSlot } from './reminderSchedule';

/** 表單掛在 dialog body 上，儲存鈕在 DialogFooter，靠 form 屬性連回來 */
const FORM_ID = 'edit-reminder-form';

interface ReminderEditDialogProps {
  reminder: MedicationReminder;
  /**
   * 這位使用者名下所有提醒已佔用的時段（含本筆自己的）。用來停用「改到已經
   * 有另一筆提醒的時段」——後端 `{user_id, slot_type}` 上刻意沒有 unique
   * index（舊資料可能已有重複，建索引會讓應用起不來，見
   * MedicationReminderRepository.find_or_create_reminder），同一時段若出現
   * 兩份規則，那個時段每天會推兩則。後端會擋成 409，這裡先讓使用者看得出來
   * 哪些時段不能選，而不是選了才被拒絕。
   */
  existingSlots: MedicationSlotType[];
  onSave: (patch: UpdateReminderRequest) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function ReminderEditDialog({
  reminder,
  existingSlots,
  onSave,
  onDelete,
  onClose,
}: ReminderEditDialogProps) {
  const { t } = useTranslation();

  const slotLabel = t(SLOT_LABEL_KEY[reminder.slot_type]);
  const medications = reminder.medications ?? [];

  // 佔用判定要排除本筆自己：使用者把時段「改成它原本的值」不是衝突，
  // 佔住那個時段的正是這筆提醒。
  const takenByOthers = useMemo(
    () => existingSlots.filter((slot) => slot !== reminder.slot_type),
    [existingSlots, reminder.slot_type],
  );

  const schema = useMemo(
    () =>
      z
        .object({
          slot: z.enum(SLOT_TYPES),
          time: z.string().min(1, t('meds.edit.timeRequired')),
          startDate: z.string().min(1, t('meds.edit.startDateRequired')),
          endDate: z.string(),
          enabled: z.boolean(),
        })
        .refine((v) => !v.endDate || v.endDate >= v.startDate, {
          message: t('meds.add.dateOrderError'),
          path: ['endDate'],
        }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      slot: reminder.slot_type,
      time: reminder.scheduled_time,
      startDate: reminder.start_date,
      endDate: reminder.end_date ?? '',
      enabled: reminder.enabled,
    },
  });

  const startDate = watch('startDate');

  // 時間欄位要在使用者輸入時多做一件事（把時段帶過去），所以先取出 register
  // 回傳的那組 props，再包一層自己的 onChange——直接在 JSX 裡寫 onChange 會
  // 蓋掉 register 自己的那個，表單就再也收不到這一欄的值。
  const timeField = register('time');

  /**
   * 時間改到別的時段範圍時，時段跟著跳（例如「睡前」的 21:30 改成 08:00 →
   * 時段變「早」）。不跟的話推播文案會說「睡前 服藥時間到了」卻在早上八點
   * 發出——與改時段時時間跟著走是同一個一致性要求的另一半。
   *
   * 目標時段已被同一位使用者的另一筆提醒佔用時不跳：一個時段只該有一份規則
   * （後端會擋成 409，這裡的 radio 也是停用的），硬跳會把表單推進一個按下
   * 儲存必定失敗的狀態。那顆 radio 上的「已設定」標記就是解釋。
   */
  const followTimeIntoSlot = (time: string) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const next = nearestSlot(time);
    if (next === getValues('slot') || takenByOthers.includes(next)) return;
    setValue('slot', next, { shouldDirty: true });
  };

  const submit = handleSubmit(async (values) => {
    // 只送出真正變動的欄位
    const patch: UpdateReminderRequest = {};
    if (values.slot !== reminder.slot_type) patch.slot_type = values.slot;
    if (values.time !== reminder.scheduled_time) patch.scheduled_time = values.time;
    if (values.startDate !== reminder.start_date) patch.start_date = values.startDate;
    // 空字串代表「沒有結束日期」，要送出 null 才會真的清成長期——後端以
    // exclude_unset 匯出，「沒帶這個 key」與「帶了 null」是兩件不同的事
    // （見 UpdateReminderRequest 的說明）。先前這裡寫成 `values.endDate &&`，
    // 清空時整個條件為 false，patch 裡什麼都沒有，等於靜默地不做事。
    const nextEndDate = values.endDate || null;
    if (nextEndDate !== reminder.end_date) patch.end_date = nextEndDate;
    if (values.enabled !== reminder.enabled) patch.enabled = values.enabled;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await onSave(patch);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      // 失敗時收掉確認框，錯誤訊息顯示在下層的編輯表單裡
      setConfirmOpen(false);
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    } finally {
      setDeleting(false);
    }
  };

  const busy = isSubmitting || deleting;

  return (
    // Dialog 內建焦點鎖定、Escape、焦點歸位、背景鎖捲，關閉鈕用 DialogContent 內建那顆。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('meds.editAria', { slot: slotLabel, time: reminder.scheduled_time })}
          </DialogDescription>
        </DialogHeader>

        {/* 只讓表單本體捲動，標題與底部按鈕（含右上關閉鈕）固定不動。
            捲動交給 ScrollArea：它的 scrollbar 是覆蓋式的、不佔 layout 寬度，
            也不會像 overflow-y-auto 那樣把 overflow-x 一併算成 auto
            （CSS Overflow 規範：兩軸只要一軸非 visible，另一軸的 visible 就變 auto），
            那會讓任何 1px 的橫向溢出變成裁切邊緣＋長出水平 scrollbar。
            新增提醒 dialog 已驗證過同一模式，這裡保持一致。 */}
        <ScrollArea>
          <form id={FORM_ID} onSubmit={(e) => void submit(e)}>
            <FieldGroup>
              {/* 時段從唯讀改為可改。時段唯讀而時間可改時，使用者做得出
                  「早上 21:00」這種自相矛盾的提醒——推播文案說的是「早上該吃
                  藥了」，卻在晚上九點發出。 */}
              <Controller
                control={control}
                name="slot"
                render={({ field }) => (
                  <FieldSet>
                    <FieldLegend variant="label">{t('meds.edit.slot')}</FieldLegend>
                    <FieldDescription>{t('meds.edit.slotNote')}</FieldDescription>

                    <RadioGroup
                      value={field.value}
                      onValueChange={(next) => {
                        // 時段換了，提醒時間要跟著換，否則會做出「晚上時段、
                        // 早上 08:00 觸發」的規則——推播文案的時段字樣取自
                        // slot_type（後端 `flex.med.alt.reminder` 與提醒卡本體都
                        // 帶入 {slot}），觸發時刻取自 scheduled_time，兩者不一致
                        // 時使用者會在早上八點收到「晚 服藥時間到了」。這正是
                        // 當初開放改時段要消除的那種自相矛盾，只是方向相反。
                        //
                        // 只在時間仍停在原時段的預設值時才跟：新增表單沒有時間
                        // 欄位，一律由後端寫入 DEFAULT_SLOT_TIMES，所以絕大多數
                        // 規則都落在這條路徑上。使用者若已自訂過時間（例如早上
                        // 07:15），那是明確的意圖，改時段不該悄悄把它蓋掉——
                        // 時間欄位就在下方，畫面上看得到，要調整是一步的事。
                        const prev = field.value;
                        field.onChange(next);
                        if (getValues('time') === DEFAULT_SLOT_TIMES[prev]) {
                          setValue('time', DEFAULT_SLOT_TIMES[next as MedicationSlotType], {
                            shouldDirty: true,
                          });
                        }
                      }}
                      disabled={busy}
                      aria-label={t('meds.edit.slot')}
                    >
                      {SLOT_TYPES.map((slot) => {
                        const taken = takenByOthers.includes(slot);
                        return (
                          // FieldLabel 包住 Field 就會變成可點的選取卡片：
                          // 圓角、外框、選取高亮都是 Field 元件內建的，也讓
                          // 整張卡片成為 ≥44px 的觸控目標（圓點本身只有 16px，
                          // 與新增表單的 Checkbox 同一個模式）。
                          <FieldLabel key={slot} htmlFor={`edit-slot-${slot}`}>
                            <Field orientation="horizontal" data-disabled={taken}>
                              <RadioGroupItem
                                id={`edit-slot-${slot}`}
                                value={slot}
                                disabled={taken || busy}
                              />
                              <FieldContent>
                                <FieldTitle>{t(SLOT_LABEL_KEY[slot])}</FieldTitle>
                                {taken && (
                                  <Badge variant="secondary">{t('meds.edit.slotTaken')}</Badge>
                                )}
                              </FieldContent>
                            </Field>
                          </FieldLabel>
                        );
                      })}
                    </RadioGroup>

                    <FieldError errors={[errors.slot]} />
                  </FieldSet>
                )}
              />

              <Field data-invalid={Boolean(errors.time)}>
                <FieldLabel htmlFor="edit-time">{t('meds.edit.time')}</FieldLabel>
                <Input
                  id="edit-time"
                  type="time"
                  aria-invalid={Boolean(errors.time)}
                  disabled={busy}
                  {...timeField}
                  onChange={(event) => {
                    void timeField.onChange(event);
                    followTimeIntoSlot(event.target.value);
                  }}
                />
                <FieldError errors={[errors.time]} />
              </Field>

              {/* 這一欄原本沒有 FieldError，zod 的 min(1) 也沒帶訊息：清空後
                  按儲存毫無反應也毫無提示，看起來就像儲存鈕壞了。 */}
              <Field data-invalid={Boolean(errors.startDate)}>
                <FieldLabel htmlFor="edit-start">{t('meds.edit.startDate')}</FieldLabel>
                <Input
                  id="edit-start"
                  type="date"
                  aria-invalid={Boolean(errors.startDate)}
                  disabled={busy}
                  {...register('startDate')}
                />
                <FieldError errors={[errors.startDate]} />
              </Field>

              <Field data-invalid={Boolean(errors.endDate)}>
                <FieldLabel htmlFor="edit-end">{t('meds.edit.endDate')}</FieldLabel>
                <Input
                  id="edit-end"
                  type="date"
                  min={startDate}
                  aria-invalid={Boolean(errors.endDate)}
                  disabled={busy}
                  {...register('endDate')}
                />
                {/* 清空即改回長期，這句話對「已設過」與「還沒設過」都成立，
                    不需要再依 hadEndDate 分岔。 */}
                <FieldDescription>{t('meds.edit.endDateNote')}</FieldDescription>
                <FieldError errors={[errors.endDate]} />
              </Field>

              {/* Base UI 的 Checkbox 不是原生 input，register 的 onChange 對不上，
                  所以這一欄改由 Controller 接 checked / onCheckedChange */}
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  // FieldLabel 包住 Field 就會變成可點的選取卡片，勾選高亮是元件內建的
                  <FieldLabel htmlFor="edit-enabled">
                    <Field orientation="horizontal">
                      <Checkbox
                        id="edit-enabled"
                        checked={field.value}
                        disabled={busy}
                        onCheckedChange={field.onChange}
                      />
                      <FieldContent>
                        <FieldTitle>{t('meds.edit.enabled')}</FieldTitle>
                        <FieldDescription>
                          {field.value ? t('meds.statusOn') : t('meds.statusOff')}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                )}
              />

              {/* 這個時段有哪些藥。卡片上看得到、點進編輯卻整個消失時，
                  使用者無從確認「我正在改的是哪幾種藥的提醒」——要按下那顆
                  刪除鈕之前尤其需要知道。這裡是唯讀的核對資訊，不是欄位：
                  藥品的增刪走藥袋辨識流程，不在這個視窗裡。
                  照片用 compact（size-16）：這裡的用途是核對是哪幾種藥，
                  不是靠外觀認藥，不需要也放不下卡片上那張 160px 的大圖。 */}
              {medications.length > 0 && (
                <FieldSet>
                  <FieldLegend variant="label">{t('meds.edit.medicationsLabel')}</FieldLegend>
                  <ItemGroup>
                    {medications.map((med) => (
                      <MedicationAppearanceRow key={med.id} medication={med} size="compact" />
                    ))}
                  </ItemGroup>
                </FieldSet>
              )}

              {errors.root?.message && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>
        </ScrollArea>

        <DialogFooter>
          {/* 刪除確認交給 AlertDialog（原本是自刻的 confirmingDelete 分支） */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={<Button variant="destructive" disabled={busy} className="sm:mr-auto" />}
            >
              {t('meds.edit.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('meds.edit.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('meds.edit.deleteConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>
                  {t('meds.edit.deleteConfirmNo')}
                </AlertDialogCancel>
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

          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('meds.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={busy}>
            {isSubmitting ? t('meds.edit.saving') : t('meds.edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
