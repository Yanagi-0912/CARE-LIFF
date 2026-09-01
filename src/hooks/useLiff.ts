import { useState, useEffect } from 'react';
import { LIFF_AVAILABLE, initLiff } from '../lib/liffClient';

interface UseLiffReturn {
  liffReady: boolean;
  liffError: string | null;
}

/**
 * 每個 LIFF 頁面掛載時呼叫一次 liff.init()
 * 符合 LINE 官方建議
 */
export function useLiff(): UseLiffReturn {
  const [liffReady, setLiffReady] = useState(false);
  const [liffError, setLiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!LIFF_AVAILABLE) {
      setLiffError('VITE_LIFF_ID 未設定');
      return;
    }

    let cancelled = false;

    initLiff()
      .then(() => {
        if (!cancelled) setLiffReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLiffError(err?.message || 'LIFF 初始化失敗');
      });

    return () => { cancelled = true; };
  }, []);

  return { liffReady, liffError };
}
