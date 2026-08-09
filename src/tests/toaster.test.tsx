import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';

/**
 * 迴歸測試：toast 曾經被底部導覽列（pill bar）整個蓋住。
 *
 * 原因是偏移量寫在 style 裡的 --offset-bottom，但 sonner 內部是
 * style={{ ...style, ...assignOffset(offset, mobileOffset) }}，
 * 會無條件覆寫這兩組變數；而 ≤600px 時定位又是吃 --mobile-offset-bottom。
 * 所以兩個 props 都得給，缺一個手機上就會退回預設的 16px。
 */
describe('Toaster 底部偏移', () => {
  it('桌機與手機的 offset 都要讓開 --bottom-h', async () => {
    render(<Toaster />);
    toast.success('hi');

    await waitFor(() => {
      expect(document.querySelector('[data-sonner-toaster]')).not.toBeNull();
    });

    const toaster = document.querySelector('[data-sonner-toaster]') as HTMLElement;
    const expected = 'calc(var(--bottom-h) + 16px)';

    expect(toaster.style.getPropertyValue('--offset-bottom')).toBe(expected);
    expect(toaster.style.getPropertyValue('--mobile-offset-bottom')).toBe(expected);
  });
});
