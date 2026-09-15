import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createMedication, fetchMedications } from '../../api/medicationApi';
import { getLineUserId } from '../../utils/auth';
import { queryKeys } from '@/lib/queryClient';
import type { Medication } from '../../types/medication';

interface UseMedicationListReturn {
  /** 該用藥者的藥品清單（含已停用者），詳細設定頁用它列出可指派飯前／飯後的藥品 */
  medications: Medication[];
  loading: boolean;
  error: string | null;
  /** 手動新增一種藥品。成功後直接把新藥品追加進快取（見下方 onSuccess 說明），
   *  不重新整份重抓——詳細設定頁的使用情境是「打字、送出、馬上在清單裡指派」，
   *  多一次來回等待對長輩來說是可感知的延遲。 */
  addMedication: (name: string) => Promise<Medication>;
}

/**
 * 詳細設定頁的藥品清單資料層——與 useMedications（提醒清單）分開快取
 * （queryKeys.medicationList vs queryKeys.medications），兩者失效時機不同：
 * 藥品清單不受提醒的時段／時間變動影響。
 */
export function useMedicationList(targetUserId?: string): UseMedicationListReturn {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.medicationList(targetUserId);

  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => fetchMedications(targetUserId),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      createMedication({ user_id: targetUserId ?? getLineUserId(), name }),
    // 直接把後端回傳的新藥品追加進現有快取，不 invalidate 整份重抓——
    // 送出的當下使用者正等著在清單裡看到它、立刻指派飯前／飯後。
    onSuccess: (created) => {
      queryClient.setQueryData<Medication[]>(queryKey, (current) => [...(current ?? []), created]);
    },
  });

  return {
    medications: data ?? [],
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : t('meds.detailed.medsLoadError')) : null,
    addMedication: (name) => addMutation.mutateAsync(name),
  };
}
