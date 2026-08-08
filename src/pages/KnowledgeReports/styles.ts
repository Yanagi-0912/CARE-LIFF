import { cn } from '@/lib/utils';
import type { KnowledgeReportStatus } from '../../api/knowledgeReportsApi';

/* ═══════════════════════════════════════════════════════
   KnowledgeReports 與 AdminKnowledgeReports 的共用樣式。

   原本是一份被兩頁同時 import 的 index.css（795 行）；遷移後改為
   常數模組，讓「兩頁共用」這件事在 import 關係上仍然可見。

   響應式沿用原檔的 max-width 斷點（900px／600px），以 max-[900px]:
   與 max-[600px]: 變體 1:1 對映，不反轉成 mobile-first ——
   機械式對映比較不會在搬運中出錯，之後要收斂斷點再一次處理。
   ═══════════════════════════════════════════════════════ */

export const PAGE =
  'mx-auto w-[min(1180px,100%)] px-4 pt-4 pb-[calc(var(--bottom-h)+24px)] max-[600px]:px-3 max-[600px]:pt-3 max-[600px]:pb-[calc(var(--bottom-h)+16px)]';

/* ── 頂部提示卡 ── */
export const NOTICE_CARD =
  'animate-card-in mb-4 overflow-hidden rounded-lg border border-hair bg-surface shadow-card';
export const NOTICE =
  'flex w-full items-center gap-3 bg-[var(--primary-softer)] px-4 py-3 max-[600px]:flex-wrap max-[600px]:items-start';
export const NOTICE_ICON =
  'inline-grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary text-[0.88rem] font-extrabold text-[var(--primary-strong)]';
export const NOTICE_TEXT =
  'm-0 flex-1 text-[0.92rem] font-[650] text-foreground max-[600px]:self-center max-[600px]:text-[0.84rem]';

/* 膠囊按鈕基底（提示卡按鈕與主行動鈕共用） */
const PILL_BTN =
  'inline-flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-[18px] font-[750]';
export const NOTICE_BTN = cn(
  PILL_BTN,
  'border border-hair bg-surface text-[var(--primary-strong)] shadow-card transition-[transform,border-color] duration-140 hover:-translate-y-px hover:border-primary max-[600px]:w-full',
);
export const PRIMARY_BTN = cn(
  PILL_BTN,
  'col-span-full w-full bg-ink text-white shadow-pop transition-[transform,box-shadow] duration-140 hover:-translate-y-[2px] hover:shadow-modal',
);

/* ── Hero 雙欄 ── */
export const HERO =
  'mb-4 grid grid-cols-[minmax(300px,0.78fr)_minmax(420px,1.22fr)] gap-4 max-[900px]:grid-cols-1';
export const HERO_CARD =
  'animate-card-in min-h-[280px] overflow-hidden rounded-xl border border-hair bg-surface shadow-card';
export const SUMMARY =
  'grid min-h-[280px] w-full grid-cols-[auto_1fr] content-center gap-4 bg-surface p-6 max-[900px]:min-h-[240px] max-[600px]:grid-cols-[62px_1fr] max-[600px]:p-4';
export const AVATAR =
  'grid size-[76px] place-items-center rounded-full border-[3px] border-surface bg-[linear-gradient(145deg,var(--primary),var(--primary-2))] text-[1.55rem] font-[850] text-white shadow-[0_10px_24px_-10px_rgba(14,147,132,0.6)] max-[600px]:size-[62px] max-[600px]:text-[1.25rem]';
export const EYEBROW =
  'inline-flex items-center gap-2 rounded-full bg-[var(--primary-softer)] px-2.5 py-1.5 text-[0.78rem] font-[750] tracking-[0.02em] text-[var(--primary-strong)]';
export const SUMMARY_H1 =
  'mt-2 text-[clamp(1.45rem,2.5vw,2rem)] leading-[1.18] text-ink max-[600px]:text-[1.35rem]';

/* ── 統計列 ──
   knowledgeStats 保留為測試定位點（兩頁的測試都以
   .knowledgeStats strong 選取統計數字），無樣式作用。 */
