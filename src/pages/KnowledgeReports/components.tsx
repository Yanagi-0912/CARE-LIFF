import type { ComponentType, ReactNode } from 'react';
import { CheckIcon, ChevronRightIcon, ClockIcon, LoaderIcon, XIcon } from 'lucide-react';
import { motion } from 'motion/react';

import type { KnowledgeReportStatus } from '../../api/knowledgeReportsApi';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/* ═══════════════════════════════════════════════════════
   KnowledgeReports 與 AdminKnowledgeReports 的共用畫面元件。

   版面全部由 shadcn 元件組成（Card / Item / Avatar / Badge / Empty），
   這裡只決定「哪個 slot 放什麼」，不自己刻盒子、不自己排欄位。

   兩件在改動時容易踩到的事：
   1. 外距一律交給外層容器的 flex gap，元件自己不帶 mb-*。
      （舊版 KnowledgeHero 自帶 mb-4，放進 grid 後兩張卡高度就對不齊。）
   2. 列的排版靠 Item 的 slot 語意：ItemHeader 是 basis-full，
      會自成一行；剩下的 Media / Content / Actions 排第二行。
      不要再自己包 div 做欄位，那正是舊版在窄螢幕會亂掉的原因。
   ═══════════════════════════════════════════════════════ */

/** 狀態 → 語意色。Badge 內建變體只有 destructive 一種語意色，四個狀態要能分辨就得查表 */
const STATUS_TONE: Record<KnowledgeReportStatus, string> = {
  pending: 'bg-warning-soft text-warning',
  reviewing: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  resolved: 'bg-success-soft text-success',
  rejected: 'bg-destructive-soft text-destructive',
};

/** 狀態 → 圖示。四個狀態只靠顏色分辨對色弱使用者不夠，圖示是第二個線索 */
const STATUS_ICON: Record<KnowledgeReportStatus, ComponentType<{ className?: string }>> = {
  pending: ClockIcon,
  reviewing: LoaderIcon,
  resolved: CheckIcon,
  rejected: XIcon,
};

/**
 * 頁面容器。
 * 只負責置中與限寬：左右內距與底部（避開 BottomNav）的留白由 App 骨架的
 * .content-area 統一給。舊版在這裡又補了一次 padding 與 --bottom-h，
 * 於是底部多出約 96px 的空白。
 */
export function KnowledgePage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 max-[640px]:px-2">
      {children}
    </div>
  );
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: KnowledgeReportStatus;
  label: string;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant="secondary" className={cn('h-7 gap-1 px-2.5', STATUS_TONE[status], className)}>
      <Icon className="size-3.5" />
      {label}
    </Badge>
  );
}

/**
 * 統計列。
 * knowledgeStats 這個 class 沒有樣式作用，是兩頁測試的定位點
 * （以 .knowledgeStats strong 取統計數字），改動時要一起改測試。
 */
export function StatsRow({
  label,
  items,
}: {
  label: string;
  items: { value: number; label: string }[];
}) {
  return (
    <div
      className="knowledgeStats grid grid-cols-3 items-center"
      role="group"
      aria-label={label}
    >
      {items.map((item, index) => (
        <div key={item.label} className="flex items-center">
          {index > 0 && <Separator orientation="vertical" className="mr-2 h-8 shrink-0" />}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
            <strong className="num text-2xl leading-none font-extrabold text-primary">
              {item.value}
            </strong>
            <span className="text-xs font-semibold text-balance text-muted-foreground">
              {item.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 兩頁共用的 hero：頭像、eyebrow、標題、統計列、（可選）主行動鈕 */
export function KnowledgeHero({
  avatar,
  eyebrow,
  title,
  stats,
  action,
}: {
  avatar: string;
  eyebrow: string;
  title: ReactNode;
  stats: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="h-full">
      {/* CardHeader 預設是 grid（給 CardAction 用的兩欄）。這裡只有頭像＋標題
          兩塊並排，改用 flex 才不會讓頭像被拉成一整個 grid 欄。 */}
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="bg-primary text-lg font-extrabold text-primary-foreground">
            {avatar}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <Badge variant="secondary">{eyebrow}</Badge>
          <h1 className="text-2xl leading-tight font-extrabold text-balance">{title}</h1>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-(--card-spacing)">
        <Separator />
        {stats}
      </CardContent>

      {action && <CardFooter className="[&>*]:w-full">{action}</CardFooter>}
    </Card>
  );
}

/** 清單列。整列是一顆 button，aria-label 由呼叫端給（兩頁的測試都靠它定位） */
export function ReportRow({
  status,
  statusLabel,
  question,
  ariaLabel,
  tags,
  submittedAt,
  reviewLabel,
  reviewText,
  index = 0,
  onClick,
}: {
  status: KnowledgeReportStatus;
  statusLabel: string;
  question: string;
  ariaLabel: string;
  tags: ReactNode;
  submittedAt: string;
  reviewLabel: string;
  reviewText: string;
  /** 進場動畫的順序；同一批列依序浮現 */
  index?: number;
  onClick: () => void;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Item
      variant="outline"
      className="cursor-pointer text-left transition-colors hover:bg-muted/40"
      render={
        <motion.button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: Math.min(index, 6) * 0.04, ease: 'easeOut' }}
        />
      }
    >
      {/* ItemHeader 是 basis-full，永遠自成一行：分類標籤靠左、狀態靠右。
          舊版把狀態塞在 ItemActions，窄螢幕時會被 flex-wrap 甩到下一行。 */}
      <ItemHeader className="gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {tags}
          <time className="text-xs text-muted-foreground">{submittedAt}</time>
        </div>
        <StatusBadge status={status} label={statusLabel} className="shrink-0" />
      </ItemHeader>

      <ItemMedia variant="icon" className={cn('size-10 rounded-xl', STATUS_TONE[status])}>
        <Icon />
      </ItemMedia>

      <ItemContent>
        <ItemTitle className="line-clamp-2 w-full text-base font-bold">{question}</ItemTitle>
        <ItemDescription>
          <span className="font-semibold text-foreground/70">{reviewLabel}</span>
          {'　'}
          {reviewText}
        </ItemDescription>
      </ItemContent>

      <ItemActions>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

/** 卡片內的分類／狀態小標籤 */
export function ReportTag({
  status,
  children,
}: {
  status: KnowledgeReportStatus;
  children: ReactNode;
}) {
  return (
    <Badge variant="secondary" className={STATUS_TONE[status]}>
      {children}
    </Badge>
  );
}

export function ReportsEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Empty className="rounded-2xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** 載入骨架。用與 ReportRow 相同的 Item 結構，載入完不會有版面跳動 */
export function ReportsLoading({ label }: { label: string }) {
  return (
    <ItemGroup className="gap-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <Item key={i} variant="outline">
          <ItemHeader className="gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </ItemHeader>
          <ItemMedia>
            <Skeleton className="size-10 rounded-xl" />
          </ItemMedia>
          <ItemContent className="gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full max-w-[420px]" />
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

/** 詳情對話框裡的一欄 */
export function DetailItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Item variant="muted" size="sm" className="items-start">
      <ItemContent>
        <ItemTitle className="text-xs font-bold text-muted-foreground">{term}</ItemTitle>
        <div className="w-full text-sm leading-relaxed text-foreground">{children}</div>
      </ItemContent>
    </Item>
  );
}

export function DetailList({ children }: { children: ReactNode }) {
  return <ItemGroup className="gap-2">{children}</ItemGroup>;
}
