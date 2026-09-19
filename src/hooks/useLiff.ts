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
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // 沒設 VITE_LIFF_ID 在這裡什麼都不用做：那是建置時就決定的事，
    // 下面直接推導出錯誤訊息，不必寫進 state 再讓元件多 render 一輪。
    if (!LIFF_AVAILABLE) return;

    let cancelled = false;

    initLiff()
      .then(() => {
        if (!cancelled) setLiffReady(true);
      })
      .catch((err) => {
        if (!cancelled) setInitError(err?.message || 'LIFF 初始化失敗');
      });

    return () => { cancelled = true; };
  }, []);

  return { liffReady, liffError: LIFF_AVAILABLE ? initError : 'VITE_LIFF_ID 未設定' };
}
