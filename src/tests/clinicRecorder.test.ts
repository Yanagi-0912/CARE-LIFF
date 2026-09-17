import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectSupport } from '../hooks/useClinicRecorder';

/**
 * 能力偵測是這個功能的閘門：LIFF 的內建瀏覽器能不能錄音只能用真手機驗，
 * 程式這邊唯一能保證的是「擋下來的時候說得出是哪一種原因」，
 * 因為每一種原因對使用者的下一步都不同。
 */

const original = {
  isSecureContext: window.isSecureContext,
  mediaDevices: navigator.mediaDevices,
  MediaRecorder: globalThis.MediaRecorder,
};

function setEnvironment(options: {
  secure?: boolean;
  getUserMedia?: boolean;
  mediaRecorder?: boolean;
  supportedTypes?: string[];
}) {
  const {
    secure = true,
    getUserMedia = true,
    mediaRecorder = true,
    supportedTypes = ['audio/webm'],
  } = options;

  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: getUserMedia ? { getUserMedia: vi.fn() } : undefined,
    configurable: true,
  });
  if (mediaRecorder) {
    (globalThis as Record<string, unknown>).MediaRecorder = {
      isTypeSupported: (type: string) => supportedTypes.includes(type),
    };
  } else {
    delete (globalThis as Record<string, unknown>).MediaRecorder;
  }
}

afterEach(() => {
  Object.defineProperty(window, 'isSecureContext', {
    value: original.isSecureContext,
    configurable: true,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: original.mediaDevices,
    configurable: true,
  });
  (globalThis as Record<string, unknown>).MediaRecorder = original.MediaRecorder;
});

describe('錄音能力偵測', () => {
  it('條件都滿足時不擋', () => {
    setEnvironment({});
    expect(detectSupport()).toBeNull();
  });

  it('非安全情境回 insecure 而不是 no-api', () => {
    // getUserMedia 只在安全情境下存在，先判 isSecureContext 才不會誤報成 no-api，
    // 兩者對使用者的下一步完全不同。
    setEnvironment({ secure: false, getUserMedia: false });
    expect(detectSupport()).toBe('insecure');
  });

  it('沒有 getUserMedia 回 no-api', () => {
    setEnvironment({ getUserMedia: false });
    expect(detectSupport()).toBe('no-api');
  });

  it('沒有 MediaRecorder 回 no-api', () => {
    setEnvironment({ mediaRecorder: false });
    expect(detectSupport()).toBe('no-api');
  });

  it('有 MediaRecorder 但格式全不支援時仍放行，交給瀏覽器挑預設格式', () => {
    // isTypeSupported 全 false 不代表錄不了：有些瀏覽器只是不回答這個問題。
    // 真的建不起來會在 start() 裡被接住並回報 no-mime，不在這裡先擋死。
    setEnvironment({ supportedTypes: [] });
    expect(detectSupport()).toBeNull();
  });

  it('iOS 常見組合：有 getUserMedia 但沒有 MediaRecorder', () => {
    setEnvironment({ mediaRecorder: false });
    expect(detectSupport()).toBe('no-api');
  });
});
