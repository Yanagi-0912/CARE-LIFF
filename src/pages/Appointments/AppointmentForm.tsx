import type { TFunction } from 'i18next';
import { z } from 'zod';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BanIcon, BellOffIcon, CalendarOffIcon, ChevronRightIcon, Trash2Icon, TriangleAlertIcon,
} from 'lucide-react';

import {
  ACTIONABLE_STATUSES, APPOINTMENT_FIELD_LIMITS as LIMITS, type AppointmentReminder,
  type CreateAppointmentRequest, type UpdateAppointmentRequest,
} from '../../types/appointment';
import {
  type AppointmentParts, buildAppointmentAt, clinicDayFor, describeAppointmentAt, deviceOffsetFor,
  isPast, isWithinSlots, parseAppointmentAt, weekdayOf,
} from '../../utils/appointmentTime';
import { fetchFacilityById } from '../../api/medicalApi';
import type { MedicalFacility } from '../../types/medical';
import {
  type AppointmentConflicts, findAppointmentConflicts, NO_CONFLICTS,
} from '../../utils/appointmentConflicts';
import type { AppointmentSeed, FrequentHospital } from '../../utils/appointmentHistory';
import { appointmentErrorMessage } from '../../api/appointmentApi';
import { queryKeys } from '@/lib/queryClient';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppointmentDetails } from './AppointmentCards';
import { DetailsStep, HospitalStep, VisitStep } from './AppointmentStepper';

/**
 * 掛號表單：步驟、驗證規則與新增／編輯對話框。步驟的內容在 AppointmentStepper，
 * 它只用到這裡的型別。
 *
 * 分四步是為了長輩：原本一個長長的捲動視窗，一打開就要先搜尋醫院（整個流程
 * 最難的一步），錯誤提示也可能在畫面外。每一步只做一個決定，錯誤就出現在眼前。
 */

const STEPS = ['hospital', 'visit', 'details', 'confirm'] as const;
type StepKey = (typeof STEPS)[number];

/** 確認頁上「修改這一段」的按鈕：[要回到的步驟, 按鈕文字]。已到診只剩備註可改 */
const EDIT_SECTIONS: [StepKey, string][] = [
  ['hospital', 'appt.form.editHospital'],
  ['visit', 'appt.form.editVisit'],
  ['details', 'appt.form.editDetails'],
];
const ATTENDED_EDIT_SECTIONS: [StepKey, string][] = [['details', 'appt.form.editNote']];

/** 第一步的三種樣子：已選好（摘要）、搜尋中、手動輸入 */
export type HospitalView = 'summary' | 'picker' | 'manual';

/**
 * 組 appointment_at 用的 offset。編輯時沿用原本的：同一個人、同一家醫院，
 * 改個日期不該連時區都換掉。新增時用裝置在那個日期時間的 offset。
 */
function offsetFor(original: AppointmentParts | null, date: string, time: string): string {
  return original?.offset ?? deviceOffsetFor(date, time);
}

/** 驗證規則集中在 schema。訊息需要 t，故呼叫端隨語言重建。 */
function createAppointmentSchema(t: TFunction, original: AppointmentParts | null) {
  const tooLong = (max: number) => t('appt.form.tooLong', { max });
  return z
    .object({
      facilityId: z.string().nullable(),
      hospitalName: z
        .string()
        .trim()
        .min(1, t('appt.form.hospitalRequired'))
        .max(LIMITS.hospital_name, tooLong(LIMITS.hospital_name)),
      hospitalAddress: z.string(),
      hospitalPhone: z.string(),
      department: z
        .string()
        .trim()
        .min(1, t('appt.form.departmentRequired'))
        .max(LIMITS.department, tooLong(LIMITS.department)),
      date: z.string().min(1, t('appt.form.dateRequired')),
      time: z.string().min(1, t('appt.form.timeRequired')),
      doctorName: z.string().trim().max(LIMITS.doctor_name, tooLong(LIMITS.doctor_name)),
      serialNumber: z.string().trim().max(LIMITS.serial_number, tooLong(LIMITS.serial_number)),
      note: z.string().trim().max(LIMITS.note, tooLong(LIMITS.note)),
      enabled: z.boolean(),
    })
    .refine(
      (v) => {
        if (!v.date || !v.time) return true;
        // 沒改時間就不檢查：後端也只在改 appointment_at 時才擋「已經過了」，
        // 否則今天稍早的門診連備註都改不了。
        if (original && v.date === original.date && v.time === original.time) return true;
        return !isPast(buildAppointmentAt(v.date, v.time, offsetFor(original, v.date, v.time)));
      },
      { message: t('appt.form.inPast'), path: ['time'] },
    );
}

