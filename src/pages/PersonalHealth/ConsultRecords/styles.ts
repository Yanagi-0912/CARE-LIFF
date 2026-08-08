/* ═══════════════════════════════════════════════════════
   健康諮詢紀錄頁的樣式常數（原 index.css 遷移）。

   注意：手機模擬器（panel）與其內容刻意使用寫死的色碼 ——
   它是畫面裡的一台「裝置」，不隨深色／高對比主題變化，
   原檔即如此設計，遷移時如實保留 hex 值。

   響應式沿用原檔的 600px／420px 斷點，以 max-[...]: 1:1 對映。
   ═══════════════════════════════════════════════════════ */

export const PAGE =
  'relative mx-auto flex min-h-screen w-full max-w-[800px] flex-col overflow-x-hidden px-4 py-8 text-foreground max-[600px]:p-2.5';
export const HEADER = 'relative z-[1] mb-4';
export const HEADER_H2 =
  'mx-0 mt-0 mb-2 text-[1.6rem] font-extrabold text-ink max-[600px]:text-[1.4rem]';
export const HEADER_P = 'm-0 text-muted-foreground';
export const CARD =
  'animate-rise relative z-[1] flex flex-col items-center gap-3.5 max-[600px]:w-full max-[600px]:gap-2';

/* ── 手機螢幕本體（after 為右上角綠色光暈）── */
export const PANEL =
  'relative flex aspect-[9/19.5] min-h-[420px] w-[clamp(260px,70vw,380px)] flex-col justify-start overflow-hidden rounded-[22px] bg-[#101a17] p-4 pb-[18px] text-[#e2e8f0] shadow-[inset_0_0_0_1px_rgba(226,232,240,0.1),var(--shadow-2)] after:pointer-events-none after:absolute after:-top-10 after:-right-[30px] after:size-[120px] after:rounded-full after:bg-[radial-gradient(circle,rgba(62,207,188,0.22),transparent_70%)] after:content-[""] max-[600px]:box-border max-[600px]:min-h-[380px] max-[600px]:w-[calc(100%-48px)] max-[600px]:max-w-[570px] max-[420px]:min-h-[360px] max-[420px]:w-[min(90vw,320px)]';
export const PANEL_TOP =
  'relative z-[1] mb-2.5 flex items-center justify-between gap-3 max-[600px]:mb-1.5';
export const PANEL_TIME =
  'num min-w-[52px] text-[15px] font-semibold tracking-[0.06em] text-[#e2e8f0] max-[600px]:min-w-12 max-[600px]:text-[11px] max-[420px]:text-[10px] max-[420px]:tracking-[0.04em]';
export const PANEL_NOTCH = 'flex flex-1 items-center justify-center gap-2 max-[420px]:gap-1.5';
export const PANEL_DOT = 'size-2 rounded-full bg-[#94a3b8]';
export const PANEL_SPEAKER = 'h-1.5 w-[60px] rounded-full bg-[#475569]';
export const PANEL_STATUS = 'inline-flex items-center gap-1.5 text-[#e2e8f0]';
export const ICON_PHONE = 'size-6 opacity-90 max-[600px]:size-4';
export const PANEL_CONTROLS = 'mt-2.5 mb-2.5 flex items-center justify-between gap-2.5';
export const PANEL_LIST =
  'relative z-[1] grid flex-1 gap-2.5 overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:box-border [&>*]:w-full [&>*]:min-w-0 [&>*]:[overflow-wrap:anywhere] max-[600px]:px-0';

/* ── 清單項目 ── */
export const ITEM =
  'flex w-full min-w-0 items-start gap-2.5 rounded-[10px] bg-[#f9fafb] p-3 text-[#111827] [&_p]:m-0 [&_p]:text-xl [&_p]:font-medium [&_p]:leading-normal [&_p]:text-[#111827]';
