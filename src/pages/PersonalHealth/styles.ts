/* ═══════════════════════════════════════════════════════
   個人健康頁的樣式常數（原 index.css 遷移）。
   響應式沿用原檔的 max-width:600px 斷點，以 max-[600px]: 1:1 對映。
   ═══════════════════════════════════════════════════════ */

export const PAGE =
  'mx-auto flex min-h-screen max-w-[800px] flex-col px-4 py-8 max-[600px]:px-3 max-[600px]:py-6';

/* ── 品牌綠漸層橫幅 ── */
export const BANNER =
  'animate-hero-in mb-4 flex items-start gap-4 rounded-xl bg-[radial-gradient(360px_160px_at_94%_-30%,rgba(255,255,255,0.25)_0%,transparent_70%),linear-gradient(135deg,var(--primary),var(--primary-2))] p-6 text-white shadow-[0_14px_32px_-14px_rgba(14,147,132,0.55)] max-[600px]:gap-3.5 max-[600px]:p-4';
export const AVATAR_WRAP = 'shrink-0';
export const AVATAR =
  'size-[76px] rounded-full border-[3px] border-white/85 bg-surface-3 object-cover shadow-[0_8px_18px_rgba(10,68,60,0.3)] max-[600px]:size-16';
export const AVATAR_FALLBACK =
  'flex items-center justify-center bg-white text-[1.8rem] font-extrabold text-[var(--primary-strong)]';
export const BANNER_TEXT =
  'flex min-w-0 flex-col gap-2 pt-1 max-[600px]:pt-[2px]';
export const BANNER_LABEL =
  'text-[0.85rem] font-bold tracking-[0.06em] text-white/82 uppercase max-[600px]:text-[0.75rem]';
export const BANNER_TITLE =
  'mb-0 text-[1.4rem] font-extrabold break-words text-white max-[600px]:text-[1.2rem]';

/* ── 表單白卡（比橫幅晚一拍浮現）── */
export const FORM_CARD =
  'animate-hero-in flex w-full flex-col rounded-xl border border-hair bg-surface p-6 shadow-card [animation-delay:120ms] max-[600px]:p-4';
/* Stepper 版型下白卡外框交給 Stepper 自己畫 */
export const FORM_CARD_BARE = 'border-0 bg-transparent p-0 shadow-none';

export const STEP_INTRO = 'mb-6 border-b border-hair pb-4';

export const FORM_GROUP =
  'mb-6 flex items-center gap-4 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2';
export const LABEL =
  'min-w-40 text-[1.05rem] font-bold text-foreground max-[600px]:min-w-0 max-[600px]:text-base';

/* ── 輸入框 ── */
export const INPUT =
  'w-full max-w-[300px] flex-1 rounded-md border-[1.5px] border-hair bg-surface px-3.5 py-[11px] text-base text-ink transition-[border-color,box-shadow] duration-140 placeholder:text-faint focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] focus:outline-none max-[600px]:max-w-[80%]';
export const INPUT_LONG = 'max-w-[500px] max-[600px]:max-w-full';
export const INPUT_ERROR = 'border-[#ff4d4f]';
export const FIELD_CONTROL =
  'flex max-w-[300px] flex-1 flex-col gap-1 max-[600px]:w-full max-[600px]:max-w-full [&_input]:max-w-none [&_textarea]:max-w-none';
export const STEP_REQUIREMENT =
  'm-0 rounded-md bg-warning-soft p-3 text-[0.86rem] font-[650] text-warning';

/* ── 自刻單選下拉（性別）── */
export const SELECT_WRAP = 'relative max-w-[300px] flex-1 max-[600px]:w-full max-[600px]:max-w-full';
export const SELECT_BTN =
  'flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-[1.5px] border-hair bg-surface px-3.5 py-[11px] text-left text-base text-ink transition-colors duration-140 hover:border-primary';
export const SELECT_TEXT = 'overflow-hidden text-ellipsis whitespace-nowrap text-ink';
export const SELECT_CARET = 'text-[0.85rem] text-primary';

/* ── 自刻多選下拉（病史）── */
export const MULTI_WRAP = 'relative max-w-[360px] flex-1 max-[600px]:w-full max-[600px]:max-w-full';
export const HISTORY_CONTROL =
  'flex min-w-0 max-w-[500px] flex-1 flex-col gap-2 max-[600px]:w-full max-[600px]:max-w-full [&>div]:w-full';
export const MULTI_MENU =
  'absolute top-[calc(100%+6px)] right-0 left-0 z-10 max-h-60 overflow-y-auto rounded-md border border-hair bg-surface p-2 shadow-pop';
export const MULTI_ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 bg-transparent px-3 py-2.5 text-left text-foreground transition-colors duration-140 hover:bg-surface-2';
export const MULTI_ITEM_ACTIVE = 'bg-[var(--primary-softer)]';
export const MULTI_CHECK =
  'inline-flex size-5 shrink-0 items-center justify-center rounded-sm border-[1.5px] border-primary bg-surface text-[0.9rem] font-bold text-[var(--primary-strong)]';

/* ── 其他輸入列 ── */
export const OTHER_ROW =
  'mb-2 flex flex-1 items-center gap-2 [&>input]:flex-1 [&_svg]:stroke-primary';
export const OTHER_BTN =
  'flex cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-45';
export const OTHER_BADGE = 'shrink-0 text-[0.78rem] font-bold text-success';

/* ── 送出按鈕與結果 ── */
export const BUTTON =
  'mx-auto mt-8 w-full max-w-[300px] cursor-pointer rounded-lg border-0 bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] py-3.5 text-[1.05rem] font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(14,147,132,0.6)] transition-[transform,box-shadow] duration-140 hover:-translate-y-px hover:shadow-[0_12px_26px_-10px_rgba(14,147,132,0.7)] active:scale-98 max-[600px]:w-1/2';
export const ACTION_ROW =
  'mt-8 flex flex-wrap items-center justify-center gap-4 max-[600px]:w-full max-[600px]:gap-2.5 [&>button]:m-0 [&>button]:w-1/2 [&>button]:max-w-[260px] max-[600px]:[&>button]:w-[45%]';

/* ── 儲存提示 ── */
