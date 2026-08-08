import type { ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';

import { Toaster } from '@/components/ui/sonner';

/**
 * 與 App 一致的測試渲染：一併掛上 Toaster。
 *
 * Sonner 是把 toast 渲染到 Toaster 底下的 portal，
 * 沒掛 Toaster 的話 toast 內容不會進入 DOM，
 * 任何斷言 toast 文字的測試都會失敗。
 */
export function renderWithToaster(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(
    <>
      {ui}
      <Toaster />
    </>,
    options,
  );
}
