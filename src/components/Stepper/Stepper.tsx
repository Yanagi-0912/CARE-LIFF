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

import './Stepper.css';

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
    <div {...rest} className={`outer-container ${className}`.trim()}>
      <div className={`step-circle-container ${stepCircleContainerClassName}`.trim()}>
        <div className={`step-indicator-row ${stepContainerClassName}`.trim()}>
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
          className={`step-content-default ${contentClassName}`.trim()}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={`footer-container ${footerClassName}`.trim()}>
            <div className={`footer-nav ${currentStep !== 1 ? 'spread' : 'end'}`}>
              {currentStep !== 1 && (
                <button
                  {...backButtonRest}
                  type="button"
                  onClick={handleBack}
                  disabled={backButtonDisabled || isCompleting}
                  className={`back-button ${backButtonClassName}`.trim()}
                >
                  {backButtonText}
                </button>
              )}
              <button
                {...nextButtonRest}
                type="button"
                onClick={isLastStep ? handleComplete : handleNext}
                disabled={nextButtonDisabled || isCompleting}
                className={`next-button ${nextButtonClassName}`.trim()}
              >
                {isLastStep ? completeButtonText : nextButtonText}
              </button>
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
      className="step-slide"
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
  return <div className="step-default">{children}</div>;
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
      className={`step-indicator is-${status}`}
      disabled={disableStepIndicators || step === currentStep}
      aria-label={`步驟 ${step}`}
      aria-current={status === 'active' ? 'step' : undefined}
      animate={{ scale: status === 'active' ? 1.08 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <span className="step-indicator-inner">
        {status === 'complete' ? (
          <CheckIcon className="check-icon" />
        ) : status === 'active' ? (
          <span className="active-dot" />
        ) : (
          <span className="step-number">{step}</span>
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
    <div className="step-connector">
      <motion.div
        className="step-connector-inner"
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
