import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import './LineSidebar.css';

type Falloff = 'linear' | 'smooth' | 'sharp';

export interface LineSidebarProps {
  items?: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
  ariaLabel?: string;
}

const FALLOFF_CURVES: Record<Falloff, (proximity: number) => number> = {
  linear: (proximity) => proximity,
  smooth: (proximity) => proximity * proximity * (3 - 2 * proximity),
  sharp: (proximity) => proximity * proximity * proximity,
};

const DEFAULT_ITEMS = ['Overview', 'Components', 'Animations', 'Backgrounds', 'Showcase'];

function LineSidebar({
  items = DEFAULT_ITEMS,
  accentColor = '#A855F7',
  textColor = '#c4c4c4',
  markerColor = '#6c6c6c',
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 30,
  falloff = 'smooth',
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 20,
  fontSize = 1.1,
  smoothing = 100,
  defaultActive = null,
  onItemClick,
  className = '',
  ariaLabel = 'Primary navigation',
}: LineSidebarProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(defaultActive);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;

      const pointerY = event.clientY - list.getBoundingClientRect().top;
      const ease = FALLOFF_CURVES[falloff];

      itemRefs.current.forEach((element, index) => {
        if (!element) return;
        const center = element.offsetTop + element.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        const proximityEffect = ease(
          Math.max(0, 1 - distance / Math.max(proximityRadius, 1)),
        );
        const effect = Math.max(proximityEffect, activeIndex === index ? 1 : 0);
        element.style.setProperty('--effect', effect.toFixed(4));
      });
    },
    [activeIndex, falloff, proximityRadius],
  );

  const handlePointerLeave = useCallback(() => {
    itemRefs.current.forEach((element, index) => {
      element?.style.setProperty('--effect', activeIndex === index ? '1' : '0');
    });
  }, [activeIndex]);

  const handleClick = useCallback(
    (index: number, label: string) => {
      setActiveIndex(index);
      onItemClick?.(index, label);
    },
    [onItemClick],
  );

  useEffect(() => {
    itemRefs.current.forEach((element, index) => {
      element?.style.setProperty('--effect', activeIndex === index ? '1' : '0');
    });
  }, [activeIndex, items.length]);

  const componentStyle = {
    '--accent-color': accentColor,
    '--text-color': textColor,
    '--marker-color': markerColor,
    '--marker-length': `${markerLength}px`,
    '--marker-gap': `${markerGap}px`,
    '--tick-scale': tickScale,
    '--max-shift': `${maxShift}px`,
    '--item-gap': `${itemGap}px`,
    '--font-size': `${fontSize}rem`,
    '--smoothing': `${smoothing}ms`,
  } as CSSProperties;

  return (
    <nav
      aria-label={ariaLabel}
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''}${className ? ` ${className}` : ''}`}
      style={componentStyle}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((label, index) => (
          <li
            key={`${label}-${index}`}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className="line-sidebar__item"
          >
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            <button
              type="button"
              className="line-sidebar__label"
              aria-current={activeIndex === index ? 'page' : undefined}
              onClick={() => handleClick(index, label)}
            >
              {showIndex && (
                <span className="line-sidebar__index">
                  {String(index + 1).padStart(2, '0')}
                </span>
              )}
              <span className="line-sidebar__text" data-label={label}>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default LineSidebar;
