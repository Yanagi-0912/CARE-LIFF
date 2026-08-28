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
  /** 擁有者的角色管理清單。與 familyTree 分開：那支回的是「他對我」的資料，
      這支回的是「我對他」的角色設定，兩者失效時機不同。 */
  familyMemberRoles: ['family-member-roles'] as const,
  /** 本人的健康檔案。Sidebar 與 AdminRoute 都靠它判斷管理員身分，
      共用同一個 key 才不會各抓一次。 */
  myProfile: ['my-profile'] as const,
  /** 家人的健康檔案，展開成員卡片時才會用到 */
  memberProfile: (userId: string) => ['member-profile', userId] as const,
  medications: (targetUserId?: string) => ['medications', targetUserId ?? 'self'] as const,
  /** 藥袋掃描功能開關，見 settingsApi.getPrescriptionScanEnabled */
  prescriptionScanEnabled: ['prescription-scan-enabled'] as const,
  knowledgeReports: ['knowledge-reports'] as const,
  /** 佇列篩選改由後端執行，狀態要進 key，否則換頁籤會沿用上一組分頁結果 */
  adminKnowledgeReports: (status?: string) =>
    ['admin-knowledge-reports', status ?? 'all'] as const,
  /** 某筆回報的核准前內容預覽；一筆回報只有一份，所以 key 只需要 reportId */
  knowledgeReportPreview: (reportId: string) =>
    ['knowledge-report-preview', reportId] as const,
  /** 諮詢紀錄。userId 省略＝本人；帶家人的 id 時要各自成一筆快取，
      否則切換查看對象會沿用上一個人的資料。 */
  consultationSummaries: (userId?: string) =>
    ['consultation-summaries', userId ?? 'self'] as const,
  consultationRaw: (userId?: string) => ['consultation-raw', userId ?? 'self'] as const,
  inviteVerification: (code: string) => ['invite-verification', code] as const,
};