export const ITEM_MUTED = 'bg-[rgba(148,163,184,0.16)]';
export const ITEM_EMPTY =
  'border border-dashed border-[rgba(226,232,240,0.2)] bg-[rgba(148,163,184,0.08)] [&_p]:text-[28px] [&_p]:leading-[1.4] [&_p]:text-white';
export const COMPACT = 'flex-col gap-2 rounded-xl p-2';
export const COMPACT_HEADER = 'box-border flex w-full items-center justify-between gap-3';

/* ── 摘要選擇與內容 ── */
export const SUMMARY_LABEL =
  'mb-2 block whitespace-nowrap text-[14px] font-semibold text-[#475569] max-[600px]:text-[13px] max-[420px]:text-[4.5vw]';
export const SUMMARY_SELECT =
  'ml-auto w-[45%] min-w-[120px] cursor-pointer rounded-lg border border-[rgba(226,232,240,0.8)] bg-white px-3 py-1.5 text-[14px] font-medium text-[#111827] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[rgba(37,99,235,0.5)] focus:border-[rgba(37,99,235,0.85)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] max-[600px]:w-1/2 max-[600px]:min-w-[100px] max-[600px]:px-2 max-[600px]:py-[5px] max-[600px]:text-[13px] max-[420px]:min-w-[84px] max-[420px]:text-[12px]';
export const VIEWER = 'grid gap-2.5 pt-1 pb-[2px] text-[#111827]';
export const SUMMARY_TITLE =
  'rounded-[14px] border border-[rgba(37,99,235,0.10)] bg-[linear-gradient(135deg,rgba(37,99,235,0.10),rgba(255,255,255,0.96))] px-3 py-2.5 text-2xl font-extrabold tracking-[0.02em] text-[#0f172a] max-[600px]:px-2.5 max-[600px]:py-[9px] max-[600px]:text-[16px] max-[420px]:text-[15px]';
export const SECTION =
  'rounded-[14px] border border-[#e2e8f0] bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] max-[600px]:px-2.5 max-[600px]:py-[9px]';
export const SECTION_TITLE =
  'mb-2.5 inline-flex w-fit items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-[5px] text-[16px] font-extrabold tracking-[0.02em] text-[#1d4ed8] max-[600px]:mb-2 max-[600px]:px-[9px] max-[600px]:py-1 max-[600px]:text-[15px] max-[420px]:px-2 max-[420px]:text-[14px]';
export const SECTION_BODY =
  'text-[14px] leading-[1.7] text-[#1f2937] max-[420px]:text-[13px] [&_ul]:m-0 [&_ul]:pl-[18px] [&_li]:mb-1 [&_li]:leading-[1.6]';
export const SUMMARY_EMPTY =
  'rounded-xl bg-[#f8fafc] p-3 text-center text-[14px] text-[#64748b]';

/* ReactMarkdown 產出的 HTML 無法逐一掛 class，以後代選擇器變體表達 */
export const MARKDOWN =
  '[&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-2 [&_p]:leading-[1.6] [&_strong]:font-semibold [&_strong]:text-[#1e3a8a] [&_ul]:mt-1 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:text-lg [&_li]:mb-1 [&_li]:leading-normal [&_li]:text-[#374151]';

/* ── 徽章與聊天氣泡 ── */
export const BADGE =
  'mb-1.5 inline-block rounded-full bg-[#7ce6d6] px-2 py-[2px] text-[11px] font-bold tracking-[0.08em] text-[#0f2b26] uppercase';
export const BADGE_ERROR = 'bg-white text-xl font-bold text-[#991b1b]';
export const USER_BADGE = 'rounded-md bg-[#2563eb] px-2 py-1 text-base font-semibold text-white';
export const AI_BADGE = 'rounded-md bg-[#374151] px-2 py-1 text-base font-semibold text-white';
export const CHAT_ROW = 'mb-3 flex cursor-pointer items-start gap-2.5';
export const CHAT_ROW_USER = 'flex-row-reverse';
export const USER_BUBBLE =
  'max-w-[75%] rounded-[12px_2px_12px_12px] bg-[#dbeafe] px-3.5 py-2.5 leading-normal text-[#1e40af] shadow-[0_1px_2px_rgba(0,0,0,0.05)]';
