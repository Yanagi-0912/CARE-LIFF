import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';

// 已解密／未解密字元的預設樣式。設為預設值而非要求每個呼叫端自帶，
// 是因為這是元件本身的視覺特徵（原本 4 個頁面各重複一次）。
// motion-reduce 變體對應原 CSS 的 prefers-reduced-motion 區塊：關掉發光。
const REVEALED_CLASS = 'text-inherit';
const ENCRYPTED_CLASS =
  'text-[var(--primary-soft)] [text-shadow:0_0_12px_currentColor] motion-reduce:text-inherit motion-reduce:[text-shadow:none]';

type RevealDirection = 'start' | 'end' | 'center';
type AnimateOn = 'view' | 'hover' | 'inViewHover' | 'click';
type ClickMode = 'once' | 'toggle';
type Direction = 'forward' | 'reverse';

export interface DecryptedTextProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: RevealDirection;
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: AnimateOn;
  clickMode?: ClickMode;
}

function computeOrder(length: number, direction: RevealDirection) {
  if (direction === 'start') {
    return Array.from({ length }, (_, index) => index);
  }
  if (direction === 'end') {
    return Array.from({ length }, (_, index) => length - 1 - index);
  }

  const order: number[] = [];
  const middle = Math.floor(length / 2);
  for (let offset = 0; order.length < length; offset += 1) {
    const index = offset % 2 === 0
      ? middle + offset / 2
      : middle - Math.ceil(offset / 2);
    if (index >= 0 && index < length) order.push(index);
  }
  return order;
}

function allIndices(length: number) {
  return new Set(Array.from({ length }, (_, index) => index));
}

