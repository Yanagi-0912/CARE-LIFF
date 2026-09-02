import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedicalFacility } from '../../types/medical';
import { WEEKDAY_KEYS } from '../../types/medical';
import { formatDistance } from './searchSummary';
import {
  EMERGENCY_COLOR,
  STATUS_LABEL_KEY,
  STATUS_TONE,
  TONE_COLOR,
  shouldShowNextOpen,
} from './businessStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/**
 * 導航連結。
 *
 * 用座標而非地址字串：地址是自由文字，「臺北市中正區○○路 1 號之 3」丟進
 * Google Maps 的搜尋參數，命中的可能是路口而不是這家院所。座標是資料庫直接給的，
 * 沒有這層歧義。用 `dir/` 而非 `search/` 則是因為使用者在這一頁的下一步幾乎必然
 * 是「過去」，直接進導航省掉一次點擊。與 LINE 卡片的按鈕行為一致。
 */
function navigationUrl(facility: MedicalFacility): string {
  const destination =
    facility.latitude && facility.longitude
      ? `${facility.latitude},${facility.longitude}`
      : facility.name || facility.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}&travelmode=driving`;
}

/** 撥號連結。非數字一律去掉——資料裡的電話常帶括號與破折號，tel: 吃不了。 */
function telUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? `tel:${digits}` : '';
}

/** 圓點＋文字的一列，營業狀態與「設有急診」共用同一種樣式（比照 LINE 卡片）。 */
function DotRow({ text, color }: { text: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-bold" style={{ color }}>
        {text}
      </span>
    </div>
  );
}

/** 一週門診時間表。預設收合——七行時間在列表裡太吵，但需要的人一定要找得到。 */
function ClinicHours({ facility }: { facility: MedicalFacility }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const clinicTime = facility.clinic_time;

  if (!clinicTime) return null;
  const hasAnySlot = WEEKDAY_KEYS.some((day) => (clinicTime[day]?.slots?.length ?? 0) > 0);
  if (!hasAnySlot) return null;

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="px-0"
      >
        {open ? t('nearby.hideHours') : t('nearby.showHours')}
      </Button>
      {open && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {WEEKDAY_KEYS.map((day) => {
            const schedule = clinicTime[day];
            const slots = schedule?.isClosed ? [] : (schedule?.slots ?? []);
            return (
              <div key={day} className="contents">
                <dt className="text-muted-foreground">{t(`weekday.${day}`)}</dt>
                <dd>
                  {slots.length === 0
                    ? t('nearby.dayClosed')
                    : slots.map((slot) => `${slot.open}–${slot.close}`).join('、')}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/** 科別標籤。超過門檻先摺起來——有些醫學中心掛了三十幾個科，全展開會淹掉整張卡。 */
function DepartmentChips({ departments }: { departments: string[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 6;
  const shown = expanded ? departments : departments.slice(0, VISIBLE);
  const hiddenCount = departments.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((department) => (
        <Badge key={department} variant="outline">
          {department}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
        >
          {t('nearby.moreDepartments', { count: hiddenCount })}
        </Button>
      )}
    </div>
  );
}

export default function FacilityCard({ facility }: { facility: MedicalFacility }) {
  const { t } = useTranslation();
  const status = facility.business_status;
  const tone = STATUS_TONE[status.status] ?? 'muted';
  const color = TONE_COLOR[tone];
  const distance = formatDistance(facility.distance_meters);
  const phoneHref = facility.phone ? telUrl(facility.phone) : '';
  const departments = facility.departments?.filter(Boolean) ?? [];

  return (
    <Card size="sm" className="overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold break-words">{facility.name}</h3>
            <p className="text-muted-foreground">{facility.type}</p>
          </div>
          {distance && <Badge variant="secondary">{distance}</Badge>}
        </div>

        <div className="flex flex-col gap-1">
          <DotRow text={t(STATUS_LABEL_KEY[status.status])} color={color} />
          {status.next_open && shouldShowNextOpen(status.status) && (
            <p className="pl-5 font-semibold" style={{ color }}>
              {status.next_open.is_today
                ? t('nearby.status.nextOpenToday', { time: status.next_open.time_text })
                : t('nearby.status.nextOpenDay', {
                    day: t(`weekday.${status.next_open.weekday_key}`),
                    time: status.next_open.time_text,
                  })}
            </p>
          )}
          {/* 設有急診獨立一列：它是能力標示而非營業狀態，兩者本來就該並存——
              一家有急診的醫院門診仍可能正在午休。 */}
          {status.has_emergency && (
            <DotRow text={t('nearby.status.emergency')} color={EMERGENCY_COLOR} />
          )}
        </div>

        <p className="break-words">{facility.address}</p>

        {/* notes 是自由文字（節慶休診、需先電洽…），原樣顯示不解析：
            資料本身沒有結構，任何解析都是猜測，猜錯會給出錯誤的就醫時間。 */}
        {status.note && (
          <p className="text-muted-foreground rounded-md bg-[var(--surface-2)] p-2">
            {status.note}
          </p>
        )}

        {departments.length > 0 && (
          <>
            <Separator />
            <DepartmentChips departments={departments} />
          </>
        )}

        <ClinicHours facility={facility} />

        <div className="flex flex-wrap gap-2">
          {phoneHref && (
            <Button size="sm" variant="outline" render={<a href={phoneHref} />}>
              {t('nearby.call')}
            </Button>
          )}
          <Button
            size="sm"
            render={
              <a href={navigationUrl(facility)} target="_blank" rel="noreferrer" />
            }
          >
            {t('nearby.navigate')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