export type AppointmentFormValues = z.infer<ReturnType<typeof createAppointmentSchema>>;

/** 每一步按「下一步」之前要驗的欄位；確認頁送出時才驗整份 */
const STEP_FIELDS: Record<StepKey, Array<keyof AppointmentFormValues>> = {
  hospital: ['hospitalName'],
  visit: ['department', 'date', 'time'],
  details: ['doctorName', 'serialNumber', 'note'],
  confirm: [],
};

/** 表單掛在 dialog body 上，下一步／送出鈕在 DialogFooter，靠 form 屬性連回來 */
const FORM_ID = 'appointment-form';

/** 新增時送出的欄位；user_id 由頁面依上方選的對象補上 */
export type AppointmentFields = Omit<CreateAppointmentRequest, 'user_id'>;

interface AppointmentFormDialogProps {
  /** 有值＝編輯這一筆，沒有＝新增 */
  reminder?: AppointmentReminder;
  /** 「再掛一次」：帶入上次的醫院、科別、醫師，從第二步開始 */
  seed?: AppointmentSeed;
  /** 就診者名稱，僅顯示用；對象由頁面上方的切換決定 */
  targetName: string;
  /** 同一位就診者已有的掛號，用來提示時段衝突與擋下重複 */
  existing: readonly AppointmentReminder[];
  /** 從既有掛號整理出的常去醫院，第一步最上面列出 */
  frequentHospitals: FrequentHospital[];
  onCreate?: (fields: AppointmentFields) => Promise<void>;
  onSave?: (patch: UpdateAppointmentRequest) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** 取消這次門診：保留紀錄、停止推播。只對還在等待的門診顯示 */
  onCancelVisit?: () => Promise<void>;
  onClose: () => void;
}

/** 空白一律當成 null：後端也是這樣正規化，前端先做，編輯時的 diff 才比得準 */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 新增／編輯掛號提醒，分四步：找醫院 → 科別與時間 → 醫師、看診號與備註 → 確認。
 *
 * - 新增從第一步開始；「再掛一次」已經帶好醫院，從第二步開始。
 * - 編輯直接打開確認頁：先看完整內容，要改哪一段再點進去。
 * - 每一步按「下一步」只驗這一步的欄位；撞時段也在第二步就擋下，不必等到最後。
 */
