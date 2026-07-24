import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './GlidingTabs.css';

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

  return (
    <nav
      className={`gliding-tabs${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      <span
        className="gliding-tabs__indicator"
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
            className={`gliding-tabs__tab${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.key)}
          >
            {tab.icon ? <span className="gliding-tabs__icon">{tab.icon}</span> : null}
            <span className="gliding-tabs__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
