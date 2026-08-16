import { useQuery } from '@tanstack/react-query';
import { fetchConsultationRaw, getAllSummaries } from '../../../api/consultationApi';
import { queryKeys } from '@/lib/queryClient';
import type { ConsultationMessage, ConsultationSummary } from '../../../types/consultation';

interface UseConsultRecordsReturn {
  summaries: ConsultationSummary[];
  summariesPending: boolean;
  /** 原始錯誤物件；轉成文案要用 i18n，故留給頁面處理 */
  summariesError: unknown;
  rawMessages: ConsultationMessage[];
  rawPending: boolean;
}

/*
用useQuery去抓取諮詢紀錄的摘要和原始訊息有快取的效果，避免多次呼叫api。
 */
export function useConsultRecords(targetUserId?: string): UseConsultRecordsReturn {
  const summariesQuery = useQuery({
    queryKey: queryKeys.consultationSummaries(targetUserId),
    queryFn: () => getAllSummaries(targetUserId),
  });

  const rawQuery = useQuery({
    queryKey: queryKeys.consultationRaw(targetUserId),
    queryFn: () => fetchConsultationRaw(targetUserId),
  });

  return {
    summaries: summariesQuery.data ?? [],
    summariesPending: summariesQuery.isPending,
    summariesError: summariesQuery.error,
    rawMessages: rawQuery.data?.messages ?? [],
    rawPending: rawQuery.isPending,
  };
}
