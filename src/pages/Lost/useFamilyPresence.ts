import { useCallback, useEffect, useRef, useState } from 'react';
import { reportLostPresence } from '../../api/lostApi';
import {
  watchPositionUpdates,
  type GeoPosition,
  type GeolocationError,
} from '../../utils/geolocation';

/**
 * 回報間隔，跟地圖頁輪詢位置同一個節奏（WatchPage 的 POLL_INTERVAL_MS）。後端
 * 45 秒沒收到就當作離開了地圖頁（lost_location_service 的 FAMILY_ONLINE_WITHIN）。
 */
export const PRESENCE_INTERVAL_MS = 15_000;

export interface FamilyPresence {
  coming: boolean;
  setComing: (next: boolean) => void;
  /** 按了「我要過去找」之後拿到過定位沒有 */
  hasFix: boolean;
  geoError: GeolocationError | null;
}

/**
 * 家人地圖頁：讓長輩知道「誰正在看」與「誰正在過來」。
 *
 * 開著頁面就定時回報一次「我在看」；按了「我要過去找」才開始定位，回報時附上
 * 位置。沒按之前不問定位權限：家人不一定要出門，也不該沒問就把他的位置送出去。
 *
 * `initialComing` 是伺服器記得的狀態（重新整理頁面後按鈕要接得上）。拿到它之前
 * 不回報：頁面一打開就送「沒要過去」，會把他的位置從長輩畫面上清掉。
 *
 * 回報失敗不提示：下一輪會再送，對家人來說地圖照常可用。
 */
export function useFamilyPresence(
  userId: string,
  enabled: boolean,
  initialComing: boolean | undefined,
): FamilyPresence {
  // 家人自己按過按鈕之前，照伺服器記得的狀態
  const [chosen, setChosen] = useState<boolean | null>(null);
  const ready = chosen !== null || initialComing !== undefined;
  const coming = chosen ?? initialComing ?? false;
  const [hasFix, setHasFix] = useState(false);
  const [geoError, setGeoError] = useState<GeolocationError | null>(null);
  const comingRef = useRef(coming);
  const latestRef = useRef<GeoPosition | null>(null);

  // 排在送出的 effect 前面：第一次回報時 ref 已經是伺服器記得的狀態
  useEffect(() => {
    comingRef.current = coming;
  }, [coming]);

  const send = useCallback(async () => {
    const latest = comingRef.current ? latestRef.current : null;
    try {
      await reportLostPresence(userId, {
        coming: comingRef.current,
        latitude: latest?.latitude ?? null,
        longitude: latest?.longitude ?? null,
        accuracy: latest && Number.isFinite(latest.accuracy) ? latest.accuracy : null,
      });
    } catch {
      // 下一輪再送
    }
  }, [userId]);

  useEffect(() => {
    if (!enabled || !ready) return;
    void send();
    const timer = window.setInterval(() => void send(), PRESENCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, ready, send]);

  useEffect(() => {
    if (!enabled || !coming) {
      latestRef.current = null;
      return;
    }
    let first = true;
    return watchPositionUpdates(
      (next) => {
        latestRef.current = next;
        setHasFix(true);
        setGeoError(null);
        // 第一個位置立刻送，長輩不必多等一輪才看到距離
        if (first) {
          first = false;
          void send();
        }
      },
      (error) => setGeoError(error),
    );
  }, [enabled, coming, send]);

  const setComing = useCallback(
    (next: boolean) => {
      comingRef.current = next;
      setChosen(next);
      setGeoError(null);
      if (!next) setHasFix(false);
      // 立刻送：按下「我要過去找」長輩就該收到通知，不等定位、不等下一輪
      void send();
    },
    [send],
  );

  return { coming, setComing, hasFix, geoError };
}