export function AppointmentFormDialog({
  reminder,
  seed,
  targetName,
  existing,
  frequentHospitals,
  onCreate,
  onSave,
  onDelete,
  onCancelVisit,
  onClose,
}: AppointmentFormDialogProps) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(reminder);
  const original = useMemo(
    () => (reminder ? parseAppointmentAt(reminder.appointment_at) : null),
    [reminder],
  );
  // 已到診是終局：醫院、科別、時間、醫師都不能再改，只留備註（2026-09-12 拍板）。
  // 改院所等於改寫「那天在哪裡看了診」這筆紀錄；而且過了當日結束它移到過去的
  // 門診後本來就完全不能改，當天可改、隔天不能改只會讓人摸不著規則。
  // 後端只擋改時間（409），其餘欄位是前端不給入口。
  const attendedLocked = reminder?.status === 'attended';

  const [step, setStep] = useState<StepKey>(reminder ? 'confirm' : seed ? 'visit' : 'hospital');
  const [hospitalView, setHospitalView] = useState<HospitalView>(
    reminder || seed ? 'summary' : 'picker',
  );
  // 從搜尋結果點選的院所：完整資料已經在手上，不必再依 id 重抓
  const [pickedFacility, setPickedFacility] = useState<MedicalFacility | null>(null);

  const schema = useMemo(() => createAppointmentSchema(t, original), [t, original]);
  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(schema),
    // 分步表單沒有「整份送出」讓錯誤開始即時更新的時機，所以一開始就逐欄驗證：
    // 被「下一步」擋下之後，使用者一改那一欄，錯誤就會跟著消失或更新。
    mode: 'onChange',
    defaultValues: {
      facilityId: reminder?.facility_id ?? seed?.facilityId ?? null,
      hospitalName: reminder?.hospital_name ?? seed?.hospitalName ?? '',
      hospitalAddress: reminder?.hospital_address ?? seed?.hospitalAddress ?? '',
      hospitalPhone: reminder?.hospital_phone ?? seed?.hospitalPhone ?? '',
      department: reminder?.department ?? seed?.department ?? '',
      date: original?.date ?? '',
      time: original?.time ?? '',
      doctorName: reminder?.doctor_name ?? seed?.doctorName ?? '',
      serialNumber: reminder?.serial_number ?? '',
      note: reminder?.note ?? '',
      enabled: reminder?.enabled ?? true,
    },
  });
  const {
    getValues,
    handleSubmit,
    setError,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const { facilityId, hospitalName, department, date, time, doctorName, serialNumber, note, enabled } =
    watch();

  // 只知道 facility_id 時（編輯、再掛一次、點了常去的醫院），科別清單與門診時段
  // 要依 id 重抓。從搜尋結果點選的院所資料已經完整，不必重抓。
  const facilityQuery = useQuery({
    queryKey: queryKeys.facility(facilityId ?? ''),
    queryFn: () => fetchFacilityById(facilityId as string),
    enabled: Boolean(facilityId) && !pickedFacility,
    // 資料庫故障時後端回的也是 404（實作報告 §4），重試沒有意義，直接降級成不顯示時段
    retry: false,
    staleTime: 5 * 60_000,
  });
  const facility = pickedFacility ?? (facilityId ? (facilityQuery.data ?? null) : null);
  const facilityUnavailable = Boolean(facilityId) && !pickedFacility && facilityQuery.isError;

  const departments = facility?.departments?.filter(Boolean) ?? [];
  // clinic_time 是整間院所的營業時段，不是各科門診表：只拿來提示，不拿來擋。
  // 權威是使用者手上的掛號單。手動輸入的院所（沒有門診表）或還沒選日期時不提示。
  const clinicDay = facility && date ? clinicDayFor(facility.clinic_time, date) : null;
  const slots = clinicDay?.kind === 'open' ? clinicDay.slots : null;
  const outsideSlots = Boolean(slots && time && !isWithinSlots(time, slots));
  const dateWeekday = date ? weekdayOf(date) : null;
  const weekdayLabel = dateWeekday ? t(`weekday.${dateWeekday}`) : '';

  const whenOf = (other: AppointmentReminder) => {
    const when = describeAppointmentAt(t, other.appointment_at);
    return when.time ? `${when.date} ${when.time}` : when.date;
  };

  // 與同一位就診者其他掛號的衝突。offset 的取法與送出時完全相同，比的才是同一個
  // 瞬間。編輯時只有「是哪一次門診」的欄位真的變了才比：後端也只在那時候檢查，
  // 只改備註不該因為別筆而被擋。
  const conflictsFor = (
    values: Pick<AppointmentFormValues, 'date' | 'time' | 'facilityId' | 'hospitalName' | 'department'>,
  ): AppointmentConflicts => {
    if (!values.date || !values.time) return NO_CONFLICTS;
    if (
      reminder &&
      original &&
      values.date === original.date &&
      values.time === original.time &&
      values.facilityId === (reminder.facility_id ?? null) &&
      values.hospitalName.trim() === reminder.hospital_name &&
      values.department.trim() === reminder.department
    ) {
      return NO_CONFLICTS;
    }
    return findAppointmentConflicts(
      {
        appointmentAt: buildAppointmentAt(
          values.date,
          values.time,
          offsetFor(original, values.date, values.time),
        ),
        facilityId: values.facilityId,
        hospitalName: values.hospitalName,
        department: values.department,
      },
      existing,
      reminder?.id,
    );
  };
  const conflicts = conflictsFor({ date, time, facilityId, hospitalName, department });

  /**
   * 同一時間已經有另一筆掛號就不能建立（產品決策：時段衝突一律硬擋）。
   * 同醫院同科別是重複、不同醫院或科別是撞時段，兩種都擋，只是說法不同。
   */
  const blockingMessage = (values: AppointmentFormValues): string | null => {
    const clash = conflictsFor(values);
    if (clash.duplicate) return t('appt.form.duplicate', { when: whenOf(clash.duplicate) });
    const sameTime = clash.sameTime[0];
    if (sameTime) {
      return t('appt.form.sameTime', {
        hospital: sameTime.hospital_name,
        department: sameTime.department,
        when: whenOf(sameTime),
      });
    }
    return null;
  };

  const stepIndex = STEPS.indexOf(step);

  const fillHospital = (hospital: {
    facilityId: string | null;
    name: string;
    address: string | null;
    phone: string | null;
  }) => {
    // facility id 可能為 null（後端自己也不保證有），整條流程不能因此失敗
    setValue('facilityId', hospital.facilityId);
    setValue('hospitalName', hospital.name, { shouldValidate: true });
    setValue('hospitalAddress', hospital.address ?? '');
    setValue('hospitalPhone', hospital.phone ?? '');
    setHospitalView('summary');
    // 明確點選了一家醫院就直接往下一步：少按一次「下一步」，確認頁還看得到、改得回來
    setStep('visit');
  };

  const pickFacility = (picked: MedicalFacility) => {
    setPickedFacility(picked);
    fillHospital({
      facilityId: picked.id ?? null,
      name: picked.name,
      address: picked.address ?? null,
      phone: picked.phone ?? null,
    });
  };

  const pickFrequent = (hospital: FrequentHospital) => {
    setPickedFacility(null);
    fillHospital(hospital.facilityId ? hospital : { ...hospital, facilityId: null });
  };

  const switchToManual = () => {
    // 手動輸入的院所沒有 id。舊的 facility_id 一定要清掉，否則會指向另一家院所。
    setPickedFacility(null);
    setValue('facilityId', null);
    setValue('hospitalAddress', '');
    setValue('hospitalPhone', '');
    setHospitalView('manual');
  };

  const goNext = async () => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) return;
    if (step === 'visit') {
      // 錯誤掛在 time 欄位：使用者改了時間，欄位重新驗證時這個錯誤就會自己消失
      const message = blockingMessage(getValues());
      if (message) {
        setError('time', { message });
        return;
      }
    }
    setStep(STEPS[stepIndex + 1]);
  };

  const submit = handleSubmit(
    async (values) => {
      // 清單在填表期間可能更新了（別人剛建了一筆），送出前再比一次
      const message = blockingMessage(values);
      if (message) {
        setError('time', { message });
        setStep('visit');
        return;
      }

      const fields: AppointmentFields = {
        appointment_at: buildAppointmentAt(
          values.date,
          values.time,
          offsetFor(original, values.date, values.time),
        ),
        facility_id: values.facilityId,
        hospital_name: values.hospitalName,
        hospital_address: orNull(values.hospitalAddress),
        hospital_phone: orNull(values.hospitalPhone),
        department: values.department,
        doctor_name: orNull(values.doctorName),
        serial_number: orNull(values.serialNumber),
        note: orNull(values.note),
      };

      try {
        if (!reminder) {
          await onCreate?.(fields);
          return;
        }

        // 只送出真正變動的欄位。後端用 exclude_unset：沒帶＝不動、帶 null＝清空。
        const patch: UpdateAppointmentRequest = {};
        if (!original || values.date !== original.date || values.time !== original.time) {
          patch.appointment_at = fields.appointment_at;
        }
        for (const key of [
          'facility_id',
          'hospital_name',
          'hospital_address',
          'hospital_phone',
          'department',
          'doctor_name',
          'serial_number',
          'note',
        ] as const) {
          if (fields[key] !== (reminder[key] ?? null)) Object.assign(patch, { [key]: fields[key] });
        }
        if (values.enabled !== reminder.enabled) patch.enabled = values.enabled;

        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await onSave?.(patch);
      } catch (err) {
        // 送出失敗掛在 root，顯示在確認頁底部。從這個表單送出的 POST／PUT 會 409
        // 的只有「同一時間已經有一筆」（清單過期時）：已到診的不給改時間，已取消的
        // 不會出現在即將到來、點不開這個表單。
        setError('root', {
          message: appointmentErrorMessage(t, i18n.language, err, {
            conflictKey: 'appt.error.duplicate',
          }),
        });
      }
    },
    (invalid) => {
      // 確認頁看不到欄位：哪一步有錯就回到哪一步，讓錯誤出現在眼前
      const target = STEPS.find((key) => STEP_FIELDS[key].some((field) => invalid[field]));
      if (target) setStep(target);
    },
  );

  // 取消這次門診與刪除這筆紀錄共用：開著哪一個確認框、是否正在送出。
  // 失敗時收掉確認框，錯誤訊息顯示在確認頁底部；成功時頁面會關掉整個對話框。
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null);
  const [acting, setActing] = useState(false);
  const runAction = async (action: (() => Promise<void>) | undefined) => {
    setActing(true);
    try {
      await action?.();
    } catch (err) {
      setConfirming(null);
      setError('root', { message: appointmentErrorMessage(t, i18n.language, err) });
    } finally {
      setActing(false);
    }
  };
  // 只有還在等待的門診能取消：已到診的後端回 409，已取消的不會出現在即將到來
  const canCancelVisit = Boolean(
    onCancelVisit && reminder && ACTIONABLE_STATUSES.has(reminder.status),
  );

  const busy = isSubmitting || acting;
  const title = t(isEdit ? 'appt.form.editTitle' : seed ? 'appt.form.rebookTitle' : 'appt.form.addTitle');
  const progressText = t('appt.step.progress', { current: stepIndex + 1, total: STEPS.length });
  const previewAt =
    date && time ? buildAppointmentAt(date, time, offsetFor(original, date, time)) : null;

  const submitLabel = isEdit
    ? t(isSubmitting ? 'appt.form.saving' : 'appt.form.save')
    : t(isSubmitting ? 'appt.form.submitting' : 'appt.form.submit');

  return (
    // Dialog 內建焦點鎖定、Escape、焦點歸位、背景鎖捲，關閉鈕用 DialogContent 內建那顆。
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t('appt.form.targetField')} <strong className="text-foreground">{targetName}</strong>
          </DialogDescription>
          {/* 進度放在不會捲動的標題區：隨時看得到自己在第幾步、這一步要做什麼 */}
          <div className="mt-2 flex flex-col gap-2">
            {/* 已到診只剩備註可改，沒有「第幾步」可言 */}
            {!attendedLocked && (
              <>
                <Progress value={((stepIndex + 1) / STEPS.length) * 100} aria-label={progressText} />
                <p className="text-sm font-semibold text-muted-foreground">{progressText}</p>
              </>
            )}
            <h3 className="text-xl leading-tight font-extrabold">
              {attendedLocked && step === 'details' ? t('appt.card.note') : t(`appt.step.${step}`)}
            </h3>
          </div>
        </DialogHeader>

        {/* key={step}：換步驟時重新掛載捲動區，回到頂端，不會停在上一步捲到的位置。
            欄位的值存在表單狀態裡（shouldUnregister 預設 false），不會因此遺失。 */}
        <ScrollArea key={step}>
          <FormProvider {...form}>
            <form
              id={FORM_ID}
              onSubmit={(event) => {
                event.preventDefault();
                // 輸入框裡按 Enter 等同按下底部那顆主要按鈕
                if (step === 'confirm') void submit();
                else void goNext();
              }}
            >
              {step === 'hospital' && (
                <HospitalStep
                  view={hospitalView}
                  onViewChange={setHospitalView}
                  frequent={frequentHospitals}
                  onPickFacility={pickFacility}
                  onPickFrequent={pickFrequent}
                  onManual={switchToManual}
                  facilityUnavailable={facilityUnavailable}
                  busy={busy}
                />
              )}

              {step === 'visit' && (
                <VisitStep
                  departments={departments}
                  clinicDay={clinicDay}
                  slots={slots}
                  outsideSlots={outsideSlots}
                  weekdayLabel={weekdayLabel}
                  facilityUnavailable={facilityUnavailable}
                  conflicts={conflicts}
                  whenOf={whenOf}
                  busy={busy}
                  rebookHint={Boolean(seed)}
                />
              )}

              {step === 'details' && (
                <DetailsStep isEdit={isEdit} noteOnly={attendedLocked} busy={busy} />
              )}

              {step === 'confirm' && (
                <div className="flex flex-col gap-4">
                  <p className="leading-relaxed text-muted-foreground">
                    {attendedLocked ? t('appt.form.attendedLocked') : t('appt.form.confirmHint')}
                  </p>
                  {/* 與列表上的卡片同一個元件：確認的就是之後會看到的那張卡 */}
                  <div className="rounded-2xl border border-border bg-card p-4">
                    {previewAt && (
                      <AppointmentDetails
                        appointmentAt={previewAt}
                        hospitalName={hospitalName}
                        department={department}
                        doctorName={orNull(doctorName)}
                        serialNumber={orNull(serialNumber)}
                        note={orNull(note)}
                      />
                    )}
                    {isEdit && !enabled && !attendedLocked && (
                      <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <BellOffIcon aria-hidden className="size-4 shrink-0" />
                        {t('appt.notifyOff')}
                      </p>
                    )}
                  </div>

                  {/* 第二步看過的提醒在送出前再講一次：這是最後一次對照掛號單的機會 */}
                  {clinicDay?.kind === 'closed' && !attendedLocked && (
                    <Alert>
                      <CalendarOffIcon />
                      <AlertDescription>
                        {t('appt.form.closedDay', { weekday: weekdayLabel })}
                      </AlertDescription>
                    </Alert>
                  )}
                  {outsideSlots && !attendedLocked && (
                    <Alert>
                      <TriangleAlertIcon />
                      <AlertDescription>{t('appt.form.outsideSlots')}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-col gap-2">
                    {(attendedLocked ? ATTENDED_EDIT_SECTIONS : EDIT_SECTIONS).map(([section, labelKey]) => (
                      <Button
                        key={section}
                        type="button"
                        variant="outline"
                        className="h-auto min-h-11 justify-between whitespace-normal"
                        disabled={busy}
                        onClick={() => setStep(section)}
                      >
                        {t(labelKey)}
                        <ChevronRightIcon data-icon="inline-end" />
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {errors.root?.message && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              )}

              {/* 取消與刪除放在確認頁內容的最下面，不放底部列：底部只留「上一步」「儲存」，
                  大字級下不會擠成好幾行，刪除也不會貼著儲存。兩者都要再經過一層確認。 */}
              {isEdit && step === 'confirm' && (
                <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
                  {canCancelVisit && (
                    <AlertDialog
                      open={confirming === 'cancel'}
                      onOpenChange={(open) => setConfirming(open ? 'cancel' : null)}
                    >
                      <AlertDialogTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto min-h-11 w-full whitespace-normal"
                            disabled={busy}
                          />
                        }
                      >
                        <BanIcon data-icon="inline-start" />
                        {t('appt.form.cancelVisit')}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('appt.form.cancelVisit')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('appt.form.cancelVisitConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={busy}>
                            {t('meds.edit.deleteConfirmNo')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            disabled={busy}
                            onClick={() => void runAction(onCancelVisit)}
                          >
                            {t('appt.form.cancelVisit')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog
                    open={confirming === 'delete'}
                    onOpenChange={(open) => setConfirming(open ? 'delete' : null)}
                  >
                    <AlertDialogTrigger
                      render={
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-auto min-h-11 w-full whitespace-normal"
                          disabled={busy}
                        />
                      }
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {t('appt.form.delete')}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('appt.form.delete')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('appt.form.deleteConfirm')}
                          {/* 「不去了」最常見的誤用就是刪除：還能取消的，指一條不會丟掉紀錄的路 */}
                          {canCancelVisit && (
                            <span className="mt-2 block">{t('appt.form.deleteCancelHint')}</span>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                          {t('meds.edit.deleteConfirmNo')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void runAction(onDelete)}
                        >
                          {t('meds.edit.deleteConfirmYes')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </form>
          </FormProvider>
        </ScrollArea>

        <DialogFooter>
          {stepIndex === 0 ? (
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('meds.cancel')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              // 已到診從備註往回只能回確認頁：再往前就是醫院、科別與時間，那些已經不能改
              onClick={() =>
                setStep(attendedLocked && step === 'details' ? 'confirm' : STEPS[stepIndex - 1])
              }
              disabled={busy}
            >
              {t('appt.form.back')}
            </Button>
          )}
          <Button type="submit" form={FORM_ID} disabled={busy}>
            {step === 'confirm' ? submitLabel : t('appt.form.next')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
