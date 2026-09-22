import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import liff from '@line/liff';

/** 「剛剛／N 秒前／N 分鐘前」。超過一小時仍用分鐘：走失求救 2 小時就結束，不需要更大的單位 */
export function formatElapsed(t: TFunction, elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 10) return t('lost.time.justNow');
  if (seconds < 60) return t('lost.time.seconds', { count: seconds });
  return t('lost.time.minutes', { count: Math.floor(seconds / 60) });
}

/** 每隔一段時間重新渲染一次，「N 秒前」才會自己往上跳 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 回到 LINE 聊天室。LINE 以外（瀏覽器直接開）沒有聊天室可回，回傳 false 由頁面決定 */
export function closeToChat(): boolean {
  if (liff.isInClient()) {
    liff.closeWindow();
    return true;
  }
  return false;
}

export function googleMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${latitude},${longitude}`,
  )}`;
}

/**
 * 長輩畫面上的「離你約 800 公尺」。後端給的是直線距離，實際走的路一定更長，
 * 所以只到百公尺：一公里內四捨五入到 100 公尺（最少寫 100 公尺，不寫「0 公尺」
 * 讓人以為已經到了），一公里以上寫到小數點後一位。
 */
export function formatDistance(t: TFunction, meters: number): string {
  if (meters < 950) {
    return t('lost.distance.meters', { meters: Math.max(100, Math.round(meters / 100) * 100) });
  }
  return t('lost.distance.km', { km: (Math.round(meters / 100) / 10).toFixed(1) });
}
