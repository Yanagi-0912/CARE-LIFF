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
  type UpdateReminderRequest,
} from '../../types/medication';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
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
  /**
   * 從清單頁的「新增」進入時為 undefined，停在第一層四張時段卡；點提醒卡片
   * 進入時帶入該筆規則的時段，直接落在那個時段的編輯面——此時返回、儲存
   * 成功、刪除成功都直接回清單，不經過第一層（使用者是從清單點進來改一筆
   * 提醒的，繞回第一層只是多一步）。
   */
  initialSlot?: MedicationSlotType;
  onBack: () => void;
  onCreate: (payload: {
    slot: MedicationSlotType;
    entries: ReminderEntry[];
    startDate: string;
    endDate?: string;
  }) => Promise<void>;
  onUpdate: (reminderId: string, patch: UpdateReminderRequest) => Promise<void>;
  onDelete: (reminderId: string) => Promise<void>;
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
  onDelete,
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

  // 從卡片直接進到某個時段時，離開編輯面就回清單；從「新增」進來則回第一層
  const leaveEditor = initialSlot ? onBack : () => setSelectedSlot(undefined);

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
        onBack={leaveEditor}
        onSave={async ({ entries, startDate, endDate }) => {
          if (reminder) {
            // 日期只送出真正變動的部分。結束日期清空要送 null 才會改回長期——
            // 後端以 exclude_unset 匯出，「沒帶這個 key」是不動原值
            // （見 UpdateReminderRequest 的說明）。
            const patch: UpdateReminderRequest = { entries };
            if (startDate !== reminder.start_date) patch.start_date = startDate;
            const nextEndDate = endDate || null;
            if (nextEndDate !== reminder.end_date) patch.end_date = nextEndDate;
            await onUpdate(reminder.id, patch);
          } else {
            await onCreate({ slot: selectedSlot, entries, startDate, endDate: endDate || undefined });
          }
          // 成功後離開編輯面，讓使用者看到更新後的摘要（decisions：不留在編輯面）
          leaveEditor();
        }}
        onDelete={
          reminder
            ? async () => {
                await onDelete(reminder.id);
                leaveEditor();
              }
            : undefined
        }
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
