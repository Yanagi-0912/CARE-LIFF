import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  GeolocationError,
  getCurrentPosition,
  getCurrentPositionWithFallback,
  isGeolocationSupported,
  isSecureGeolocationContext,
} from '../utils/geolocation'

function mockGeoError(code: 1 | 2 | 3, message: string): GeolocationPositionError {
  return {
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message,
  } as GeolocationPositionError
}

function mockGeoSuccess(): GeolocationPosition {
  return {
    coords: {
      latitude: 25.033,
      longitude: 121.565,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 123,
    toJSON: () => ({}),
  }
}

describe('geolocation utils', () => {
  const originalNavigator = globalThis.navigator
  const originalIsSecureContext = Object.getOwnPropertyDescriptor(
    window,
    'isSecureContext',
  )

  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      get: () => true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
    if (originalIsSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalIsSecureContext)
    }
  })

  it('detects unsupported geolocation', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    })
    expect(isGeolocationSupported()).toBe(false)
  })

  it('rejects insecure context', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      get: () => false,
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: vi.fn(),
        },
      },
    })

    await expect(getCurrentPosition()).rejects.toMatchObject({
      code: 'insecure',
    })
  })

  it('resolves current position', async () => {
    const getCurrentPositionMock = vi.fn((_success: PositionCallback) => {
      _success(mockGeoSuccess())
    })

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: { getCurrentPosition: getCurrentPositionMock },
      },
    })

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 25.033,
      longitude: 121.565,
      accuracy: 12,
      timestamp: 123,
    })
  })

  it('maps permission denied', async () => {
    const getCurrentPositionMock = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error(mockGeoError(1, 'denied'))
      },
    )

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: { getCurrentPosition: getCurrentPositionMock },
      },
    })

    await expect(getCurrentPosition()).rejects.toBeInstanceOf(GeolocationError)
    await expect(getCurrentPosition()).rejects.toMatchObject({
      code: 'permission_denied',
    })
  })

  it('falls back to low accuracy after timeout', async () => {
    const getCurrentPositionMock = vi
      .fn()
      .mockImplementationOnce(
        (_success: PositionCallback, error: PositionErrorCallback) => {
          error(mockGeoError(3, 'timeout'))
        },
      )
      .mockImplementationOnce((_success: PositionCallback) => {
        _success(mockGeoSuccess())
      })

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: { getCurrentPosition: getCurrentPositionMock },
      },
    })

    await expect(getCurrentPositionWithFallback()).resolves.toMatchObject({
      latitude: 25.033,
      longitude: 121.565,
    })
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(2)
    expect(getCurrentPositionMock.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
    })
    expect(getCurrentPositionMock.mock.calls[1][2]).toMatchObject({
      enableHighAccuracy: false,
    })
  })

  it('does not fall back when permission is denied', async () => {
    const getCurrentPositionMock = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error(mockGeoError(1, 'denied'))
      },
    )

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: { getCurrentPosition: getCurrentPositionMock },
      },
    })

    await expect(getCurrentPositionWithFallback()).rejects.toMatchObject({
      code: 'permission_denied',
    })
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1)
  })

  it('reports secure context helper', () => {
    expect(isSecureGeolocationContext()).toBe(true)
  })
})
