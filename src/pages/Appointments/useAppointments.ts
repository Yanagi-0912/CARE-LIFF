import { useMemo } from 'react';
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData,
} from '@tanstack/react-query';
import {
  attendAppointment, cancelAppointment, createAppointment, deleteAppointment,
  deletePastAppointments, departAppointment, fetchAppointmentList, updateAppointment,
} from '../../api/appointmentApi';
import { queryKeys } from '@/lib/queryClient';
import type {
  AppointmentPage, AppointmentReminder, CreateAppointmentRequest, UpdateAppointmentRequest,
} from '../../types/appointment';
import { compareAppointmentAt } from '../../utils/appointmentTime';

type PastData = InfiniteData<AppointmentPage, string | null>;

/** 固定的空陣列：查詢還沒回來時每次 render 給同一個，下游的 useMemo 才不會白算 */
const NO_ITEMS: AppointmentReminder[] = [];

const EMPTY_PAST: PastData = {
  pages: [{ items: [], next_cursor: null, total_count: 0 }],
  pageParams: [null],
};

function sortByTime(list: AppointmentReminder[]): AppointmentReminder[] {
  return [...list].sort((a, b) => compareAppointmentAt(a.appointment_at, b.appointment_at));
}

/**
 * 掛號提醒資料層 —— 唯一呼叫 appointmentApi 的地方。
 *
 * 兩個查詢，分區由後端決定：
 * - 即將到來（沒有取消、當日還沒結束）：一次抓完，量本來就少。
 * - 過去（當日已結束或已取消）：一頁 20 筆，「載入更多」再拿下一頁。紀錄永久保留，
 *   一次全抓回來的話，看了幾年的長輩每次打開頁面都要等。
 *
 * 寫入 API 都回傳**完整的**單筆，留在同一區的（編輯、出發、到診）直接用回應取代
 * 快取裡那一筆；會換區的（取消）或影響總筆數的（刪除全部）重抓過去那一區。
 * 不做樂觀更新：狀態轉移的合法性只有後端說了算，先改畫面再回滾反而會閃。
 */
