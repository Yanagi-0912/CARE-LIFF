import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  Building2Icon, CalendarOffIcon, ChevronRightIcon, CircleAlertIcon, LocateFixedIcon, HospitalIcon,
  SearchIcon, TriangleAlertIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  APPOINTMENT_FIELD_LIMITS as LIMITS, type AppointmentReminder,
} from '../../types/appointment';
import type { ClinicTimeSlot, MedicalFacility } from '../../types/medical';
import type { FrequentHospital } from '../../utils/appointmentHistory';
import { fetchNearbyHospitals, searchFacilitiesByName } from '../../api/medicalApi';
import { useGeolocation } from '../../hooks/useGeolocation';
import { formatDistance } from '../NearbyHospitals/searchSummary';
import type { AppointmentConflicts } from '../../utils/appointmentConflicts';
import { type ClinicDay, hourHint, parseAppointmentAt } from '../../utils/appointmentTime';
import { todayLocalDateString } from '../../utils/date';
import { Button } from '@/components/ui/button';
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle,
} from '@/components/ui/item';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import type { AppointmentFormValues, HospitalView } from './AppointmentForm';

/**
 * 新增／編輯掛號的步驟內容：找醫院（含院所搜尋）、科別與時間（含 24 小時制的時間選單）、
 * 醫師與備註。進度、上一步／下一步與確認頁由 AppointmentForm 的對話框負責。
 */

interface HospitalStepProps {
  view: HospitalView;
  onViewChange: (view: HospitalView) => void;
  /** 從既有掛號整理出的常去醫院；沒有就不顯示那一區 */
  frequent: FrequentHospital[];
  onPickFacility: (facility: MedicalFacility) => void;
  onPickFrequent: (hospital: FrequentHospital) => void;
  onManual: () => void;
  /** 依 facility_id 重抓院所失敗（後端資料庫故障時也是 404） */
  facilityUnavailable: boolean;
  busy: boolean;
}

