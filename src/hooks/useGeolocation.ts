import { useCallback, useState } from 'react';
import {
  GeolocationError,
  getCurrentPositionWithFallback,
  type GeoErrorCode,
  type GeoPosition,
} from '../utils/geolocation';

interface UseGeolocationReturn {
  position: GeoPosition | null;
  loading: boolean;
  errorCode: GeoErrorCode | null;
  errorMessage: string | null;
  requestPosition: (options?: PositionOptions) => Promise<GeoPosition | null>;
  clearError: () => void;
}

/**
 * 精確位置需使用者同意後才能取得；請在按鈕 onClick 呼叫 requestPosition。
 */
export function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<GeoErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setErrorCode(null);
    setErrorMessage(null);
  }, []);

  const requestPosition = useCallback(async (options?: PositionOptions) => {
    setLoading(true);
    setErrorCode(null);
    setErrorMessage(null);

    try {
      const next = await getCurrentPositionWithFallback(options);
      setPosition(next);
      return next;
    } catch (err) {
      if (err instanceof GeolocationError) {
        setErrorCode(err.code);
        setErrorMessage(err.message);
      } else {
        setErrorCode('unknown');
        setErrorMessage(err instanceof Error ? err.message : '定位失敗');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    position,
    loading,
    errorCode,
    errorMessage,
    requestPosition,
    clearError,
  };
}
