import { useTranslation } from 'react-i18next';
import { TriangleAlertIcon } from 'lucide-react';

import type { MedicationInteractionAlert } from '../../types/medication';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface InteractionAlertDialogProps {
  /** 後端這次新增回傳的相衝；null 時不顯示 */
  alert: MedicationInteractionAlert | null;
  onClose: () => void;
}

/**
 * 新增藥品後偵測到相衝時的警告視窗（藥袋提交與手動新增共用）。
 *
 * 用 AlertDialog 而不是 toast：toast 幾秒就消失，長輩來不及讀完；出血那一種
 * 還列了「出現哪些症狀要就醫」，要讓人讀完自己按掉。只有一顆「我知道了」——
 * 藥已經加進去了，這則提醒不要求任何決定。
 *
 * 內容與 LINE 推給服藥本人的卡片是同一份偵測結果，但語氣是中性的：在這裡
 * 按下新增的人可能是代長輩操作的家人。
 */
export function InteractionAlertDialog({ alert, onClose }: InteractionAlertDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={alert !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {alert && (
        // 字級開到最大時出血那一則比手機螢幕還高，視窗本身要能捲動，
        // 否則「我知道了」會被推到畫面外按不到。
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <TriangleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-bold">
              {t(`meds.interaction.title.${alert.kind}`)}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base break-words text-foreground">
              {t(`meds.interaction.summary.${alert.kind}`, {
                newDrug: alert.new_drug_name,
                existingDrug: alert.existing_drug_name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 text-left">
            {alert.ingredients.length > 0 && (
              <div className="rounded-2xl bg-muted px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {t(`meds.interaction.ingredientsLabel.${alert.kind}`)}
                </p>
                {/* 成分是英文學名，刻意不翻譯：拿去問藥師或查資料時，學名才是共通的那個詞 */}
                <p className="font-semibold break-words text-destructive">
                  {alert.ingredients.join(t('meds.scan.draft.slotListSeparator'))}
                </p>
              </div>
            )}
            <p className="text-base break-words">{t(`meds.interaction.advice.${alert.kind}`)}</p>
            {alert.kind === 'tcm' && (
              <p className="text-sm text-muted-foreground">{t('meds.interaction.source.tcm')}</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={onClose}>{t('meds.interaction.ok')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