/** 第一步：找醫院。常去的醫院在最上面，點一下就好；其他醫院用搜尋，查不到再手動輸入。 */
export function HospitalStep({
  view,
  onViewChange,
  frequent,
  onPickFacility,
  onPickFrequent,
  onManual,
  facilityUnavailable,
  busy,
}: HospitalStepProps) {
  const { t } = useTranslation();
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<AppointmentFormValues>();
  const hospitalName = watch('hospitalName');
  const hospitalAddress = watch('hospitalAddress');

  return (
    <FieldGroup>
      {view === 'summary' && (
        <>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <Building2Icon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-base break-words">{hospitalName}</ItemTitle>
              {hospitalAddress && (
                <ItemDescription className="line-clamp-none break-words">
                  {hospitalAddress}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onViewChange('picker')}
              >
                {t('appt.form.changeHospital')}
              </Button>
            </ItemActions>
          </Item>
          {facilityUnavailable && (
            <FieldDescription>{t('appt.form.facilityUnavailable')}</FieldDescription>
          )}
        </>
      )}

      {view === 'picker' && (
        <>
          {/* 回診是最常見的情況：同一家醫院一去再去。放在搜尋之前，
              點一下就帶入並進到下一步，不必每次都重新搜尋。 */}
          {frequent.length > 0 && (
            <FieldSet>
              <FieldLegend variant="label">{t('appt.form.recentHospitals')}</FieldLegend>
              <FieldDescription>{t('appt.form.recentHospitalsHint')}</FieldDescription>
              <ItemGroup className="gap-2">
                {frequent.map((hospital) => (
                  <Item
                    key={hospital.key}
                    variant="outline"
                    size="sm"
                    className="cursor-pointer text-left transition-colors hover:bg-muted/40"
                    render={
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPickFrequent(hospital)}
                      />
                    }
                  >
                    <ItemMedia variant="icon">
                      <HospitalIcon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-base break-words">{hospital.name}</ItemTitle>
                      {hospital.address && (
                        <ItemDescription className="line-clamp-none break-words">
                          {hospital.address}
                        </ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions>
                      <ChevronRightIcon aria-hidden className="size-5 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </FieldSet>
          )}

          <FacilityPicker
            onPick={onPickFacility}
            onManual={onManual}
            onCancel={hospitalName ? () => onViewChange('summary') : undefined}
            disabled={busy}
          />
        </>
      )}

      {view === 'manual' && (
        <Field data-invalid={Boolean(errors.hospitalName)}>
          <FieldLabel htmlFor="appt-hospital-name">{t('appt.form.manualHospitalLabel')}</FieldLabel>
          <Input
            id="appt-hospital-name"
            maxLength={LIMITS.hospital_name}
            aria-invalid={Boolean(errors.hospitalName)}
            disabled={busy}
            {...register('hospitalName')}
          />
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 self-start px-0 whitespace-normal"
            disabled={busy}
            onClick={() => onViewChange('picker')}
          >
            {t('appt.form.backToSearch')}
          </Button>
        </Field>
      )}

      <FieldError errors={[errors.hospitalName]} />
    </FieldGroup>
  );
}

interface FacilityPickerProps {
  onPick: (facility: MedicalFacility) => void;
  /** 查不到院所時改為手動輸入名稱 */
  onManual: () => void;
  /** 已經有選過的院所時提供「取消」，回到原本的選擇 */
  onCancel?: () => void;
  disabled: boolean;
}

/**
 * 院所選擇器：沿用「找附近醫院」同一組 API（名稱查詢與附近查詢）。
 *
 * 結果不用 FacilityCard：那張卡有撥號、導航、一週門診表，放進 dialog 的清單裡
 * 會把「選這家」淹沒。這裡只列挑選需要的名稱、地址、距離；門診時段在選完之後、
 * 選時間那一欄才派得上用場。
 *
 * 不用 <form>：它嵌在掛號表單裡，巢狀 form 是無效的 HTML，按 Enter 會送出
 * 外層的掛號表單。改在輸入框上攔 Enter。
 */
function FacilityPicker({ onPick, onManual, onCancel, disabled }: FacilityPickerProps) {
  const { t } = useTranslation();
  const { position, loading: locating, errorCode, errorMessage, requestPosition } =
    useGeolocation();

  const [keyword, setKeyword] = useState('');
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [results, setResults] = useState<MedicalFacility[] | null>(null);

  const nameSearch = useMutation({
    // 座標是選填的：有的話後端會先在生活圈內比對（同名院所全台有數十家），
    // 沒有也照樣查得到，所以不為了名稱查詢去要一次定位權限。
    mutationFn: (value: string) =>
      searchFacilitiesByName(value, { lat: position?.latitude, lng: position?.longitude }),
    onSuccess: (response) => setResults(response.facilities),
  });

  const nearbySearch = useMutation({
    mutationFn: async () => {
      const geo = await requestPosition();
      if (!geo) return null;
      return fetchNearbyHospitals(geo.latitude, geo.longitude, { limit: 10 });
    },
    onSuccess: (response) => {
      if (response) setResults(response.facilities);
    },
  });

  const searching = nameSearch.isPending || nearbySearch.isPending || locating;
  const searchFailed = Boolean(nameSearch.error ?? nearbySearch.error);

  const runNameSearch = () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setKeywordError(t('nearby.keywordRequired'));
      return;
    }
    setKeywordError(null);
    // 換一種搜尋方式時清掉另一種的錯誤，否則畫面上掛著的是上一次的失敗
    nearbySearch.reset();
    nameSearch.mutate(trimmed);
  };

  const runNearbySearch = () => {
    setKeywordError(null);
    nameSearch.reset();
    nearbySearch.mutate();
  };

  const permissionHint =
    errorCode === 'permission_denied'
      ? t('nearby.hintPermission')
      : errorCode === 'insecure'
        ? t('nearby.hintHttps')
        : errorCode === 'unsupported'
          ? t('nearby.hintUnsupported')
          : errorCode === 'timeout' || errorCode === 'unavailable'
            ? t('nearby.hintTimeout')
            : null;

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={Boolean(keywordError)}>
        <FieldLabel htmlFor="facility-keyword">{t('nearby.keywordLabel')}</FieldLabel>
        {/* flex-wrap：最大字級下輸入框與按鈕放不下一列時上下堆疊，不互相擠壓 */}
        <div className="flex flex-wrap gap-2">
          <Input
            id="facility-keyword"
            className="min-w-48 flex-1"
            value={keyword}
            placeholder={t('nearby.keywordPlaceholder')}
            aria-invalid={Boolean(keywordError)}
            disabled={disabled}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runNameSearch();
              }
            }}
          />
          <Button type="button" onClick={runNameSearch} disabled={disabled || searching}>
            <SearchIcon data-icon="inline-start" />
            {t('nearby.keywordButton')}
          </Button>
        </div>
        {keywordError && <FieldError>{keywordError}</FieldError>}
      </Field>

      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-11 whitespace-normal"
        onClick={runNearbySearch}
        disabled={disabled || searching}
      >
        <LocateFixedIcon data-icon="inline-start" />
        {nearbySearch.isPending || locating ? t('nearby.searching') : t('appt.form.searchNearby')}
      </Button>

      {(errorMessage || permissionHint) && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage && <p>{errorMessage}</p>}
            {permissionHint && <p className="opacity-90">{permissionHint}</p>}
          </AlertDescription>
        </Alert>
      )}

      {searchFailed && (
        <Alert variant="destructive">
          <AlertDescription>{t('appt.error.facilitySearch')}</AlertDescription>
        </Alert>
      )}

      {results && results.length === 0 && (
        <p className="text-muted-foreground">{t('nearby.nameEmpty')}</p>
      )}

      {results && results.length > 0 && (
        <ItemGroup className="gap-2" aria-label={t('appt.form.searchResults')}>
          {results.map((facility) => {
            const distance = formatDistance(facility.distance_meters);
            return (
              <Item
                key={facility.id ?? `${facility.name}-${facility.latitude}`}
                variant="outline"
                size="sm"
                className="cursor-pointer text-left transition-colors hover:bg-muted/40"
                render={
                  <button type="button" disabled={disabled} onClick={() => onPick(facility)} />
                }
              >
                <ItemContent>
                  <ItemTitle className="text-base break-words">{facility.name}</ItemTitle>
                  <ItemDescription className="line-clamp-none break-words">
                    {facility.address}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="flex-col items-end gap-1">
                  {distance && <Badge variant="secondary">{distance}</Badge>}
                  <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    {t('appt.form.pick')}
                    <ChevronRightIcon aria-hidden className="size-4" />
                  </span>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      <div className="flex flex-wrap gap-x-4">
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-11 px-0 text-left whitespace-normal"
          onClick={onManual}
          disabled={disabled}
        >
          {t('appt.form.manualEntry')}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 px-0 whitespace-normal"
            onClick={onCancel}
            disabled={disabled}
          >
            {t('meds.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** 醫學中心會有三十幾個科，全展開會把日期時間欄位推到好幾個螢幕以下 */
const VISIBLE_DEPARTMENTS = 12;

interface VisitStepProps {
  /** 院所登記的科別；手動輸入的院所或查不到時是空的 */
  departments: string[];
  clinicDay: ClinicDay | null;
  slots: ClinicTimeSlot[] | null;
  outsideSlots: boolean;
  weekdayLabel: string;
  facilityUnavailable: boolean;
  conflicts: AppointmentConflicts;
  whenOf: (other: AppointmentReminder) => string;
  busy: boolean;
  /** 「再掛一次」帶入了上次的醫院、科別與醫師 */
  rebookHint: boolean;
}

/** 第二步：科別與時間。 */
export function VisitStep({
  departments,
  clinicDay,
  slots,
  outsideSlots,
  weekdayLabel,
  facilityUnavailable,
  conflicts,
  whenOf,
  busy,
  rebookHint,
}: VisitStepProps) {
  const { t } = useTranslation();
  const {
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<AppointmentFormValues>();
  // 換醫院只會發生在第一步，回到這一步時元件重新掛載，展開狀態自然重置
  const [showAllDepartments, setShowAllDepartments] = useState(false);

  const department = watch('department');
  const time = watch('time');

  const shownDepartments = showAllDepartments
    ? departments
    : departments.slice(0, VISIBLE_DEPARTMENTS);
  const hiddenDepartmentCount = departments.length - shownDepartments.length;

  return (
    <FieldGroup>
      {rebookHint && (
        <p className="rounded-xl bg-primary/10 px-3 py-2.5 leading-relaxed">
          {t('appt.form.rebookHint')}
        </p>
      )}

      <Field data-invalid={Boolean(errors.department)}>
        <FieldLabel htmlFor="appt-department">{t('appt.form.department')}</FieldLabel>
        {departments.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('appt.form.department')}>
            {shownDepartments.map((name) => (
              <Button
                key={name}
                type="button"
                variant={department === name ? 'default' : 'outline'}
                aria-pressed={department === name}
                className="h-auto min-h-11 rounded-full whitespace-normal"
                disabled={busy}
                onClick={() => setValue('department', name, { shouldValidate: true })}
              >
                {name}
              </Button>
            ))}
            {hiddenDepartmentCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-11 whitespace-normal"
                aria-expanded={false}
                onClick={() => setShowAllDepartments(true)}
              >
                {t('appt.form.moreDepartments', { count: departments.length })}
              </Button>
            )}
          </div>
        )}
        {/* 快捷鍵只是院所登記的部定科別，仍保留自由輸入：掛號單上常寫的是
            次專科（「心臟內科」），院所資料可能只登記到「內科」。 */}
        <Input
          id="appt-department"
          placeholder={t('appt.form.departmentPlaceholder')}
          maxLength={LIMITS.department}
          aria-invalid={Boolean(errors.department)}
          disabled={busy}
          {...register('department')}
        />
        {departments.length > 0 && (
          <FieldDescription>{t('appt.form.departmentHint')}</FieldDescription>
        )}
        <FieldError errors={[errors.department]} />
      </Field>

      <Field data-invalid={Boolean(errors.date)}>
        <FieldLabel htmlFor="appt-date">{t('appt.form.date')}</FieldLabel>
        <Input
          id="appt-date"
          type="date"
          min={todayLocalDateString()}
          aria-invalid={Boolean(errors.date)}
          disabled={busy}
          {...register('date')}
        />
        <FieldError errors={[errors.date]} />
      </Field>

      {/* 休診與查不到分開說：休診是資料明確寫著那天沒開，值得一個醒目的提示；
          查不到只是我們不知道，一行說明即可。兩者都不擋。 */}
      {clinicDay?.kind === 'closed' && (
        <Alert>
          <CalendarOffIcon />
          <AlertDescription>{t('appt.form.closedDay', { weekday: weekdayLabel })}</AlertDescription>
        </Alert>
      )}
      {clinicDay?.kind === 'unknown' && (
        <FieldDescription>{t('appt.form.noClinicHours', { weekday: weekdayLabel })}</FieldDescription>
      )}
      {facilityUnavailable && (
        <FieldDescription>{t('appt.form.facilityUnavailable')}</FieldDescription>
      )}

      {/* 先給查到的門診時段當快捷鍵，下方再給分鐘級的自訂選單。
          點時段只是把開始時間帶進下面那一欄，使用者照樣可以改成 09:47。 */}
      {slots && (
        <div className="flex flex-col gap-2">
          <FieldDescription id="appt-slots-label">{t('appt.form.clinicSlots')}</FieldDescription>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="appt-slots-label">
            {slots.map((slot) => (
              <Button
                key={`${slot.open}-${slot.close}`}
                type="button"
                variant={time === slot.open ? 'default' : 'outline'}
                aria-pressed={time === slot.open}
                className="num rounded-full"
                disabled={busy}
                onClick={() => setValue('time', slot.open, { shouldValidate: true })}
              >
                {slot.open}–{slot.close}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Field data-invalid={Boolean(errors.time)}>
        <FieldLabel htmlFor="appt-time">{t('appt.form.time')}</FieldLabel>
        {/* 不用原生 <input type="time">：它依手機語系顯示成 12 小時制，
            14:00 會變成「下午 02:00」而被讀成兩點。見 TimeOfDaySelect。 */}
        <Controller
          control={control}
          name="time"
          render={({ field }) => (
            <TimeOfDaySelect
              id="appt-time"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              invalid={Boolean(errors.time)}
            />
          )}
        />
        <FieldDescription>{t('appt.form.timeHint')}</FieldDescription>
        <FieldError errors={[errors.time]} />
      </Field>

      {outsideSlots && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>{t('appt.form.outsideSlots')}</AlertDescription>
        </Alert>
      )}

      {/* 與同一位就診者其他掛號的衝突。同一時間的兩種（重複、撞時段）都擋，
          用紅色；同一天不同時間只提示。一選到衝突的時間就先講，不必等按下一步。
          被擋下時同一句話會掛到時間欄位的錯誤上，這時就不再重複顯示這一塊。 */}
      {conflicts.duplicate && !errors.time && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>
            {t('appt.form.duplicate', { when: whenOf(conflicts.duplicate) })}
          </AlertDescription>
        </Alert>
      )}
      {!conflicts.duplicate && conflicts.sameTime[0] && !errors.time && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>
            {t('appt.form.sameTime', {
              hospital: conflicts.sameTime[0].hospital_name,
              department: conflicts.sameTime[0].department,
              when: whenOf(conflicts.sameTime[0]),
            })}
          </AlertDescription>
        </Alert>
      )}
      {conflicts.sameDay[0] && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            {t('appt.form.sameDay', {
              hospital: conflicts.sameDay[0].hospital_name,
              department: conflicts.sameDay[0].department,
              time: parseAppointmentAt(conflicts.sameDay[0].appointment_at)?.time ?? '',
            })}
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}

// 06 時排最前、凌晨 00–05 放最後：門診幾乎都在白天，長輩打開選單不必先滑過八個凌晨選項。
const HOURS = [
  ...Array.from({ length: 18 }, (_, h) => h + 6),
  ...Array.from({ length: 6 }, (_, h) => h),
].map((h) => `${h}`.padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, m) => `${m}`.padStart(2, '0'));

interface TimeOfDaySelectProps {
  /** 掛在「時」的選單上，讓外面的 FieldLabel htmlFor 對得上 */
  id: string;
  /** `HH:MM`（24 小時制）或空字串 */
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
}

/**
 * 門診時間的選單：時、分各一個，**一律 24 小時制**。
 *
 * 取代原生的 `<input type="time">`。那個輸入框的顯示格式由手機的語系決定，
 * 中文手機會顯示成「下午 02:00」，長輩只看得到大大的「02:00」，以為選到了
 * 凌晨兩點（回報的 bug：點了 14:00–18:00 的時段，欄位顯示 2:00）。存下來的
 * 值其實是對的，誤導人的是顯示，而那個顯示不是網頁控制得了的，只能自己畫。
 *
 * 「時」的每個選項附上口語的說法（「14 時（下午 2 點）」），給習慣 12 小時制的
 * 人對照。分鐘在選好「時」之前停用：先選時再選分是自然的順序，也省掉
 * 「只有分沒有時」這種半套狀態。
 */
function TimeOfDaySelect({ id, value, onChange, disabled, invalid }: TimeOfDaySelectProps) {
  const { t } = useTranslation();
  const [hour = '', minute = ''] = value ? value.split(':') : [];

  const hourLabel = (h: string) => {
    const { period, hour12 } = hourHint(Number(h));
    return t('appt.form.hourOption', {
      hour: h,
      hint: t('appt.time.hourHint', { period: t(`appt.time.period.${period}`), hour12 }),
    });
  };
  const minuteLabel = (m: string) => t('appt.form.minuteOption', { minute: m });

  return (
    // flex-wrap + 各自的最小寬度：一般字級下並排，最大字級時「時」那一格的
    // 附註放不下就自動換成上下兩行，不會被 line-clamp 截掉。
    <div className="flex flex-wrap gap-2">
      <Select
        value={hour || null}
        onValueChange={(next) => {
          if (next) onChange(`${next}:${minute || '00'}`);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={t('appt.form.hourAria')}
          aria-invalid={invalid}
          className="num min-w-[11rem] flex-[2] font-semibold"
        >
          <SelectValue>
            {(current) => (current ? hourLabel(String(current)) : t('appt.form.hourPlaceholder'))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {hourLabel(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={minute || null}
        onValueChange={(next) => {
          if (next && hour) onChange(`${hour}:${next}`);
        }}
        disabled={disabled || !hour}
      >
        <SelectTrigger
          aria-label={t('appt.form.minuteAria')}
          aria-invalid={invalid}
          className="num min-w-[7rem] flex-1 font-semibold"
        >
          <SelectValue>
            {(current) =>
              current ? minuteLabel(String(current)) : t('appt.form.minutePlaceholder')
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {minuteLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 第三步：醫師、看診號、備註。全部選填，頁首先講清楚「可以直接下一步」。
 *
 * `noteOnly`：已到診的掛號只剩備註可改（醫師、看診號是那次門診的事實，推播也
 * 已經全部停了），其餘欄位與推播開關都不顯示。
 */
export function DetailsStep({
  isEdit,
  noteOnly,
  busy,
}: {
  isEdit: boolean;
  noteOnly: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<AppointmentFormValues>();

  return (
    <FieldGroup>
      {!noteOnly && (
        <>
          <FieldDescription className="text-base">{t('appt.form.detailsHint')}</FieldDescription>

          <Field data-invalid={Boolean(errors.doctorName)}>
            <FieldLabel htmlFor="appt-doctor">{t('appt.form.doctor')}</FieldLabel>
            <Input
              id="appt-doctor"
              maxLength={LIMITS.doctor_name}
              aria-invalid={Boolean(errors.doctorName)}
              disabled={busy}
              {...register('doctorName')}
            />
            <FieldError errors={[errors.doctorName]} />
          </Field>

          <Field data-invalid={Boolean(errors.serialNumber)}>
            <FieldLabel htmlFor="appt-serial">{t('appt.form.serialNumber')}</FieldLabel>
            <Input
              id="appt-serial"
              inputMode="numeric"
              maxLength={LIMITS.serial_number}
              aria-invalid={Boolean(errors.serialNumber)}
              disabled={busy}
              {...register('serialNumber')}
            />
            <FieldError errors={[errors.serialNumber]} />
          </Field>
        </>
      )}

      <Field data-invalid={Boolean(errors.note)}>
        <FieldLabel htmlFor="appt-note">{t('appt.form.note')}</FieldLabel>
        <Textarea
          id="appt-note"
          maxLength={LIMITS.note}
          placeholder={t('appt.form.notePlaceholder')}
          aria-invalid={Boolean(errors.note)}
          disabled={busy}
          {...register('note')}
        />
        <FieldError errors={[errors.note]} />
      </Field>

      {isEdit && !noteOnly && (
        // Base UI 的 Checkbox 不是原生 input，register 的 onChange 對不上，
        // 所以這一欄由 Controller 接 checked / onCheckedChange
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <FieldLabel htmlFor="appt-enabled">
              <Field orientation="horizontal">
                <Checkbox
                  id="appt-enabled"
                  checked={field.value}
                  disabled={busy}
                  onCheckedChange={field.onChange}
                />
                <FieldContent>
                  <FieldTitle>{t('appt.form.enabled')}</FieldTitle>
                  <FieldDescription>{t('appt.form.enabledNote')}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          )}
        />
      )}
    </FieldGroup>
  );
}
