import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon } from 'lucide-react';
import type { AnnotationLabel } from '@/api/annotationsApi';
import { cn } from '@/lib/utils';
import './swipe-card.css';

type Gesture = {
  id: number; x: number; y: number; allowUp: boolean;
  axis: 'x' | 'y' | 'scroll' | null;
};

export default function SwipeCard({ health, disabled, onAnswer, children }: {
  health: boolean;
  disabled: boolean;
  onAnswer: (label: AnnotationLabel) => Promise<boolean>;
  children: ReactNode;
}) {
  const gesture = useRef<Gesture | null>(null);
  const pending = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [choice, setChoice] = useState<'yes' | 'no' | 'unknown' | null>(null);

  function reset() {
    gesture.current = null;
    setDragging(false);
    setOffset({ x: 0, y: 0 });
    setChoice(null);
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (disabled || pending.current || !event.isPrimary || event.button !== 0) return;
    const target = event.target as HTMLElement;
    gesture.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      allowUp: health && !!target.closest('[data-swipe-zone]'), axis: null,
    };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId || disabled || pending.current) return;
    const x = event.clientX - active.x;
    const y = event.clientY - active.y;
    if (active.axis === null) {
      if (Math.max(Math.abs(x), Math.abs(y)) < 10) return;
      if (Math.abs(x) > Math.abs(y) * 1.2) active.axis = 'x';
      else active.axis = active.allowUp && y < 0 ? 'y' : 'scroll';
      if (active.axis !== 'scroll') event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (active.axis === 'scroll') return;
    setDragging(true);
    setOffset(active.axis === 'x' ? { x, y: 0 } : { x: 0, y: Math.min(0, y) });
    setChoice(active.axis === 'y' ? 'unknown' : x >= 0 ? 'yes' : 'no');
  }

  async function end(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const x = event.clientX - active.x;
    const y = event.clientY - active.y;
    const threshold = Math.min(110, event.currentTarget.clientWidth * 0.28 || 90);
    const horizontal = active.axis === 'x' && Math.abs(x) >= threshold && Math.abs(x) > Math.abs(y) * 1.2;
    const upward = active.axis === 'y' && -y >= 80 && -y > Math.abs(x) * 1.2;
    gesture.current = null;
    setDragging(false);
    if (disabled || pending.current || (!horizontal && !upward)) { reset(); return; }
    pending.current = true;
    const label = upward ? null : x > 0 ? 1 : 0;
    setChoice(upward ? 'unknown' : x > 0 ? 'yes' : 'no');
    setOffset(upward ? { x: 0, y: -44 } : { x: Math.sign(x) * 44, y: 0 });
    try {
      await onAnswer(label);
    } finally {
      pending.current = false;
      reset();
    }
  }

  const positive = health ? '健康相關' : '同一主張';
  const negative = health ? '無關' : '不同主張';
  return (
    <div className="annotation-deck">
      <div className="annotation-deck-back" aria-hidden="true" />
      <div
        role="group"
        aria-label="標註卡片"
        aria-describedby="annotation-swipe-hint"
        aria-disabled={disabled}
        tabIndex={0}
        className={cn('annotation-swipe-card', dragging && 'is-dragging')}
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${Math.max(-9, Math.min(9, offset.x / 22))}deg)` }}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={event => void end(event)}
        onPointerCancel={reset}
        onLostPointerCapture={event => {
          // 觸控從內文的隱含 capture 移交給卡片時，也會冒泡 lost 事件。
          // 只處理卡片自己失去 capture，否則第一下橫滑就會被提前取消。
          if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) reset();
        }}
      >
        <div className="annotation-card-content" data-testid="annotation-card-content">{children}</div>
        <div data-swipe-zone className="annotation-swipe-zone" aria-label={health ? '滑動區：左滑無關、右滑健康相關、上滑無法判斷' : '滑動區：左滑不同主張、右滑同一主張'}>
          <div className="flex w-full items-center justify-between gap-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-300"><ArrowLeftIcon className="size-4" />{negative}</span>
            <span className="inline-flex items-center gap-1.5 text-primary">{positive}<ArrowRightIcon className="size-4" /></span>
          </div>
          {health && <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpIcon className="size-3.5" />無法判斷</span>}
          <span className="mt-2 h-1 w-9 rounded-full bg-foreground/15" aria-hidden="true" />
        </div>
        {choice && <div aria-hidden="true" className={cn(
          'annotation-swipe-stamp', choice === 'no' ? 'is-no' : choice === 'unknown' ? 'is-unknown' : 'is-yes',
        )}>{choice === 'yes' ? positive : choice === 'no' ? negative : '無法判斷'}</div>}
      </div>
      <p id="annotation-swipe-hint" className="sr-only">左右滑動卡片標記。{health && '從卡片底部上滑標記無法判斷。'}也可在更多選項啟用點選作答。</p>
    </div>
  );
}
