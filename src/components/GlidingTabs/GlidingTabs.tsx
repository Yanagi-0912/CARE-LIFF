import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GlidingTabItem = {
  key: string;
  label: string;
  icon?: ReactNode;
};

type GlidingTabsProps = {
  tabs: GlidingTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  'aria-label'?: string;
};

// 滑動指示器的動畫參數，指示器與文字色需一致，抽出共用。
const GLIDE = 'duration-400 ease-[cubic-bezier(0.65,0,0.35,1)]';

export default function GlidingTabs({
  tabs,
  activeKey,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: GlidingTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [style, setStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === activeKey),
  );

  const updateIndicator = () => {
    const el = refs.current[activeIndex];
    if (!el) return;
    setStyle({ left: el.offsetLeft, width: el.offsetWidth });
  };

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeIndex, tabs]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeIndex, tabs]);

  const handleClick = (key: string, index: number) => {
    const el = refs.current[index];
    if (el) {
      setStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
    onChange(key);
  };

  return (
    // 這是路由導覽而非 tab widget，因此維持 nav + aria-current，
    // 不改用 shadcn Tabs（其 role="tab"/"tabpanel" 會傳達錯誤語意）。
    <nav
      className={cn(
        'relative mx-2.5 mt-2 flex w-[calc(100%-20px)] items-center justify-between gap-1 rounded-full border border-hair bg-surface-2 p-1',
        'shadow-[0_-4px_16px_-10px_rgba(20,32,29,0.1)]',
        // 避開 iPhone 底部 home indicator
        'mb-[calc(8px+env(safe-area-inset-bottom,0px))]',
        className,
      )}
      aria-label={ariaLabel}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 z-0 rounded-full bg-primary',
          'shadow-[0_4px_12px_-4px_rgba(14,147,132,0.55)]',
          'transition-[left,width]',
          GLIDE,
        )}
        style={{
          left: style.left,
          width: style.width,
        }}
        aria-hidden="true"
      />
      {tabs.map((tab, i) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={cn(
              'relative z-[1] flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5',
              'rounded-full border-0 bg-transparent px-2.5 py-2 transition-colors',
              GLIDE,
              isActive ? 'text-primary-foreground' : 'text-faint',
            )}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => handleClick(tab.key, i)}
          >
            {tab.icon ? (
              <span className="inline-flex items-center justify-center">{tab.icon}</span>
            ) : null}
            <span className="text-[0.72rem] font-[650] whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
