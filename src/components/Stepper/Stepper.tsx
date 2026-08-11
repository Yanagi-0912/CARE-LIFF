import {
  Children,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void | Promise<void>;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  /**
   * 進度文字。這個元件不內建文案（專案有六個語言），
   * 由呼叫端給：(c, t) => t('personalHealth.stepProgress', { current: c, total: t })
   */
  stepLabel?: (currentStep: number, totalSteps: number) => string;
}

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  stepLabel,
  className = '',
  ...rest
}: StepperProps) {
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const [currentStep, setCurrentStep] = useState(() =>
    Math.min(Math.max(initialStep, 1), Math.max(totalSteps, 1)),
  );
  const [isCompleting, setIsCompleting] = useState(false);

  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    onStepChange(newStep);
  };

  const handleBack = () => {
    if (currentStep > 1) updateStep(currentStep - 1);
  };

  const handleNext = () => {
    if (!isLastStep) updateStep(currentStep + 1);
  };

  const handleComplete = async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await onFinalStepCompleted();
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

  // 完成後補到 100%，否則「第 N 步」對應 N/總數（第 1 步就有進度，符合直覺）
  const progressValue = isCompleted
    ? 100
    : totalSteps > 0
      ? (currentStep / totalSteps) * 100
      : 0;
  const progressText = stepLabel?.(Math.min(currentStep, totalSteps), totalSteps);

  return (
    <div {...rest} className={cn('flex w-full flex-col', className)}>
      <div className="w-full overflow-hidden rounded-xl border border-hair bg-surface shadow-card">
        {/* 進度以 shadcn Progress 呈現（原本是手刻的圓點＋連接線，另外藏一個
            sr-only Progress 補語意）。這裡不再印可見的步驟文字：呼叫端的
            StepIntro 已經顯示「步驟 N / M」，再印一次會重複。stepLabel 只用來
            當可及名稱——原本這裡是硬編碼中文，在六語言的 App 裡是錯的。 */}
        <div className="w-full px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <Progress value={progressValue} aria-label={progressText} />
        </div>

        {!isCompleted && (
          <>
            {/* key 讓步驟切換時重新掛載，進場動畫才會重播。
                動畫用 tw-animate-css 的 utility（shadcn 自己的元件也是用這套）；
                prefers-reduced-motion 由 index.css 的全域區塊統一處理。 */}
            <div
              key={currentStep}
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              {stepsArray[currentStep - 1]}
            </div>

            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
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
                    className={cn('min-w-[108px] rounded-full font-bold', backButtonClassName)}
                  >
                    {backButtonText}
                  </Button>
                )}
                <Button
                  {...nextButtonRest}
                  type="button"
                  onClick={isLastStep ? handleComplete : handleNext}
                  disabled={nextButtonDisabled || isCompleting}
                  className={cn('min-w-[108px] rounded-full font-bold', nextButtonClassName)}
                >
                  {isLastStep ? completeButtonText : nextButtonText}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Step({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 sm:px-6 sm:py-4">{children}</div>;
}