export function useAppointments(targetUserId?: string) {
  const queryClient = useQueryClient();
  const upcomingKey = queryKeys.appointmentsUpcoming(targetUserId);
  const pastKey = queryKeys.appointmentsPast(targetUserId);

  // 家屬可能在 LINE 卡片上替長輩按了到診，這一頁不會收到任何即時通知，
  // 後端報告明講「頁面回到前景時請重新 GET」。全站預設關掉
  // refetchOnWindowFocus（LIFF 前後景切換頻繁），這裡單獨打開；
  // staleTime 仍是全站的 30 秒，最多每 30 秒重抓一次。
  const upcomingQuery = useQuery({
    queryKey: upcomingKey,
    queryFn: async () => (await fetchAppointmentList(targetUserId, 'upcoming')).items,
    refetchOnWindowFocus: true,
  });

  const pastQuery = useInfiniteQuery({
    queryKey: pastKey,
    queryFn: ({ pageParam }) => fetchAppointmentList(targetUserId, 'past', { cursor: pageParam }),
    initialPageParam: null as string | null,
    // null＝沒有下一頁
    getNextPageParam: (last) => last.next_cursor,
    refetchOnWindowFocus: true,
  });

  const setUpcoming = (update: (list: AppointmentReminder[]) => AppointmentReminder[]) => {
    queryClient.setQueryData<AppointmentReminder[]>(upcomingKey, (current) =>
      sortByTime(update(current ?? [])),
    );
  };

  const replace = (saved: AppointmentReminder) =>
    setUpcoming((list) => list.map((item) => (item.id === saved.id ? saved : item)));

  const refetchPast = () => queryClient.invalidateQueries({ queryKey: pastKey });

  const createMutation = useMutation({
    mutationFn: (req: CreateAppointmentRequest) => createAppointment(req),
    // 新增的門診一定在未來，落在即將到來那一區
    onSuccess: (saved) => setUpcoming((list) => [...list, saved]),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAppointmentRequest }) =>
      updateAppointment(id, patch),
    onSuccess: replace,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    // 刪的可能是即將到來或過去的那一筆，兩區都拿掉；過去那一區的總筆數跟著減一
    onSuccess: (_data, id) => {
      setUpcoming((list) => list.filter((item) => item.id !== id));
      queryClient.setQueryData<PastData>(pastKey, (current) => {
        if (!current) return current;
        const found = current.pages.some((page) => page.items.some((item) => item.id === id));
        if (!found) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
            total_count: page.total_count - 1,
          })),
        };
      });
    },
  });

  const departMutation = useMutation({
    mutationFn: (id: string) => departAppointment(id),
    onSuccess: replace,
  });

  const attendMutation = useMutation({
    mutationFn: (id: string) => attendAppointment(id),
    onSuccess: replace,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    // 取消的一律歸在過去（不論門診日期）：從即將到來拿掉，過去那一區重抓，
    // 它才會照後端的排序出現在正確的位置，總筆數也跟著對。
    onSuccess: (saved) => {
      setUpcoming((list) => list.filter((item) => item.id !== saved.id));
      void refetchPast();
    },
  });

  const deleteAllPastMutation = useMutation({
    mutationFn: () => deletePastAppointments(),
    // 先清空畫面再重抓：重抓完成前不該還看得到剛刪掉的那幾十筆。重抓仍然必要——
    // 確認之後才跨過當日結束的門診會變成新的過去紀錄。
    onSuccess: () => {
      queryClient.setQueryData<PastData>(pastKey, EMPTY_PAST);
      void refetchPast();
    },
  });

  const pastPages = pastQuery.data?.pages;
  const past = useMemo(() => pastPages?.flatMap((page) => page.items) ?? [], [pastPages]);
  // 「載入更多」失敗時不能把整頁換成錯誤畫面：已經載入的紀錄還在，錯誤只以
  // 提示告知（見 loadMorePast）。只有連第一頁都沒有時才算載入失敗。
  const error = upcomingQuery.error ?? (pastQuery.data ? null : pastQuery.error);

  return {
    upcoming: upcomingQuery.data ?? NO_ITEMS,
    /** 已載入的過去紀錄，由新到舊 */
    past,
    /** 過去的第一頁（最近 20 筆）。常去的醫院只統計這些，載入更多時不跟著變 */
    recentPast: pastPages?.[0]?.items ?? NO_ITEMS,
    /** 整個「過去」的筆數，不是已載入的筆數 */
    pastTotal: pastPages?.[0]?.total_count ?? 0,
    hasMorePast: pastQuery.hasNextPage,
    loadingMorePast: pastQuery.isFetchingNextPage,
    loadMorePast: async () => {
      const result = await pastQuery.fetchNextPage();
      if (result.isFetchNextPageError) throw result.error;
    },
    loading: upcomingQuery.isPending || pastQuery.isPending,
    /** 原始錯誤物件：訊息要依語言與狀態碼決定，見 appointmentErrorMessage */
    error,
    refetch: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.appointments(targetUserId) });
    },
    create: (req: CreateAppointmentRequest) => createMutation.mutateAsync(req),
    update: (id: string, patch: UpdateAppointmentRequest) =>
      updateMutation.mutateAsync({ id, patch }),
    remove: (id: string) => removeMutation.mutateAsync(id).then(() => undefined),
    depart: (id: string) => departMutation.mutateAsync(id),
    attend: (id: string) => attendMutation.mutateAsync(id),
    cancel: (id: string) => cancelMutation.mutateAsync(id),
    /** 回傳實際刪除的筆數（可能比畫面上的多：確認前有門診剛跨過當日結束） */
    deleteAllPast: () => deleteAllPastMutation.mutateAsync().then((res) => res.deleted),
  };
}
