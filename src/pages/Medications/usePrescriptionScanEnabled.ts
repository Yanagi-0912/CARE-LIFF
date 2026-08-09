import { useQuery } from '@tanstack/react-query';
import { checkPrescriptionScanEnabled } from '../../api/medicationApi';
import { queryKeys } from '@/lib/queryClient';

/**
 * 藥袋掃描入口是否顯示，取決於後端功能開關（見 medicationApi 的探測邏輯註解）。
 * 開關狀態在同一個工作階段內視為穩定，staleTime 拉長避免每次切換頁籤
 * 都重新打一次探測請求；查詢失敗時 checkPrescriptionScanEnabled 本身
 * 已保守回傳 false，這裡不需要額外處理錯誤狀態。
 */
export function usePrescriptionScanEnabled(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.prescriptionScanEnabled,
    queryFn: checkPrescriptionScanEnabled,
    staleTime: 5 * 60_000,
  });
  return data ?? false;
}