export const STATS = 'knowledgeStats col-span-full grid grid-cols-3 py-3';
export const STATS_ITEM = 'flex flex-col items-center gap-[2px] border-r border-hair last:border-r-0';
export const STATS_NUM = 'text-[1.55rem] leading-none text-[var(--primary-strong)]';
export const STATS_LABEL = 'text-[0.78rem] font-[650] text-muted-foreground';

/* ── 精選卡（右欄）── */
export const FEATURED =
  'relative flex min-h-[280px] w-full items-center overflow-hidden bg-[var(--primary-softer)] p-[clamp(24px,5vw,52px)] max-[900px]:min-h-[240px] max-[600px]:min-h-[255px] max-[600px]:p-6';
export const FEATURED_CONTENT = 'relative z-[2] max-w-[68%] max-[600px]:max-w-[75%]';
export const FEATURED_EYEBROW = cn(
  EYEBROW,
  'bg-transparent pl-0 after:size-1.5 after:rounded-full after:bg-primary after:content-[""]',
);
export const FEATURED_H2 =
  'mt-3 mb-4 text-[clamp(1.45rem,2.9vw,2.15rem)] leading-[1.25] text-ink max-[600px]:text-[1.45rem]';
export const FEATURED_TIME = 'mt-4 block text-[0.82rem] font-semibold text-muted-foreground';

/* 醫療十字裝飾牌：紙卡＋兩條淡綠橫線（before）＋頂部提把（after），微轉 6 度 */
export const MEDICAL_MARK =
  'absolute right-[7%] bottom-[11%] z-[1] grid h-[146px] w-[120px] rotate-6 place-items-center rounded-[26px] border-8 border-white/82 bg-white/58 text-primary shadow-[0_20px_40px_-20px_rgba(20,80,76,0.45)] before:absolute before:right-6 before:bottom-9 before:left-6 before:h-1.5 before:rounded-full before:bg-[rgba(14,147,132,0.24)] before:shadow-[0_18px_0_rgba(14,147,132,0.18)] before:content-[""] after:absolute after:top-[-17px] after:right-[35px] after:left-[35px] after:h-[22px] after:rounded-full after:bg-primary after:content-[""] max-[600px]:right-[-20px] max-[600px]:bottom-[10px] max-[600px]:h-[126px] max-[600px]:w-[100px] max-[600px]:opacity-78';
export const MEDICAL_MARK_PLUS =
  'grid size-[42px] place-items-center rounded-full bg-primary text-[1.8rem] font-bold text-white';
export const GLOW_ONE = 'absolute top-[-100px] right-[-30px] size-[260px] rounded-full bg-white/28';
export const GLOW_TWO = 'absolute right-[165px] bottom-[-70px] size-[150px] rounded-full bg-white/28';

/* ── 清單區 ── */
export const LIST_SECTION = 'animate-card-in [animation-delay:120ms]';
export const LIST_HEADER =
  'mb-2 flex items-center justify-between gap-4 border-b border-hair py-2 max-[600px]:flex-col max-[600px]:items-stretch';
export const TABS =
  'flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const TAB_BTN =
  'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-transparent px-3.5 py-2 text-[0.86rem] font-bold text-muted-foreground hover:bg-surface-2 [&>span]:text-[var(--primary-strong)]';
/* 選中態。ToggleGroupItem 會設 aria-pressed，故以變體表達；
   一併覆寫 hover 底色，避免未選中樣式的 hover:bg-surface-2 蓋掉選中色。 */
export const TAB_ACTIVE_VARIANT =
  'aria-pressed:border-[rgba(14,147,132,0.25)] aria-pressed:bg-[var(--primary-softer)] aria-pressed:text-[var(--primary-strong)] aria-pressed:hover:bg-[var(--primary-softer)]';
export const SORT_SELECT =
  'min-w-[122px] rounded-md border border-hair bg-surface px-3 py-[9px] text-[0.84rem] text-foreground max-[600px]:self-end';

/* ── 回報卡片 ── */
export const REPORT_LIST = 'flex flex-col gap-3 pt-2';
export const REPORT_CARD =
  'group grid w-full cursor-pointer grid-cols-[auto_minmax(220px,1.25fr)_minmax(210px,1fr)_auto_auto] items-center gap-4 rounded-lg border border-hair bg-surface px-4 py-3.5 text-left text-inherit shadow-card transition-[transform,border-color,box-shadow] duration-220 hover:-translate-y-[2px] hover:border-line hover:shadow-pop max-[900px]:grid-cols-[auto_1fr_auto] max-[600px]:grid-cols-[auto_minmax(0,1fr)] max-[600px]:gap-3 max-[600px]:p-3';

