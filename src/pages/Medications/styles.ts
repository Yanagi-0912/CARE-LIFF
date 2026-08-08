import type { MedicationSlotType } from '../../types/medication';

/* ═══════════════════════════════════════════════════════
   用藥提醒頁的共用樣式常數（index / ReminderCard / 兩個 Dialog 共用，
   原為一份被四檔共用的 index.css）。
   ═══════════════════════════════════════════════════════ */

export const PAGE = 'mx-auto max-w-[760px]';
export const HEADER = 'mb-4 flex items-center justify-between gap-3';
export const HEADER_H1 = 'm-0 text-2xl font-extrabold text-ink';

/* ── 按鈕 ── */
export const BTN_PRIMARY =
  'inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] px-5 py-[11px] text-[0.95rem] font-bold text-white shadow-[0_6px_16px_-6px_rgba(14,147,132,0.5)] transition-[transform,box-shadow,opacity] duration-140 hover:-translate-y-px active:scale-97 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none';
export const BTN_GHOST =
  'cursor-pointer rounded-full border border-hair bg-surface-2 px-5 py-[11px] text-[0.95rem] font-semibold text-foreground transition-colors duration-140 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-55';
export const BTN_DANGER =
  'cursor-pointer rounded-full border-0 bg-destructive px-5 py-[11px] text-[0.95rem] font-bold text-white disabled:cursor-not-allowed disabled:opacity-55';

/* ── 對象切換 chips ── */
export const CHIPS_ROW =
  'mb-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
/* 選中態以 aria-pressed: 變體表達（見 index.tsx）；
   hover 覆寫需一併帶上，避免此處的 hover:text-primary 在選中時蓋回綠字。 */
export const CHIP =
  'shrink-0 cursor-pointer rounded-full border border-line bg-surface px-4 py-2 text-[0.92rem] font-semibold text-muted-foreground transition-all duration-140 hover:border-primary hover:text-primary';

/* ── 提醒卡片 ── */
export const LIST = 'flex flex-col gap-3';
export const CARD =
  'flex items-stretch overflow-hidden rounded-lg border border-hair bg-surface shadow-card transition-[box-shadow,opacity] duration-140 hover:shadow-pop';
export const CARD_OFF = 'opacity-62';
export const CARD_MAIN =
  'flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-4 text-left text-inherit';
export const SLOT_BADGE =
  'grid size-[46px] shrink-0 place-items-center rounded-md text-center text-[0.95rem] leading-[1.1] font-extrabold';
/* 時段 → 語意色（原 slot-${type} 動態類名改查表） */
export const SLOT_TONE: Record<MedicationSlotType, string> = {
  morning: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  noon: 'bg-[var(--primary-soft)] text-primary',
  evening: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  bedtime: 'bg-[var(--violet-soft)] text-[var(--violet)]',
};
export const CARD_INFO = 'flex min-w-0 flex-1 flex-col gap-[2px]';
export const TIME = 'num text-[1.35rem] font-extrabold text-ink max-[420px]:text-[1.2rem]';
export const DATE_RANGE = 'text-[0.82rem] text-muted-foreground';
export const CHEVRON = 'shrink-0 text-[1.4rem] leading-none text-faint';

/* ── 卡片右側啟用開關 ──
   外層是整塊直向點擊區（84px 寬、含左分隔線），內含 Switch 與狀態文字；
   軌道與滑鈕由 Switch 元件負責，這裡只描述容器。
   has-disabled: 讓 Switch 停用時整塊區域一起呈現等待狀態。 */
export const TOGGLE =
  'flex w-[84px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[5px] border-l border-hair bg-surface-2 px-2 py-3 has-disabled:cursor-progress has-disabled:opacity-60 max-[420px]:w-[68px]';
export const TOGGLE_TEXT = 'text-[0.72rem] font-semibold text-muted-foreground';

/* ── 空狀態 ── */
export const EMPTY =
  'flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-4 py-12 text-center';
export const EMPTY_ICON =
  'grid size-12 place-items-center rounded-full bg-[var(--primary-softer)] text-[1.3rem] font-extrabold text-primary';
export const EMPTY_H2 = 'm-0 text-[1.05rem] font-bold text-ink';
export const EMPTY_P = 'm-0 text-[0.88rem] text-muted-foreground';

/* ── Toast（沿用 rise 上浮淡入；水平置中用 translate 屬性，與動畫的 transform 可並存）── */

/* ── Dialog ── */
export const DIALOG =
  'relative flex max-h-[88vh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-xl bg-surface px-4 pt-6 pb-4 shadow-modal';
export const DIALOG_H2 = 'm-0 pr-8 text-[1.2rem] font-extrabold text-ink';
export const DIALOG_CLOSE =
  'absolute top-3 right-3 size-8 cursor-pointer rounded-full border-0 bg-surface-2 text-[1.2rem] leading-none text-muted-foreground';
export const DIALOG_TARGET = 'm-0 flex items-baseline gap-2 text-[0.9rem] text-muted-foreground';
export const DIALOG_TARGET_STRONG = 'text-base text-ink';

/* ── 時段複選 ── */
export const SLOT_PICKER = 'm-0 flex flex-col gap-2 border-0 p-0';
export const SLOT_LEGEND = 'pb-2 text-[0.9rem] font-bold text-foreground';
export const SLOT_OPTION =
  'flex cursor-pointer items-center gap-3 rounded-md border border-hair bg-surface-2 px-3 py-[11px] transition-colors duration-140 has-[:checked]:border-primary has-[:checked]:bg-[var(--primary-softer)]';
export const SLOT_TAKEN = 'cursor-not-allowed opacity-55';
export const SLOT_CHECKBOX = 'size-[18px] accent-primary';
export const SLOT_NAME = 'flex-1 text-[0.95rem] font-semibold text-ink';
export const SLOT_TIME = 'num text-[0.82rem] text-muted-foreground';

/* ── 表單欄位 ── */
export const FIELD = 'flex flex-col gap-[5px]';
export const FIELD_LABEL = 'text-[0.85rem] font-bold text-foreground';
export const FIELD_INPUT =
  'rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';
export const FIELD_HINT = 'text-[0.76rem] text-faint';
export const FIELD_INLINE =
  'flex cursor-pointer items-center gap-2 text-[0.95rem] font-semibold text-foreground';
export const NOTE = 'm-0 text-[0.78rem] leading-normal text-faint';
export const ERROR =
  'm-0 rounded-sm bg-destructive-soft px-3 py-2.5 text-[0.85rem] font-semibold text-destructive';
export const ACTIONS = 'flex gap-2 [&>button]:flex-1 [&>button]:justify-center';

/* ── 刪除區 ── */
export const DANGER_ZONE = 'mt-2 flex flex-col gap-2 border-t border-hair pt-3';
export const DANGER_P = 'm-0 text-[0.85rem] text-destructive';
export const DELETE_LINK =
  'cursor-pointer self-center border-0 bg-transparent p-2 text-[0.88rem] font-semibold text-destructive underline disabled:cursor-not-allowed disabled:opacity-50';
