import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReminders,
  deleteReminder,
  fetchReminders,
  updateReminder,
} from '../../api/medicationApi';
import { queryKeys } from '@/lib/queryClient';
import type {
  CreateRemindersRequest,
  MedicationReminder,
  UpdateReminderRequest,
} from '../../types/medication';

interface UseMedicationsReturn {
  /** 依 scheduled_time 升冪排序後的提醒 */
  reminders: MedicationReminder[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** 建立提醒；成功後重新載入當前對象的列表 */
  create: (req: CreateRemindersRequest) => Promise<MedicationReminder[]>;
  /** 修改提醒；先樂觀更新畫面，失敗時回滾並拋出錯誤 */
  update: (reminderId: string, patch: UpdateReminderRequest) => Promise<void>;
  /** 刪除提醒 */
  remove: (reminderId: string) => Promise<void>;
}

function byScheduledTime(a: MedicationReminder, b: MedicationReminder): number {
  return a.scheduled_time.localeCompare(b.scheduled_time);
}

/**
 * 用藥提醒資料層 —— 唯一呼叫 medicationApi 的地方。
 * targetUserId 改變時自動重新載入。
 *
 * 原本手寫的兩個 ref 已不需要：
 * - requestIdRef（避免快速切換對象時舊回應覆蓋新資料）→ query key 含
 *   targetUserId，切換即是另一筆查詢，舊回應不會寫進新的快取。
 * - remindersRef（樂觀更新的回滾快照）→ 改用 onMutate 取得快照、
 *   onError 回滾，這正是 mutation 生命週期本來就提供的。
 */
export function useMedications(targetUserId?: string): UseMedicationsReturn {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.medications(targetUserId);

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const list = await fetchReminders(targetUserId);
      return [...list].sort(byScheduledTime);
    },
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateRemindersRequest) => createReminders(req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ reminderId, patch }: { reminderId: string; patch: UpdateReminderRequest }) =>
      updateReminder(reminderId, patch),
    // 樂觀更新：先改畫面，並回傳快照供失敗時回滾
    onMutate: async ({ reminderId, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<MedicationReminder[]>(queryKey);
      queryClient.setQueryData<MedicationReminder[]>(queryKey, (current) =>
        (current ?? [])
          .map((item) => (item.id === reminderId ? { ...item, ...patch } : item))
          .sort(byScheduledTime),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(queryKey, context.snapshot);
    },
    onSuccess: (saved, { reminderId }) => {
      queryClient.setQueryData<MedicationReminder[]>(queryKey, (current) =>
        (current ?? []).map((item) => (item.id === reminderId ? saved : item)).sort(byScheduledTime),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (reminderId: string) => deleteReminder(reminderId),
    onSuccess: (_data, reminderId) => {
      queryClient.setQueryData<MedicationReminder[]>(queryKey, (current) =>
        (current ?? []).filter((item) => item.id !== reminderId),
      );
    },
  });

  return {
    reminders: data ?? [],
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : '載入用藥提醒失敗') : null,
    refetch: async () => {
      await refetch();
    },
    create: (req) => createMutation.mutateAsync(req),
    update: (reminderId, patch) => updateMutation.mutateAsync({ reminderId, patch }).then(() => undefined),
    remove: (reminderId) => removeMutation.mutateAsync(reminderId).then(() => undefined),
  };
}
