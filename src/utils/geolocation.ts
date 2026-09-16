import i18n from '../i18n';

/** 瀏覽器 Geolocation 結果（精準 GPS，需使用者同意） */
export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type GeoErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export class GeolocationError extends Error {
  readonly code: GeoErrorCode;

  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

/** 高精度：適合戶外 GPS；在 LINE WebView / 室內較容易逾時 */
const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 60_000,
};

/** 一般定位：網路／Wi‑Fi 輔助，較快、較不易逾時 */
const LOW_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 25_000,
  maximumAge: 5 * 60_000,
};

/** LINE 內建瀏覽器／一般瀏覽器皆需安全上下文（HTTPS 或 localhost）才能取位置 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureGeolocationContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

function mapPositionError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError('permission_denied', i18n.t('nearby.geo.permissionDenied'));
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError('unavailable', i18n.t('nearby.geo.unavailable'));
    case error.TIMEOUT:
      return new GeolocationError('timeout', i18n.t('nearby.geo.timeout'));
    default:
      // 瀏覽器給的 message 是英文技術句，留給 console，畫面上講人話
      console.error('定位失敗', error.code, error.message);
      return new GeolocationError('unknown', i18n.t('nearby.geo.failed'));
  }
}

function toGeoPosition(position: GeolocationPosition): GeoPosition {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

function requestOnce(options: PositionOptions): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toGeoPosition(position)),
      (error) => reject(mapPositionError(error)),
      options,
    );
  });
}

function assertCanRequestPosition(): void {
  if (!isGeolocationSupported()) {
    throw new GeolocationError('unsupported', i18n.t('nearby.geo.unsupported'));
  }

  if (!isSecureGeolocationContext()) {
    // 非安全上下文（非 HTTPS／localhost）拿不到定位。對使用者只說「從 LINE 開」就好，
    // HTTPS 是開發者才需要知道的原因。
    throw new GeolocationError('insecure', i18n.t('nearby.geo.insecure'));
  }
}

/**
 * 單次請求目前位置（必須由使用者手勢觸發）。
 * 注意：非 HTTPS（且非 localhost）會失敗；LINE 內建瀏覽器也可能限制權限。
 */
export function getCurrentPosition(
  options: PositionOptions = HIGH_ACCURACY_OPTIONS,
): Promise<GeoPosition> {
  try {
    assertCanRequestPosition();
  } catch (err) {
    return Promise.reject(err);
  }

  return requestOnce({ ...HIGH_ACCURACY_OPTIONS, ...options });
}

function isRetryableGeoError(err: unknown): boolean {
  return (
    err instanceof GeolocationError &&
    (err.code === 'timeout' || err.code === 'unavailable')
  );
}

/**
 * 先試高精度 GPS；逾時或無法取得時改用網路輔助定位（較適合 LINE 內建瀏覽器）。
 * 權限被拒不會重試。
 */
export async function getCurrentPositionWithFallback(
  options?: PositionOptions,
): Promise<GeoPosition> {
  assertCanRequestPosition();

  try {
    return await requestOnce({ ...HIGH_ACCURACY_OPTIONS, ...options });
  } catch (err) {
    if (!isRetryableGeoError(err)) {
      throw err;
    }

    try {
      return await requestOnce({
        ...LOW_ACCURACY_OPTIONS,
        ...options,
        enableHighAccuracy: false,
      });
    } catch (fallbackErr) {
      // 兩次都失敗時，保留較具意義的錯誤（優先顯示逾時／無法取得）
      if (fallbackErr instanceof GeolocationError) {
        throw fallbackErr;
      }
      throw err;
    }
  }
}

/** 持續定位：走失求救時長輩的定位頁用。maximumAge 短，家人看到的才是現在的位置 */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 10_000,
};

/**
 * 持續回報位置，回傳停止函式。
 *
 * 逾時與暫時無法取得位置不停止：人在騎樓下、地下道裡，走出來就又有訊號，
 * 瀏覽器會繼續回報。只有權限被拒（再等也不會變）才由呼叫端決定要不要停，
 * 這裡照樣把錯誤交出去。
 */
export function watchPositionUpdates(
  onPosition: (position: GeoPosition) => void,
  onError: (error: GeolocationError) => void,
  options: PositionOptions = WATCH_OPTIONS,
): () => void {
  try {
    assertCanRequestPosition();
  } catch (err) {
    onError(err as GeolocationError);
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onPosition(toGeoPosition(position)),
    (error) => onError(mapPositionError(error)),
    { ...WATCH_OPTIONS, ...options },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
