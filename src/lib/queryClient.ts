import { QueryClient } from '@tanstack/react-query';

/**
 * 全站共用的 QueryClient。
 *
 * 預設值針對本 App 的情境調整：跑在 LINE webview、使用者多為長輩、
 * 行動網路可能不穩，資料又多屬個人健康紀錄（不常變動但要正確）。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30 秒內視為新鮮，避免頁面切換來回時重複打 API
      staleTime: 30_000,
      // 行動網路容易瞬斷，重試 1 次；再多會讓長輩等太久
      retry: 1,
      // LIFF 在 webview 內切換前後景會頻繁觸發 focus，關掉避免無謂請求
      refetchOnWindowFocus: false,
    },
  },
});

/** 查詢鍵集中管理，避免各處手打字串而失效 */
export const queryKeys = {
  familyTree: ['family-tree'] as const,
  /** 本人的健康檔案。Sidebar 與 AdminRoute 都靠它判斷管理員身分，
      共用同一個 key 才不會各抓一次。 */
  myProfile: ['my-profile'] as const,
  medications: (targetUserId?: string) => ['medications', targetUserId ?? 'self'] as const,
  knowledgeReports: ['knowledge-reports'] as const,
  /** 佇列篩選改由後端執行，狀態要進 key，否則換頁籤會沿用上一組分頁結果 */
  adminKnowledgeReports: (status?: string) =>
    ['admin-knowledge-reports', status ?? 'all'] as const,
  consultationSummaries: ['consultation-summaries'] as const,
  consultationRaw: ['consultation-raw'] as const,
  inviteVerification: (code: string) => ['invite-verification', code] as const,
};
