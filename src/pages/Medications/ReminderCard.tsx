import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'lucide-react';

import { MEAL_LABEL_KEY, SLOT_LABEL_KEY, type MedicationReminder } from '../../types/medication';
import { formatDateDisplay } from '../../utils/date';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { SLOT_TONE } from './slotTone';
import { MedicationAppearanceRow } from './MedicationAppearanceRow';

interface ReminderCardProps {
  reminder: MedicationReminder;
  /** 切換啟用狀態（由頁面負責樂觀更新與 toast） */
  onToggle: (reminder: MedicationReminder) => void;
  onEdit: (reminder: MedicationReminder) => void;
  /** 該卡片正在送出請求時停用互動 */
  busy?: boolean;
}

export function ReminderCard({ reminder, onToggle, onEdit, busy = false }: ReminderCardProps) {
  const { t } = useTranslation();

  const slotLabel = t(SLOT_LABEL_KEY[reminder.slot_type]);
  const dateRange = reminder.end_date
    ? t('meds.dateRangeClosed', {
        start: formatDateDisplay(reminder.start_date),
        end: formatDateDisplay(reminder.end_date),
      })
    : t('meds.dateRangeOpen', { start: formatDateDisplay(reminder.start_date) });
  // 藥袋辨識建立的提醒才會關聯到藥品；手動建立的提醒沒有這個欄位，維持原本只顯示時間的樣子
  const medications = reminder.medications ?? [];
  // 條目數固定是個位數（至多飯前／飯後／其他三筆），沒有必要為這張小 map 上
  // useMemo——真正需要快取的是 SlotEntryEditor 那種每個藥品都要重算指派狀態
  // 的清單，這裡的量級不同。
  const medicationNameById = new Map(medications.map((med) => [med.id, med.name]));
  const separator = t('meds.scan.draft.slotListSeparator');
  // entries 在型別上是必填欄位，但前後端不保證同時部署——若這次前端上線時
  // 後端還沒補上這個欄位，舊回應裡不會有 entries，直接讀 .length／.some 會
  // 整卡拋錯，被 ErrorBoundary 接住後整頁空白。這裡是部署順序的安全網，
  // 不是在放寬型別承諾：一旦兩邊都上線，reminder.entries 理論上必為陣列。
  const entries = reminder.entries ?? [];
  // 多條目（飯前／飯後拆開、或條目數 > 1）才需要在卡片上多列一段服藥時機清單；
  // 單一 none 條目（多數手動建立的提醒）維持原本只有時間的樣子，不需要重複
  // 顯示一行「其他 08:00」。
  const isMultiTiming = entries.length > 1 || entries.some((entry) => entry.meal_timing !== 'none');

  return (
    // 直向兩段：上段是「時間／日期＋啟用開關」，下段是藥品清單。
    // 藥品清單刻意搬出上段的按鈕區——藥丸照片要 160px（見
    // MedicationAppearanceRow 的 size 說明），而上段那個內容欄扣掉時段色票、
    // chevron 與 84px 的開關欄之後，在 375px 的手機上只剩約 150px，照片放進去
    // 必定溢出被裁。清單改為佔滿卡片寬度，照片才有它需要的空間。
    // shadcn 的 Item 本體是 `flex w-full flex-wrap`，這裡刻意不改成 flex-col：
    // 保留 flex-wrap，讓每個直接子項都用 `w-full` 各佔一行，寬度才會真的被
    // 卡片約束住。先前用 `flex-col items-stretch` 覆寫時，換行軸與交叉軸的
    // 語意對調，子項不再被限制在卡片寬度內——最大字級下頂列自己長到 394px
    // 卻只有 348px 可用，整頁因此長出水平捲軸。
    // @container 讓下面的 @min-[17rem] 查詢以「卡片寬度相當於幾個 rem」為準。
    // 這正是需要的判準：卡片的像素寬由視口決定，而裡面每個元素的尺寸都以 rem
    // 跟著設定頁的 16／20／24px 字級縮放，所以「放不放得下」取決於兩者的比值。
    // 375px 手機上的卡片約 348px：16px 字級 ≈ 21.8rem、20px ≈ 17.4rem（都放得下
    // 一列），24px 只有 14.5rem——此時時間與日期那一欄會被壓到 35px 寬，「08:00」
    // 溢出 66px，日期變成一行一個字。低於 17rem 就改成上下堆疊。
    <Item
      variant="outline"
      className={cn('@container gap-0 p-0 transition-opacity', !reminder.enabled && 'opacity-60')}
    >
      {/* min-w-0 讓這一列能被壓縮到比內容的 min-content 更窄；少了它，flex 子項
          預設的 min-width:auto 會把最小寬度撐成「按鈕最小寬＋開關欄最小寬」。 */}
      <div className="flex w-full min-w-0 flex-col items-stretch gap-0 @min-[17rem]:flex-row @min-[17rem]:items-center">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-tl-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => onEdit(reminder)}
          aria-label={t('meds.editAria', { slot: slotLabel, time: reminder.scheduled_time })}
        >
          <ItemMedia>
            {/* 時段色票。Badge 的語意色由 SLOT_TONE 查表，四個時段各有自己的色系 */}
            <Badge
              variant="secondary"
              className={cn(
                'size-11 rounded-xl text-sm font-extrabold',
                SLOT_TONE[reminder.slot_type],
              )}
            >
              {slotLabel}
            </Badge>
          </ItemMedia>

          <ItemContent>
            <ItemTitle className="num text-2xl font-extrabold">{reminder.scheduled_time}</ItemTitle>
            {/* 解除 ItemDescription 預設的 line-clamp-2：療程起訖日期在最大字級
                （24px）下寬到會被裁掉，使用者只看得到「2026/08/01 ~ 2026/0」，
                無從得知這個提醒到哪天結束。讓它換行、卡片變高，不要截斷。
                刻意不加 break-words：那會允許在字內斷行，把日期切成
                「2026/08/」＋「01 ~」，比截斷更難讀。不加的話只在 `~` 兩側的
                空白處換行，每個日期都保持完整。 */}
            <ItemDescription className="line-clamp-none">{dateRange}</ItemDescription>
          </ItemContent>

          <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
        </button>

        {/* 一列時是左右分隔的直線，堆疊時要變成上下分隔的橫線。同一顆
            Separator 切換 orientation 會連帶換掉 aria 語意與尺寸類別，
            所以用兩顆，各自只在對應的斷點顯示。 */}
        <Separator className="w-full @min-[17rem]:hidden" />
        <Separator orientation="vertical" className="hidden self-stretch @min-[17rem]:block" />

        {/* 整塊區域是點擊區，內含開關與狀態文字。
            Switch 本身負責軌道／滑鈕與 role="switch"＋aria-checked；
            外層 label 讓點擊文字也能切換，不需要額外的 button 包裝。

            一列時固定 5.25rem 寬、開關在文字上方（預設字級下即原本的 84px，
            版面不變）；堆疊時佔滿整列、開關與文字並排。寬度用 rem 而不是原本
            寫死的 84px：這一欄的內容會跟著字級放大，欄寬固定在 84px 時，
            最大字級下「已啟用」的 min-content 是 95px，會撐破欄位。 */}
        <label className="flex w-full shrink-0 cursor-pointer flex-row items-center justify-center gap-2.5 self-stretch px-2 py-3 has-disabled:cursor-progress has-disabled:opacity-60 @min-[17rem]:w-[5.25rem] @min-[17rem]:flex-col @min-[17rem]:gap-1.5">
          <Switch
            checked={reminder.enabled}
            disabled={busy}
            onCheckedChange={() => onToggle(reminder)}
            aria-label={t('meds.toggleAria', { slot: slotLabel })}
          />
          <span className="text-xs font-semibold text-muted-foreground">
            {reminder.enabled ? t('meds.statusOn') : t('meds.statusOff')}
          </span>
        </label>
      </div>

      {/* 飯前飯後拆成多個時刻的規則，卡片標題只能顯示最早那個時刻
          （scheduled_time 是派生欄位），這裡把每個條目各自的時機、時刻、
          藥名攤開列出，使用者才看得出「這張卡其實是兩個時間點」。 */}
      {isMultiTiming && (
        <>
          <Separator className="w-full" />
          <ItemGroup className="w-full min-w-0 px-4 py-3.5" aria-label={t('meds.card.entriesLabel')}>
            {entries.map((entry) => {
              const names = entry.medication_ids
                .map((id) => medicationNameById.get(id))
                .filter((name): name is string => Boolean(name))
                .join(separator);
              return (
                <Item key={entry.meal_timing} size="xs" role="listitem" className="p-0">
                  <Badge variant="secondary">{t(MEAL_LABEL_KEY[entry.meal_timing])}</Badge>
                  {/* ItemContent 提供 min-w-0，讓這個 flex 子項能被壓縮到比內容的
                      min-content 更窄——沒有它，一串不能斷行的英文藥名（例如
                      CHLORPHENIRAMINE MALEATE）會把 flex 子項的最小寬度撐成
                      整串字的寬度，在 24px 字級的 375px 手機上把卡片一起撐寬，
                      與 MedicationAppearanceRow 的既有作法一致。 */}
                  <ItemContent className="min-w-0 flex-row flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="num text-sm font-semibold">{entry.scheduled_time}</span>
                    {/* break-words 讓一般的空白／標點處優先斷行；單一長字仍斷不開時
                        由 [overflow-wrap:anywhere] 兜底，允許在字內斷行——寧可切開
                        一個英文藥名，也不要讓卡片長出水平捲軸。 */}
                    {names && (
                      <span className="min-w-0 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {names}
                      </span>
                    )}
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        </>
      )}

      {/* 藥袋辨識建立的提醒才會關聯到藥品；手動建立的提醒沒有這個欄位，
          整個下段不渲染，版面與只顯示時間的樣子完全相同。 */}
      {medications.length > 0 && (
        <>
          <Separator className="w-full" />
          {/* ItemGroup 依子項的 data-size=xs 自己收斂間距
              （has-data-[size=xs]:gap-2），不需要也不該在這裡另外指定 gap。 */}
          <ItemGroup className="w-full min-w-0 px-4 py-3.5">
            {medications.map((med) => (
              <MedicationAppearanceRow key={med.id} medication={med} />
            ))}
          </ItemGroup>
        </>
      )}
    </Item>
  );
}