function DecryptedTextInstance({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = false,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+',
  className = REVEALED_CLASS,
  parentClassName = '',
  encryptedClassName = ENCRYPTED_CLASS,
  animateOn = 'hover',
  clickMode = 'once',
  style,
  ...motionProps
}: DecryptedTextProps) {
  const initiallyDecrypted = animateOn !== 'click';
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDecrypted, setIsDecrypted] = useState(initiallyDecrypted);
  const [direction, setDirection] = useState<Direction>('forward');
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(
    initiallyDecrypted ? allIndices(text.length) : new Set(),
  );
  const [iteration, setIteration] = useState(0);

  const containerRef = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderRef = useRef<number[]>([]);
  const pointerRef = useRef(0);
  const revealedRef = useRef(revealedIndices);
  const iterationRef = useRef(0);
  const hasAnimatedRef = useRef(false);

  const availableChars = useMemo(() => {
    const source = useOriginalCharsOnly
      ? Array.from(new Set(text.split(''))).filter((character) => character.trim())
      : characters.split('');
    return source.length > 0 ? source : ['•'];
  }, [characters, text, useOriginalCharsOnly]);

  const shuffleText = useCallback(
    (currentRevealed: Set<number>, animationIteration: number) => text
      .split('')
      .map((character, index) => {
        if (character === ' ' || currentRevealed.has(index)) return character;
        const randomOffset = Math.floor(Math.random() * availableChars.length);
        return availableChars[
          (randomOffset + animationIteration + index) % availableChars.length
        ];
      })
      .join(''),
    [availableChars, text],
  );

  const displayText = useMemo(() => {
    if (!isAnimating && isDecrypted) return text;
    return shuffleText(revealedIndices, iteration);
  }, [isAnimating, isDecrypted, iteration, revealedIndices, shuffleText, text]);

  const setRevealed = useCallback((indices: Set<number>) => {
    revealedRef.current = indices;
    setRevealedIndices(indices);
  }, []);

  const stopAnimation = useCallback((decrypted: boolean) => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsAnimating(false);
    setIsDecrypted(decrypted);
    if (decrypted) setRevealed(allIndices(text.length));
  }, [setRevealed, text.length]);

  const triggerDecrypt = useCallback(() => {
    orderRef.current = computeOrder(text.length, revealDirection);
    pointerRef.current = 0;
    iterationRef.current = 0;
    setIteration(0);
    setRevealed(new Set());
    setDirection('forward');
    setIsDecrypted(false);
    setIsAnimating(true);
  }, [revealDirection, setRevealed, text.length]);

  const triggerReverse = useCallback(() => {
    orderRef.current = computeOrder(text.length, revealDirection).reverse();
    pointerRef.current = 0;
    iterationRef.current = 0;
    setIteration(0);
    setRevealed(allIndices(text.length));
    setDirection('reverse');
    setIsAnimating(true);
  }, [revealDirection, setRevealed, text.length]);

  useEffect(() => {
    if (!isAnimating) return undefined;

    intervalRef.current = setInterval(() => {
      if (sequential) {
        const current = new Set(revealedRef.current);
        const nextIndex = orderRef.current[pointerRef.current];

        if (nextIndex === undefined) {
          stopAnimation(direction === 'forward');
          return;
        }

        pointerRef.current += 1;
        if (direction === 'forward') current.add(nextIndex);
        else current.delete(nextIndex);
        setRevealed(current);

        if (pointerRef.current >= orderRef.current.length) {
          stopAnimation(direction === 'forward');
        }
        return;
      }

      iterationRef.current += 1;
      setIteration(iterationRef.current);

      if (direction === 'reverse') {
        const current = Array.from(revealedRef.current);
        const removeCount = Math.max(1, Math.ceil(text.length / Math.max(1, maxIterations)));
        const next = new Set(current.slice(removeCount));
        setRevealed(next);
        if (next.size === 0 || iterationRef.current >= maxIterations) {
          stopAnimation(false);
        }
        return;
      }

      if (iterationRef.current >= maxIterations) stopAnimation(true);
    }, Math.max(speed, 10));

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [
    direction,
    isAnimating,
    maxIterations,
    sequential,
    setRevealed,
    speed,
    stopAnimation,
    text.length,
  ]);

  const handleClick = () => {
    if (animateOn !== 'click' || isAnimating) return;
    if (clickMode === 'once' && isDecrypted) return;
    if (clickMode === 'toggle' && isDecrypted) triggerReverse();
    else triggerDecrypt();
  };

  const handleMouseEnter = () => {
    if (
      (animateOn === 'hover' || animateOn === 'inViewHover')
      && !isAnimating
    ) {
      triggerDecrypt();
    }
  };

  const handleMouseLeave = () => {
    if (animateOn !== 'hover' && animateOn !== 'inViewHover') return;
    stopAnimation(true);
  };

  useEffect(() => {
    if (
      (animateOn !== 'view' && animateOn !== 'inViewHover')
      || typeof IntersectionObserver === 'undefined'
    ) {
      return undefined;
    }

    const element = containerRef.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimatedRef.current) {
        hasAnimatedRef.current = true;
        triggerDecrypt();
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [animateOn, triggerDecrypt]);

  return (
    <motion.span
      {...motionProps}
      ref={containerRef}
      className={cn('relative cursor-default', parentClassName)}
      style={{ ...style, display: 'inline-block', whiteSpace: 'pre-wrap' }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* decrypted-text__sr-only 保留作為測試定位點（decryptedText.test.tsx 以此選取），
          視覺隱藏改用 Tailwind 內建的 sr-only，不再自刻 clip 那套 */}
      <span className="decrypted-text__sr-only sr-only">{text}</span>
      <span aria-hidden="true">
        {displayText.split('').map((character, index) => {
          const revealed = revealedIndices.has(index) || (!isAnimating && isDecrypted);
          return (
            <span
              // Character positions are stable for the lifetime of this keyed instance.
              key={index}
              className={revealed ? className : encryptedClassName}
            >
              {character}
            </span>
          );
        })}
      </span>
    </motion.span>
  );
}

export default function DecryptedText(props: DecryptedTextProps) {
  return (
    <DecryptedTextInstance
      key={`${props.text}-${props.animateOn ?? 'hover'}`}
      {...props}
    />
  );
}
