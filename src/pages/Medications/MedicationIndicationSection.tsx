import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import type { Medication } from '../../types/medication';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * 單一藥品的適應症區塊：藥袋讀到的那行在主要位置，食藥署仿單在次要位置且預設收合。
 *
 * 兩者刻意分開呈現、各自標示來源，SHALL NOT 合併成一個欄位——它們回答的是
 * 不同問題。仿單答「這個藥核准用於哪些適應症」（監管範疇，一張藥證常涵蓋
 * 好幾種病）；藥袋上印的通常是醫師針對這位病人挑過的那一個，也就是使用者
 * 真正想知道的「我為什麼要吃這個」。把仿單當成主要答案，等於把一個具體的
 * 回答換成一份範圍更大的清單，同時擴大病情揭露——家屬看到「癲癇症、三叉
 * 神經痛、腎原性尿崩症及雙疾性疾患」反而不知道長輩是哪一種。
 *
 * 因此仿單那段配一句提醒（`spcHint`），明講它不一定是使用者要治的那一項。
 *
 * 顯示規則（皆由後端保證資料正確，前端只負責呈現）：
 * - 證號未確定時後端兩個欄位都是 null，這裡整段不渲染，不留空白區塊。
 * - **適應症被權限遮蔽時同樣是 null**（它屬於 SENSITIVE，只有 GENERAL 讀取權
 *   的家人拿到的就是空值）。那不是錯誤，SHALL NOT 顯示成載入失敗——整段
 *   不渲染是對的行為。日後若有人想「補上」錯誤提示，會讓每一位一般家人都
 *   看到一則其實沒有出錯的紅字。
 * - `spc_indication_summary` 為 null（原文夠短不需摘要，或產不出合格摘要）
 *   時直接顯示原文，而不是不顯示——spec 的「摘要缺席時的降級」。
 * - 有摘要時顯示摘要，原文收在展開區裡供對照；摘要是便利，原文才是權威。
 */
export function MedicationIndicationSection({ medication }: { medication: Medication }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const bag = medication.indication?.trim() || '';
  const spcText = medication.spc_indication?.trim() || '';
  const spcSummary = medication.spc_indication_summary?.trim() || '';

  if (!bag && !spcText) return null;

  // 有摘要就顯示摘要（原文另行展開）；沒有摘要就把原文當成主要內容顯示，
  // 此時展開區沒有存在意義，整個收合器不渲染。
  const spcPrimary = spcSummary || spcText;
  const hasOriginalToExpand = Boolean(spcSummary) && spcText !== spcSummary;

  return (
    <div className="mt-2 flex flex-col gap-2 text-sm">
      {bag && (
        <div>
          <p className="font-medium text-muted-foreground">{t('meds.indication.bagLabel')}</p>
          <p className="break-words">{bag}</p>
        </div>
      )}

      {spcText && (
        <div className="rounded-lg bg-muted/50 p-2.5">
          <p className="font-medium text-muted-foreground">{t('meds.indication.spcLabel')}</p>
          <p className="break-words">{spcPrimary}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('meds.indication.spcHint')}</p>

          {hasOriginalToExpand && (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className="mt-1.5 inline-flex items-center gap-1 text-xs underline underline-offset-2">
                {open ? t('meds.indication.collapse') : t('meds.indication.expand')}
                {open ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="mt-1.5 break-words whitespace-pre-line text-xs text-muted-foreground">
                  {spcText}
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
