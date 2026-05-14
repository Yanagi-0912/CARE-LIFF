import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error';

interface Toast {
  msg: string;
  type: ToastType;
}

/**
 * Toast 提示 hook
 * @param duration 自動消失毫秒數（預設 3000）
 */
export function useToast(duration = 3000) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast, duration]);

  const showToast = useCallback((msg: string, type: ToastType) => {
    setToast({ msg, type });
  }, []);

  return { toast, showToast };
}
