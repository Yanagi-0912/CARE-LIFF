/* ═══════════════════════════════════════════════════════
   家族頁的樣式常數（原樣式住在全域 index.css 的 Family 區塊，
   遷移後搬到頁面自己的模組）。
   響應式沿用原檔 1024px／640px 斷點，以 max-[...]: 1:1 對映。
   ═══════════════════════════════════════════════════════ */

export const PAGE = 'mx-auto max-w-[1200px]';


export const HEADER = 'mb-6 flex items-center justify-between';
export const HEADER_H2 =
  'm-0 flex items-center gap-2 text-2xl font-extrabold max-[640px]:text-[1.2rem]';

/* 加入家人按鈕（accent 珊瑚，代表「行動」） */
export const INVITE_BTN =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-[22px] py-[11px] text-[0.95rem] font-bold text-white shadow-[0_6px_16px_-6px_rgba(239,119,87,0.55)] transition-[transform,box-shadow,opacity] duration-140 hover:-translate-y-px hover:shadow-[0_10px_22px_-8px_rgba(239,119,87,0.65)] active:scale-97 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none max-[640px]:px-4 max-[640px]:py-2 max-[640px]:text-[0.85rem]';

export const GRID = 'grid grid-cols-4 gap-4 max-[1024px]:grid-cols-3 max-[640px]:grid-cols-2';

/* 成員卡片：進場重用 hero-in（14px 上浮＋微縮放），瀑布延遲由 index 公式給 */
export const CARD =
  'group animate-hero-in [animation-duration:360ms] relative flex cursor-pointer flex-col items-center gap-2.5 rounded-lg border border-hair bg-surface px-4 py-6 ring-0 shadow-card transition-[transform,box-shadow,border-color,background-color] duration-220 select-none hover:-translate-y-[3px] hover:border-line hover:shadow-pop max-[640px]:px-3 max-[640px]:py-[18px]';
export const CARD_EXPANDED =
  'col-span-2 border-[var(--primary-soft)] bg-[linear-gradient(160deg,var(--primary-softer),var(--surface)_55%)] shadow-pop';
export const AVATAR =
  'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-[linear-gradient(135deg,var(--primary-soft),var(--primary-softer))] text-[1.8rem] shadow-card transition-transform duration-220 group-hover:scale-[1.06] max-[640px]:size-[52px] max-[640px]:text-2xl [&_img]:h-full [&_img]:w-full [&_img]:object-cover';
export const NAME = 'text-center text-[0.95rem] leading-[1.3] font-bold break-all text-ink';
export const RELATION =
  'inline-block rounded-full bg-[var(--primary-soft)] px-3 py-[3px] text-[0.8rem] font-semibold text-[var(--primary-strong)]';
export const RELATION_UNSET = 'bg-surface-2 text-faint';
export const EXPAND_HINT = 'text-[0.7rem] text-faint transition-colors duration-140';
export const EXPAND_HINT_ON = 'text-primary';

export const EMPTY = 'px-4 py-16 text-center text-faint';
export const EMPTY_ICON = 'mb-4 text-[3rem]';
export const EMPTY_P = 'text-base leading-[1.6]';

/* 展開的健康詳情（原 healthSlideIn：-8px 下滑淡入） */
export const DETAIL =
  'animate-in fade-in slide-in-from-top-2 mt-3 w-full border-t border-hair pt-3 duration-220';
export const FIELDS = 'flex w-full flex-col gap-2';
export const FIELD = 'flex items-baseline justify-between py-1 text-[0.85rem]';
export const FIELD_LABEL = 'mr-3 shrink-0 font-medium text-muted-foreground';
export const FIELD_VALUE = 'num text-right font-bold break-words text-ink';
export const STATE_TEXT = 'py-2 text-center text-[0.85rem] text-faint';
export const STATE_ERROR = 'py-2 text-center text-[0.85rem] text-destructive';
