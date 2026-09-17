import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadLostLocation } from '../../api/lostApi';
import type { LostStatus } from '../../types/lost';
import {
  watchPositionUpdates,
  type GeoPosition,
  type GeolocationError,
} from '../../utils/geolocation';

/**
 * 上傳間隔。家人的地圖每 15 秒輪詢一次，比那更密的上傳家人也看不到；後端判定
 * 「停止更新」是 3 分鐘，20 秒一次等於連漏 9 次才會誤報。
 */
export const UPLOAD_INTERVAL_MS = 20_000;

export interface LocationSharingState {
  position: GeoPosition | null;
  lastSentAt: number | null;
  geoError: GeolocationError | null;
  uploadFailed: boolean;
}

/**
 * 長輩定位頁的核心：持續定位、定時上傳、讓螢幕保持亮著。
 *
 * 上傳是「每 20 秒送一次手上最新的位置」，不是「位置變了才送」：人站著不動時
 * 瀏覽器可能好幾分鐘都不回報新位置，只在變動時上傳的話，後端會把「站著等家人」
 * 誤判成「畫面被關掉了」。
 *
 * 後端回 active=false（家人按了已找到、時間到）時呼叫 onEnded 並停止一切。
 */
export function useLocationSharing(
  enabled: boolean,
  onEnded: (status: LostStatus) => void,
): LocationSharingState {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<GeolocationError | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);

  const latestRef = useRef<GeoPosition | null>(null);
  const inFlightRef = useRef(false);
  const sentOnceRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const upload = useCallback(async () => {
    const latest = latestRef.current;
    if (!latest || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const status = await uploadLostLocation({
        latitude: latest.latitude,
        longitude: latest.longitude,
        accuracy: Number.isFinite(latest.accuracy) ? latest.accuracy : null,
      });
      setLastSentAt(Date.now());
      setUploadFailed(false);
      if (!status.active) onEndedRef.current(status.status ?? 'expired');
    } catch {
      // 網路斷一下很常見，下一輪再送；畫面上只提示「正在重試」
      setUploadFailed(true);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    sentOnceRef.current = false;

    const stopWatching = watchPositionUpdates(
      (next) => {
        latestRef.current = next;
        setPosition(next);
        setGeoError(null);
        // 第一個位置立刻送，家人不必多等 20 秒
        if (!sentOnceRef.current) {
          sentOnceRef.current = true;
          void upload();
        }
      },
      (error) => setGeoError(error),
    );
    const timer = window.setInterval(() => void upload(), UPLOAD_INTERVAL_MS);

    // 讓螢幕保持亮著：長輩手機一鎖屏，瀏覽器就停止回報位置。不支援的 WebView
    // 直接略過，畫面上的「請不要關掉這個畫面」是唯一的防線。
    let wakeLock: WakeLockSentinel | null = null;
    let disposed = false;
    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (disposed) {
          void sentinel.release();
          return;
        }
        wakeLock = sentinel;
      } catch {
        // 省電模式、不支援的 WebView：拿不到就算了
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // 從背景回來：鎖屏期間 wake lock 已被系統收回，要再要一次。不在這裡立刻
      // 上傳：手上的位置是鎖屏前的，等 watchPosition 送來新位置再由計時器送出，
      // 家人才不會看到「剛剛更新」卻是舊座標。
      void requestWakeLock();
    };
    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      stopWatching();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (wakeLock) void wakeLock.release();
    };
  }, [enabled, upload]);

  return { position, lastSentAt, geoError, uploadFailed };
}