/* 狀態 → 語意色（icon 底、reason 標籤共用；rejected 原檔未定義、沿用預設的 warning） */
export const STATUS_TONE_SOFT: Record<KnowledgeReportStatus, string> = {
  pending: 'text-warning bg-warning-soft',
  reviewing: 'text-[var(--violet)] bg-[var(--violet-soft)]',
  resolved: 'text-success bg-success-soft',
  rejected: 'text-warning bg-warning-soft',
};

export const REPORT_ICON = 'grid size-[42px] place-items-center rounded-md text-[1.15rem] font-[850]';
export const REPORT_QUESTION = 'flex min-w-0 flex-col';
export const REPORT_QUESTION_STRONG =
  'overflow-hidden text-ellipsis whitespace-nowrap text-[0.96rem] text-ink max-[600px]:whitespace-normal';
export const REPORT_META =
  'mt-[5px] flex items-center gap-2 max-[600px]:flex-col max-[600px]:items-start';
export const META_MUTED = 'text-[0.73rem] text-faint';
export const REASON_TAG = 'rounded-full px-[7px] py-[3px] text-[0.68rem] font-[750]';
export const REPORT_REVIEW =
  'flex min-w-0 flex-col border-l border-hair pl-4 max-[900px]:col-[2/-1] max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:pt-2 max-[900px]:pl-0 max-[600px]:col-[1/-1]';
export const REPORT_REVIEW_TEXT =
  'mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.79rem] leading-[1.4] text-muted-foreground max-[600px]:whitespace-normal';

/* 狀態 badge（含 rejected 的 danger 配色） */
export const STATUS_BADGE =
  'inline-flex w-max items-center justify-center gap-1.5 rounded-full px-[11px] py-[7px] text-[0.75rem] font-[750] whitespace-nowrap';
export const STATUS_BADGE_TONE: Record<KnowledgeReportStatus, string> = {
  pending: 'text-warning bg-warning-soft',
  reviewing: 'text-[var(--violet)] bg-[var(--violet-soft)]',
  resolved: 'text-success bg-success-soft',
  rejected: 'text-destructive bg-destructive-soft',
};
/* 卡片內 badge 在窄版的網格落點 */
export const CARD_STATUS_POS =
  'max-[900px]:col-start-3 max-[900px]:row-start-1 max-[600px]:col-start-2 max-[600px]:row-start-auto max-[600px]:justify-self-start';
export const CHEVRON =
  'text-[1.6rem] text-faint transition-transform duration-140 group-hover:translate-x-[3px] max-[900px]:hidden';

/* ── 空狀態 ── */
export const EMPTY =
  'mt-4 grid justify-items-center rounded-xl border border-dashed border-line px-4 py-12 text-center';
export const EMPTY_ICON =
  'grid size-12 place-items-center rounded-full bg-success-soft text-[1.3rem] text-success';
export const EMPTY_H3 = 'mt-3 mb-1 text-ink';
export const EMPTY_P = 'm-0 text-muted-foreground';

/* ── 詳情對話框 ── */
export const DIALOG =
  'relative max-h-[calc(100vh-48px)] w-[min(560px,100%)] overflow-y-auto rounded-xl border border-hair bg-surface p-8 shadow-modal max-[600px]:p-6';
export const DIALOG_CLOSE =
  'absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-surface-2 text-[1.4rem] text-muted-foreground';
export const DIALOG_ID = 'mt-4 mb-1 text-[0.74rem] font-bold text-faint';
export const DIALOG_H2 = 'm-0 pr-8 text-2xl leading-[1.35] text-ink';
export const DIALOG_DL = 'mt-6 mb-0 grid gap-3';
export const DIALOG_ITEM = 'rounded-md bg-surface-2 p-4';
export const DIALOG_DT = 'text-[0.76rem] font-[750] text-muted-foreground';
export const DIALOG_DD = 'mt-1 mb-0 leading-[1.6] text-foreground';
