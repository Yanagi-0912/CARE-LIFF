import { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SLOT_TIMES,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationSlotType,
} from '../../types/medication';
import { todayLocalDateString } from '../../utils/date';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';

/** 表單掛在 dialog body 上，送出鈕在 DialogFooter，靠 form 屬性連回來 */
const FORM_ID = 'add-reminder-form';

interface ReminderFormDialogProps {
  /** 提醒對象名稱，僅顯示用；對象由頁面上方的 chips 決定 */
  targetName: string;
  /** 該對象已設定的時段，會被停用以避免重複建立 */
  existingSlots: MedicationSlotType[];
  onSubmit: (payload: {
    slots: MedicationSlotType[];
    slotTimes: Partial<Record<MedicationSlotType, string>>;
    startDate: string;
    endDate?: string;
  }) => Promise<void>;
  /** 切到詳細設定整頁檢視（同一頁內，見 design.md 決策 8）：關閉本 dialog 後由呼叫端切換 view */
  onOpenDetailed: () => void;
  onClose: () => void;
}

export function ReminderFormDialog({
  targetName,
  existingSlots,
  onSubmit,
  onOpenDetailed,
  onClose,
}: ReminderFormDialogProps) {
  const { t } = useTranslation();

  const allSlotsUsed = SLOT_TYPES.every((slot) => existingSlots.includes(slot));

  // 驗證規則集中在 schema。訊息需要 t，故隨語言重建。
  const schema = useMemo(
    () =>
      z
        .object({
          slots: z.array(z.enum(SLOT_TYPES)).min(1, t('meds.add.needSlot')),
          // 四個時段的時間一律存在（z.record 搭 z.enum 是完整型，不是 partial），
          // 未勾選的時段維持預設值即可通過驗證；送出前才依 slots 篩選成 partial。
          slotTimes: z.record(
            z.enum(SLOT_TYPES),
            z.string().regex(/^\d{2}:\d{2}$/, t('meds.edit.timeRequired')),
          ),
          startDate: z.string().min(1),
          endDate: z.string(),
        })
        // YYYY-MM-DD 可直接字串比較，不需解析日期
        .refine((v) => !v.endDate || v.endDate >= v.startDate, {
          message: t('meds.add.dateOrderError'),
          path: ['endDate'],
        }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      slots: [],
      slotTimes: { ...DEFAULT_SLOT_TIMES },
      startDate: todayLocalDateString(),
      endDate: '',
    },
  });

  const startDate = watch('startDate');

  const submit = handleSubmit(async (values) => {
    try {
      // 只送出勾選時段的時間，其餘停留在預設值的欄位不必帶給後端
      const slotTimes = Object.fromEntries(
        values.slots.map((slot) => [slot, values.slotTimes[slot]]),
      ) as Partial<Record<MedicationSlotType, string>>;
      await onSubmit({
        slots: values.slots,
        slotTimes,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
      });
    } catch (err) {
      // 送出失敗掛在 root，與欄位錯誤分開顯示在表單底部
      setError('root', {
        message: err instanceof Error ? err.message : t('meds.updateFailed'),
      });
    }
  });

  return (
    // Dialog 內建焦點鎖定、Escape、焦點歸位、背景鎖捲，關閉鈕用 DialogContent 內建那顆。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.add.title')}</DialogTitle>
          <DialogDescription>
            {t('meds.add.targetField')} <strong className="text-foreground">{targetName}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* 只讓表單本體捲動，標題與底部按鈕（含右上關閉鈕）固定不動。
            捲動交給 ScrollArea：它的 scrollbar 是覆蓋式的、不佔 layout 寬度，
            也不會像 overflow-y-auto 那樣把 overflow-x 一併算成 auto
            （CSS Overflow 規範：兩軸只要一軸非 visible，另一軸的 visible 就變 auto），
            那會讓任何 1px 的橫向溢出變成裁切右緣＋長出水平 scrollbar。 */}
        <ScrollArea>
          <form id={FORM_ID} onSubmit={(e) => void submit(e)}>
            <FieldGroup>
              {/* 複選欄位交給 Controller 管理陣列值 */}
              <Controller
                control={control}
                name="slots"
                render={({ field }) => (
                  <FieldSet>
                    <FieldLegend variant="label">{t('meds.add.slotsField')}</FieldLegend>
                    <FieldDescription>{t('meds.add.timeNote')}</FieldDescription>

                    {/* data-slot=checkbox-group 讓 FieldGroup 自動收成卡片間距 */}
                    <FieldGroup data-slot="checkbox-group">
                      {SLOT_TYPES.map((slot) => {
                        const taken = existingSlots.includes(slot);
                        const checked = field.value.includes(slot);
                        return (
                          // 整列（含 FieldLabel）與勾選後才出現的時間欄位包在同一個
                          // <div> 裡：時間輸入框刻意放在 FieldLabel 之外——FieldLabel
                          // 本身是綁定 checkbox 的 <label>，input[type=time] 若塞在裡面，
                          // 點時間欄位會連帶觸發（甚至誤取消）checkbox。
                          <div key={slot}>
                            {/* FieldLabel 包住 Field 就會變成可點的選取卡片：
                                圓角、外框、勾選高亮都是 Field 元件內建的。 */}
                            <FieldLabel htmlFor={`slot-${slot}`}>
                              <Field orientation="horizontal" data-disabled={taken}>
                                <Checkbox
                                  id={`slot-${slot}`}
                                  checked={checked}
                                  disabled={taken || isSubmitting}
                                  onCheckedChange={() =>
                                    field.onChange(
                                      checked
                                        ? field.value.filter((item) => item !== slot)
                                        : [...field.value, slot],
                                    )
                                  }
                                />
                                {/* 時間／「已設定」疊在時段名稱下方，不與名稱爭同一列寬度。
                                    原本三者並排時，Badge 帶 shrink-0 whitespace-nowrap
                                    （見 ui/badge.tsx）是不能壓縮的地板，字級設到
                                    large／xlarge 就會把整列撐出容器、右緣被裁掉。 */}
                                <FieldContent>
                                  <FieldTitle>{t(SLOT_LABEL_KEY[slot])}</FieldTitle>
                                  {taken ? (
                                    <Badge variant="secondary">{t('meds.add.slotExists')}</Badge>
                                  ) : (
                                    <FieldDescription className="num">
                                      {DEFAULT_SLOT_TIMES[slot]}
                                    </FieldDescription>
                                  )}
                                </FieldContent>
                              </Field>
                            </FieldLabel>

                            {checked && !taken && (
                              <Field className="mt-3">
                                <FieldLabel htmlFor={`slot-time-${slot}`}>
                                  {t('meds.add.timeField')}
                                </FieldLabel>
                                <Input
                                  id={`slot-time-${slot}`}
                                  type="time"
                                  className="num"
                                  aria-invalid={Boolean(errors.slotTimes?.[slot])}
                                  disabled={isSubmitting}
                                  {...register(`slotTimes.${slot}`)}
                                />
                                <FieldError errors={[errors.slotTimes?.[slot]]} />
                              </Field>
                            )}
                          </div>
                        );
                      })}
                    </FieldGroup>

                    {allSlotsUsed && (
                      <FieldDescription>{t('meds.add.allSlotsUsed')}</FieldDescription>
                    )}
                    <FieldError errors={[errors.slots]} />
                  </FieldSet>
                )}
              />

              <Field>
                <FieldLabel htmlFor="startDate">{t('meds.add.startDate')}</FieldLabel>
                <Input id="startDate" type="date" disabled={isSubmitting} {...register('startDate')} />
              </Field>

              <Field data-invalid={Boolean(errors.endDate)}>
                <FieldLabel htmlFor="endDate">{t('meds.add.endDate')}</FieldLabel>
                <Input
                  id="endDate"
                  type="date"
                  min={startDate}
                  aria-invalid={Boolean(errors.endDate)}
                  disabled={isSubmitting}
                  {...register('endDate')}
                />
                <FieldDescription>{t('meds.add.endDateOptional')}</FieldDescription>
                <FieldError errors={[errors.endDate]} />
              </Field>

              {errors.root?.message && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>
        </ScrollArea>

        <DialogFooter>
          {/* 詳細設定關掉這個 dialog、換成同一頁內的整頁檢視（design.md 決策 8），
              不是另開路由——放在最左側，與「取消／建立」的送出動線分開。 */}
          <Button
            type="button"
            variant="outline"
            onClick={onOpenDetailed}
            disabled={isSubmitting}
            className="mr-auto"
          >
            {t('meds.add.detailed')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('meds.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSubmitting || allSlotsUsed}>
            {isSubmitting ? t('meds.add.submitting') : t('meds.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
