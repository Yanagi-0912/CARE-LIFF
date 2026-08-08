import {
  Children,
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type SVGProps,
} from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'motion/react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export interface RenderStepIndicatorProps {
  step: number;
  currentStep: number;
  onStepClick: (clicked: number) => void;
}

export interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void | Promise<void>;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: RenderStepIndicatorProps) => ReactNode;
}

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  disableStepIndicators = false,
  renderStepIndicator,
  className = '',
  ...rest
}: StepperProps) {
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const [currentStep, setCurrentStep] = useState(() =>
    Math.min(Math.max(initialStep, 1), Math.max(totalSteps, 1)),
  );
  const [direction, setDirection] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    onStepChange(newStep);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await onFinalStepCompleted();
      setDirection(1);
      setCurrentStep(totalSteps + 1);
    } catch {
      // 儲存失敗時由呼叫端顯示訊息，並停留在最後一步方便重試。
    } finally {
      setIsCompleting(false);
    }
  };

  const {
    className: backButtonClassName = '',
    disabled: backButtonDisabled,
    ...backButtonRest
  } = backButtonProps;
  const {
    className: nextButtonClassName = '',
    disabled: nextButtonDisabled,
    ...nextButtonRest
  } = nextButtonProps;

  const handleStepClick = (clicked: number) => {
    setDirection(clicked > currentStep ? 1 : -1);
    updateStep(clicked);
  };

  return (
    <div {...rest} className={cn('flex w-full flex-col', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-xl border border-hair bg-surface shadow-card',
          stepCircleContainerClassName,
        )}
      >
        {/* 視覺上的步驟列（圓點＋連接線）只有 aria-current，對輔助技術傳達不出
            「第幾步、共幾步、完成多少」。補一個 sr-only 的 Progress 承擔這個語意，
            視覺結構維持不變——量測式滑動動畫是這個元件的價值所在，不重寫。 */}
        <Progress
          className="sr-only"
          value={totalSteps > 1 ? ((currentStep - 1) / (totalSteps - 1)) * 100 : 0}
          aria-label={`步驟 ${currentStep} / ${totalSteps}`}
        />
        <div
          role="group"
          aria-label={`步驟 ${currentStep} / ${totalSteps}`}
          className={cn('flex w-full items-center px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4', stepContainerClassName)}
        >
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;

            return (
              <Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: handleStepClick,
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={handleStepClick}
                  />
                )}
                {isNotLastStep && (
                  <StepConnector isComplete={currentStep > stepNumber} />
                )}
              </Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={cn('relative overflow-hidden', contentClassName)}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={cn('px-4 pb-4 sm:px-6 sm:pb-6', footerClassName)}>
            <div
              className={cn(
                'mt-4 flex gap-3',
                currentStep !== 1 ? 'justify-between' : 'justify-end',
              )}
            >
              {currentStep !== 1 && (
                <Button
                  {...backButtonRest}
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={backButtonDisabled || isCompleting}
                  // 原本手刻的 back-button 即為 outline 樣式；min-w 維持手機版的
                  // 108px 下限，避免兩顆按鈕在窄螢幕寬度不一致
                  className={cn(
                    'min-w-[108px] rounded-full font-bold text-muted-foreground hover:bg-surface-2 hover:text-ink active:scale-97',
                    backButtonClassName,
                  )}
                >
                  {backButtonText}
                </Button>
              )}
              <Button
                {...nextButtonRest}
                type="button"
                onClick={isLastStep ? handleComplete : handleNext}
                disabled={nextButtonDisabled || isCompleting}
                className={cn(
                  'min-w-[108px] rounded-full font-bold hover:bg-[var(--primary-strong)] active:scale-97',
                  nextButtonClassName,
                )}
              >
                {isLastStep ? completeButtonText : nextButtonText}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className?: string;
}

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className,
}: StepContentWrapperProps) {
  const [parentHeight, setParentHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const handleHeightReady = useCallback((height: number) => {
    setParentHeight(height);
  }, []);

  return (
    <motion.div
      className={className}
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition
            key={currentStep}
            direction={direction}
            onHeightReady={handleHeightReady}
          >
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SlideTransitionProps {
  children: ReactNode;
  direction: number;
  onHeightReady: (height: number) => void;
}

function SlideTransition({
  children,
  direction,
  onHeightReady,
}: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (containerRef.current) {
      onHeightReady(containerRef.current.offsetHeight);
    }
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial={reduceMotion ? 'center' : 'enter'}
      animate="center"
      exit={reduceMotion ? 'center' : 'exit'}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
      className="absolute inset-x-0 top-0 [will-change:transform,opacity] motion-reduce:[will-change:auto]"
    >
      {children}
    </motion.div>
  );
}

const stepVariants: Variants = {
  enter: (direction: number) => ({
    x: direction >= 0 ? '-100%' : '100%',
    opacity: 0,
  }),
  center: {
    x: '0%',
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction >= 0 ? '50%' : '-50%',
    opacity: 0,
  }),
};

interface StepProps {
  children: ReactNode;
}

export function Step({ children }: StepProps) {
  return <div className="px-4 py-3 sm:px-6 sm:py-4">{children}</div>;
}

interface StepIndicatorProps {
  step: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators?: boolean;
}

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators,
}: StepIndicatorProps) {
  const status =
    currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={() => onClickStep(step)}
      // 狀態改以 data 屬性表達，讓子元素能用 group-data-[status=...] 取用。
      // 原本是 is-${status} 動態類名 —— Tailwind 掃描不到拼接出的字串，
      // 用 data 屬性才能正確產生規則。
      data-status={status}
      className="group relative shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 text-inherit disabled:cursor-default"
      disabled={disableStepIndicators || step === currentStep}
      aria-label={`步驟 ${step}`}
      aria-current={status === 'active' ? 'step' : undefined}
      animate={{ scale: status === 'active' ? 1.08 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <span className="flex size-[34px] items-center justify-center rounded-full border-2 border-line bg-surface-2 font-bold text-muted-foreground transition-colors group-data-[status=active]:border-primary group-data-[status=active]:bg-primary group-data-[status=active]:text-white group-data-[status=complete]:border-primary group-data-[status=complete]:bg-primary group-data-[status=complete]:text-white motion-reduce:transition-none">
        {status === 'complete' ? (
          <CheckIcon className="size-[17px]" />
        ) : status === 'active' ? (
          <span className="size-[11px] rounded-full bg-white" />
        ) : (
          <span className="text-[0.85rem]">{step}</span>
        )}
      </span>
    </motion.button>
  );
}

interface StepConnectorProps {
  isComplete: boolean;
}

function StepConnector({ isComplete }: StepConnectorProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-2 h-[3px] flex-1 overflow-hidden rounded-full bg-surface-3">
      <motion.div
        className="absolute inset-0 origin-left bg-primary"
        initial={false}
        animate={{ scaleX: isComplete ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
      />
    </div>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <motion.path
        initial={{ pathLength: reduceMotion ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
