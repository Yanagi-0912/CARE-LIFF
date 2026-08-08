import type { ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/sonner';

/**
 * 每個測試用全新的 QueryClient，避免測試之間共用快取而互相污染。
 * retry 關掉：測試裡的失敗案例不該等重試，否則會逾時。
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * 與 App 一致的測試渲染：掛上 QueryClientProvider 與 Toaster。
 *
 * - useQuery 沒有 Provider 會直接拋錯。
 * - Sonner 是把 toast 渲染到 Toaster 底下的 portal，沒掛 Toaster 的話
 *   toast 內容不會進入 DOM，斷言 toast 文字的測試都會失敗。
 */
export function renderWithToaster(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
    options,
  );
}
