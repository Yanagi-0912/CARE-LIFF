import { useTranslation } from 'react-i18next';
import {
  FootprintsIcon,
  InfoIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { useStepCounter, type UseStepCounterResult } from '@/hooks/useStepCounter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * 即時計步的操作區（10.3，task-8-11-dispatch-notes.md「Task 10」），掛載在
 * `StepsTab.tsx` 的 `data-testid="steps-counter-slot"` 裡，只有查看自己的
 * 健康紀錄時才會出現（步數只能來自本人手機的感測器）。
 *
 * 三個 step-counter spec 規則直接對應這裡的畫面：
 * - 「準確度揭露」：估算說明恆常顯示，不只在計步中才出現。
 * - 「只在頁面可見時計步」：文案明講「只在這個頁面開著」，不宣稱背景計步；
 *   實際的暫停/恢復邏輯在 `useStepCounter` 裡。
 * - 「感測器權限與不支援的裝置」：拒絕與不支援各自有獨立說明，且兩種情形
 *   都不渲染步數數字（`useStepCounter` 在這兩種狀態下 `todaySteps` 是
 *   `null`，不是 0）。不支援是 4 秒沒收到任何感測資料就判定的猜測值，
 *   有可能誤判到訊號比較慢的裝置，所以「重試」鈕會留著、呼叫
 *   `start()`（本來就支援從任何狀態重新開始），不會把使用者卡在只能重新
 *   整理頁面的死角。
 *
 * 拆成 `StepCounterView`（純呈現，只吃 hook 的回傳值）＋`StepCounterPanel`
 * （接上真正的 hook）兩層：測試可以直接把各種狀態的 props 餵給
 * `StepCounterView`，不必 mock 整支 `useStepCounter` 模組
 * （`src/tests/stepCounter.test.tsx` 同時也用 renderHook 直接測 hook 本身，
 * 兩者共用同一支模組時 `vi.mock` 會互相干擾，拆開後就沒有這個問題）。
 */
export function StepCounterView({ status, todaySteps, start, stop }: UseStepCounterResult) {
  const { t } = useTranslation();
  const isActive = status === 'counting' || status === 'paused';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p>{t('health.stepCounter.estimateDisclaimer')}</p>
          <p>{t('health.stepCounter.foregroundOnly')}</p>
        </div>
      </div>

      {status === 'denied' && (
        <Alert variant="destructive">
          <LockIcon />
          <AlertTitle>{t('health.stepCounter.deniedTitle')}</AlertTitle>
          <AlertDescription>{t('health.stepCounter.deniedDesc')}</AlertDescription>
        </Alert>
      )}

      {status === 'unsupported' && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t('health.stepCounter.unsupportedTitle')}</AlertTitle>
          <AlertDescription>{t('health.stepCounter.unsupportedDesc')}</AlertDescription>
        </Alert>
      )}

      {isActive && todaySteps !== null && (
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FootprintsIcon aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('health.stepCounter.todayLabel')}
            </span>
            <span className="num text-2xl font-bold text-ink">
              {t('health.steps.stepsValue', { count: todaySteps })}
            </span>
          </div>
        </div>
      )}

      <div>
        {isActive ? (
          <Button type="button" variant="outline" onClick={stop}>
            <SquareIcon data-icon="inline-start" aria-hidden="true" />
            {t('health.stepCounter.stop')}
          </Button>
        ) : status === 'unsupported' ? (
          <Button type="button" onClick={start}>
            <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            {t('health.stepCounter.retry')}
          </Button>
        ) : (
          <Button type="button" onClick={start} disabled={status === 'requesting'}>
            <PlayIcon data-icon="inline-start" aria-hidden="true" />
            {status === 'requesting'
              ? t('health.stepCounter.requesting')
              : t('health.stepCounter.start')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function StepCounterPanel() {
  const result = useStepCounter();
  return <StepCounterView {...result} />;
}
