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
