import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react';

import {
  MEAL_LABEL_KEY,
  SLOT_LABEL_KEY,
  SLOT_TYPES,
  type MedicationReminder,
  type MedicationSlotType,
  type ReminderEntry,
} from '../../types/medication';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { todayLocalDateString } from '../../utils/date';
import { SLOT_TONE } from './slotTone';
import { SlotEntryEditor } from './SlotEntryEditor';
import { useMedicationList } from './useMedicationList';

interface DetailedSetupViewProps {
  targetUserId?: string;
  targetName: string;
  reminders: MedicationReminder[];
  /** 提醒清單（reminders）是否仍在載入——第一層四張時段卡靠它才有正確的
   *  摘要（entries／medication_ids），載入中不能先渲染成「尚未設定」。 */
  remindersLoading: boolean;
  /** 提醒清單載入失敗的訊息；非 null 時第一層改顯示錯誤，不呈現時段卡
   *  （那會讓使用者以為四個時段真的都還沒設定，點進去才發現是空的）。 */
  remindersError: string | null;
  /** 從新增表單的「詳細設定」進入時為 undefined；Task 11 起編輯視窗會帶入該筆規則的時段 */
  initialSlot?: MedicationSlotType;
  onBack: () => void;
  onCreate: (slot: MedicationSlotType, entries: ReminderEntry[], startDate: string) => Promise<void>;
  onUpdate: (reminderId: string, entries: ReminderEntry[]) => Promise<void>;
}

/**
 * 詳細設定的整頁檢視（design.md 決策 8：同一頁內切換，不另開路由）。
 *
 * 第一層四張時段卡，點進去是該時段的編輯面（SlotEntryEditor）。藥品清單由
 * 這裡統一透過 useMedicationList 讀取／新增，往下傳給編輯面——四個時段
 * 共用同一份藥品清單與同一份新增藥品的動作，不必每個時段各自重打一次
 * GET /medications。
 */
export function DetailedSetupView({
  targetUserId,
  targetName,
  reminders,
  remindersLoading,
  remindersError,
  initialSlot,
  onBack,
  onCreate,
  onUpdate,
}: DetailedSetupViewProps) {
  const { t } = useTranslation();
  const [selectedSlot, setSelectedSlot] = useState<MedicationSlotType | undefined>(initialSlot);

  const {
    medications,
    loading: medicationsLoading,
    error: medicationsError,
    addMedication,
  } = useMedicationList(targetUserId);

  const reminderBySlot = useMemo(() => {
    const map = new Map<MedicationSlotType, MedicationReminder>();
    reminders.forEach((reminder) => map.set(reminder.slot_type, reminder));
    return map;
  }, [reminders]);

  if (selectedSlot) {
    const reminder = reminderBySlot.get(selectedSlot);
    return (
      <SlotEntryEditor
        key={selectedSlot}
        slot={selectedSlot}
        reminder={reminder}
        medications={medications}
        medicationsLoading={medicationsLoading}
        // 不直接把 medicationsError 的原始訊息（可能是英文的 API 例外訊息）往下傳——
        // 一律換成固定的中文引導文案，行為與呈現都由這裡集中決定。
        medicationsError={medicationsError ? t('meds.detailed.medsLoadError') : null}
        onAddMedication={addMedication}
        onBack={() => setSelectedSlot(undefined)}
        onSave={async (entries) => {
          if (reminder) {
            await onUpdate(reminder.id, entries);
          } else {
            await onCreate(selectedSlot, entries, todayLocalDateString());
          }
          // 成功後回到第一層，讓使用者看到更新後的摘要（decisions：不留在編輯面）
          setSelectedSlot(undefined);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" className="w-fit" onClick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        {t('meds.detailed.back')}
      </Button>

      <div>
        <h1 className="text-2xl font-extrabold">{t('meds.detailed.title')}</h1>
        <p className="text-base text-muted-foreground">{targetName}</p>
      </div>

      {remindersLoading ? (
        // 骨架屏與 index.tsx 的清單骨架同一組 Item 元件，四張卡對齊第一層
        // 真正渲染出來的時段卡數量——載入中不能先把摘要顯示成「尚未設定」，
        // 那看起來像是這個人真的什麼都沒設定過。
        <ItemGroup className="gap-3" aria-busy="true" aria-label={t('meds.loading')}>
          {SLOT_TYPES.map((slot) => (
            <Item key={slot} variant="outline">
              <ItemMedia>
                <Skeleton className="size-11 rounded-xl" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-40" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : remindersError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{t('meds.loadError')}</AlertDescription>
        </Alert>
      ) : (
        <ItemGroup className="gap-3" aria-label={t('meds.detailed.title')}>
          {SLOT_TYPES.map((slot) => {
            const reminder = reminderBySlot.get(slot);
            const entries = reminder?.entries ?? [];
            const slotLabel = t(SLOT_LABEL_KEY[slot]);

            return (
              <Item key={slot} variant="outline" className="gap-0 p-0">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => setSelectedSlot(slot)}
                >
                  <ItemMedia>
                    <Badge
                      variant="secondary"
                      className={cn('size-11 rounded-xl text-sm font-extrabold', SLOT_TONE[slot])}
                    >
                      {slotLabel}
                    </Badge>
                  </ItemMedia>

                  <ItemContent>
                    <ItemTitle className="text-lg font-semibold">{slotLabel}</ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {entries.length === 0
                        ? t('meds.detailed.slotSummaryEmpty')
                        : entries.map((entry) => (
                            <span key={entry.meal_timing} className="block">
                              {t('meds.detailed.entrySummary', {
                                meal: t(MEAL_LABEL_KEY[entry.meal_timing]),
                                time: entry.scheduled_time,
                                count: entry.medication_ids.length,
                              })}
                            </span>
                          ))}
                    </ItemDescription>
                  </ItemContent>

                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </button>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}
