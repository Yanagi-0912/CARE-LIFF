import { useQuery } from '@tanstack/react-query';
import { fetchVisits, VisitsForbiddenError } from '../../../api/medicationApi';
import { queryKeys } from '@/lib/queryClient';
import type { MedicationVisit } from '../../../types/medication';

interface UseVisitsReturn {
  visits: MedicationVisit[];
  loading: boolean;
  /** 一般載入錯誤。權限不足不走這裡，見 forbidden。 */
  error: string | null;
  /**
   * 無權查看。與 error 分開是因為畫面要給的訊息完全不同：一個是「再試一次」，
   * 一個是「你沒有這項權限」——後者重試多少次都一樣。
   */
  forbidden: boolean;
  /** 載入失敗時給畫面的「重新載入」用 */
  refetch: () => Promise<unknown>;
}

/**
 * 看診紀錄資料層。
 *
 * 不重試 403：權限不足是確定的答案，重試只會多打三次同樣會失敗的請求。
 */
export function useVisits(targetUserId?: string): UseVisitsReturn {
  const query = useQuery({
    queryKey: queryKeys.medicationVisits(targetUserId),
    queryFn: () => fetchVisits(targetUserId),
    retry: (failureCount, err) =>
      !(err instanceof VisitsForbiddenError) && failureCount < 2,
  });

  const forbidden = query.error instanceof VisitsForbiddenError;

  return {
    visits: query.data ?? [],
    loading: query.isLoading,
    error: forbidden ? null : (query.error as Error | null)?.message ?? null,
    forbidden,
    refetch: query.refetch,
  };
}