export const AI_BUBBLE =
  'max-w-[75%] rounded-[2px_12px_12px_12px] bg-[#f3f4f6] px-3.5 py-2.5 leading-normal text-[#1f2937] shadow-[0_1px_2px_rgba(0,0,0,0.05)]';

/* ── 按鈕 ── */
export const BTN =
  'cursor-pointer rounded-full border-0 px-[18px] py-2.5 font-bold transition-[transform,box-shadow,background-color] duration-140 disabled:cursor-not-allowed disabled:opacity-65 disabled:shadow-none';
export const BTN_GHOST =
  'border-[1.5px] border-primary bg-surface text-[var(--primary-strong)] hover:bg-[var(--primary-softer)]';

/* 檢視模式切換鈕。手機版的檔案／對話圖示原為 ::after 的 data-URI 背景圖，
   遷移後改為 JSX 內的 inline SVG（TAB_ICON），桌機隱藏、手機顯示。 */
export const TAB =
  'cursor-pointer bg-[#eef2f7] text-[#334155] max-[600px]:relative max-[600px]:inline-flex max-[600px]:h-7 max-[600px]:items-center max-[600px]:justify-center max-[600px]:overflow-hidden max-[600px]:rounded-[10px] max-[600px]:border-0 max-[600px]:pl-3 max-[600px]:pr-[34px] max-[600px]:text-[13px] max-[600px]:leading-none max-[600px]:text-[#374151]';
export const TAB_ACTIVE = 'bg-[#2563eb] text-white max-[600px]:text-white';
export const TAB_ICON =
  'pointer-events-none absolute top-1/2 right-3 hidden size-[18px] -translate-y-1/2 max-[600px]:block';

export const FORM_ACTIONS = 'mt-2 flex flex-wrap gap-2.5';

/* ── Toast（硬色碼，不隨主題）── */
export const TOAST =
  'animate-in fade-in fixed top-4 left-1/2 z-[100] w-1/2 max-w-[520px] -translate-x-1/2 rounded-xl px-4 py-3 text-center font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.12)]';
export const TOAST_SUCCESS = 'border border-[#b7e6c7] bg-[#ecfdf3] text-[#166534]';
export const TOAST_ERROR = 'border border-[#fecaca] bg-[#fef2f2] text-[#991b1b]';

/* ── Modal ── */
export const MODAL_OVERLAY =
  'fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-5 backdrop-blur-[2px]';
export const MODAL =
  'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 relative max-h-[80vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-white px-6 pt-7 pb-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)] duration-200';
export const MODAL_CLOSE =
  'absolute top-3.5 right-3.5 flex size-[30px] cursor-pointer items-center justify-center rounded-full border-0 bg-[#f1f3f5] text-lg leading-none text-[#4b5563] transition-colors duration-150 hover:bg-[#e9ecef] hover:text-[#333]';
export const MODAL_HEADER = 'mb-[18px] flex items-center gap-3 border-b-[5px] border-[#f0f0f0] pb-4';
export const MODAL_AVATAR =
  'flex size-[50px] shrink-0 items-center justify-center rounded-full text-[2em] font-bold text-white shadow-[0_4px_10px_rgba(0,0,0,0.15)]';
export const AVATAR_USER = 'bg-[linear-gradient(135deg,#4f8ef7,#2563eb)]';
export const AVATAR_AI = 'bg-[linear-gradient(135deg,#34d399,#059669)]';
export const MODAL_TITLE = 'm-0 text-[2em] font-bold text-[#1f2937]';
export const MODAL_BODY =
  'text-[1em] leading-[1.7] text-[#374151] [overflow-wrap:anywhere] [&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_strong]:text-[#111827] [&_ul]:my-2 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:pl-5';
