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
      return new GeolocationError(
        'permission_denied',
        '您已拒絕位置權限，請在系統或 LINE 瀏覽器設定中允許後再試',
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError(
        'unavailable',
        '無法取得位置資訊，請確認裝置定位已開啟',
      );
    case error.TIMEOUT:
      return new GeolocationError('timeout', '定位逾時，請再試一次');
    default:
      return new GeolocationError('unknown', error.message || '定位失敗');
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
    throw new GeolocationError('unsupported', '此環境不支援瀏覽器定位');
  }

  if (!isSecureGeolocationContext()) {
    throw new GeolocationError(
      'insecure',
      '定位需要 HTTPS（或本機 localhost）。請透過正式 LIFF 網址開啟',
    );
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
