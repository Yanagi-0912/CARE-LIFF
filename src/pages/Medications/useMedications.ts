import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createReminders,
  deleteReminder,
  fetchReminders,
  updateReminder,
} from '../../api/medicationApi';
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
 */
export function useMedications(targetUserId?: string): UseMedicationsReturn {
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 列表的同步副本。樂觀更新需要在 await 之前就取得可靠的回滾快照，
   * 而 setState 的 updater 執行時機不保證在下一個 microtask 之前。
   */
  const remindersRef = useRef<MedicationReminder[]>([]);

  const commit = useCallback((next: MedicationReminder[]) => {
    const sorted = [...next].sort(byScheduledTime);
    remindersRef.current = sorted;
    setReminders(sorted);
  }, []);

  /** 只採用最後一次請求的結果，避免快速切換對象時舊回應覆蓋新資料 */
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchReminders(targetUserId);
      if (requestId !== requestIdRef.current) return;
      commit(list);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      commit([]);
      setError(err instanceof Error ? err.message : '載入用藥提醒失敗');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [targetUserId, commit]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (req: CreateRemindersRequest) => {
      const created = await createReminders(req);
      await load();
      return created;
    },
    [load],
  );

  const update = useCallback(
    async (reminderId: string, patch: UpdateReminderRequest) => {
      const snapshot = remindersRef.current;
      commit(snapshot.map((item) => (item.id === reminderId ? { ...item, ...patch } : item)));

      try {
        const saved = await updateReminder(reminderId, patch);
        commit(remindersRef.current.map((item) => (item.id === reminderId ? saved : item)));
      } catch (err) {
        commit(snapshot);
        throw err;
      }
    },
    [commit],
  );

  const remove = useCallback(
    async (reminderId: string) => {
      await deleteReminder(reminderId);
      commit(remindersRef.current.filter((item) => item.id !== reminderId));
    },
    [commit],
  );

  return { reminders, loading, error, refetch: load, create, update, remove };
}
