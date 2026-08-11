import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Stepper, { Step } from '../components/Stepper/Stepper';

describe('Stepper', () => {
  it('可前進、返回並完成最後一步', async () => {
    const onStepChange = vi.fn();
    const onFinalStepCompleted = vi.fn().mockResolvedValue(undefined);

    render(
      <Stepper
        onStepChange={onStepChange}
        onFinalStepCompleted={onFinalStepCompleted}
        backButtonText="上一步"
        nextButtonText="下一步"
        completeButtonText="完成"
      >
        <Step>
          <h2>第一步</h2>
        </Step>
        <Step>
          <h2>第二步</h2>
        </Step>
      </Stepper>,
    );

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('第二步')).toBeTruthy();
    expect(onStepChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    expect(await screen.findByText('第一步')).toBeTruthy();
    expect(onStepChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '完成' }));

    await waitFor(() => expect(onFinalStepCompleted).toHaveBeenCalledOnce());
  });

  it('下一步被停用時不會切換步驟', () => {
    const onStepChange = vi.fn();

    render(
      <Stepper onStepChange={onStepChange} nextButtonProps={{ disabled: true }}>
        <Step>第一步</Step>
        <Step>第二步</Step>
      </Stepper>,
    );

    const nextButton = screen.getByRole('button', { name: 'Continue' });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(nextButton);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  // 進度改由可見的 shadcn Progress 承載（原本是手刻圓點＋一個 sr-only Progress）。
  // 文案不內建在元件裡，由 stepLabel 提供 —— 專案有六個語言，元件不該寫死中文。
  it('progressbar 的進度與可及名稱隨步驟更新', async () => {
    render(
      <Stepper
        nextButtonText="下一步"
        completeButtonText="完成"
        stepLabel={(current, total) => `步驟 ${current} / ${total}`}
      >
        <Step>第一步</Step>
        <Step>第二步</Step>
      </Stepper>,
    );

    const bar = screen.getByRole('progressbar', { name: '步驟 1 / 2' });
    expect(bar.getAttribute('aria-valuenow')).toBe('50');

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'),
    );
    expect(screen.getByRole('progressbar', { name: '步驟 2 / 2' })).toBeTruthy();
  });
});
