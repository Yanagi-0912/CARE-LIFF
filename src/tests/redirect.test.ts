import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveRedirectUrl,
  consumeRedirectUrl,
  peekRedirectUrl,
  redirectFromSearch,
  resolveAppPath,
} from '../utils/redirect';

describe('resolveAppPath', () => {
  it('相對路徑原樣保留', () => {
    expect(resolveAppPath('/settings', 'https://care.example')).toBe('/settings');
    expect(resolveAppPath('/family?x=1', 'https://care.example')).toBe('/family?x=1');
  });

  it('同站完整 URL 取 path', () => {
    expect(
      resolveAppPath('https://care.example/settings', 'https://care.example'),
    ).toBe('/settings');
  });

  it('liff.line.me 深連結剝掉 liffId', () => {
    expect(
      resolveAppPath(
        'https://liff.line.me/2009177739-JJrPzjAn/settings',
        'https://care.example',
      ),
    ).toBe('/settings');
  });
});

describe('save/consumeRedirectUrl', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('consume 後清除', () => {
    saveRedirectUrl('/settings');
    expect(peekRedirectUrl()).toBe('/settings');
    expect(consumeRedirectUrl()).toBe('/settings');
    expect(consumeRedirectUrl()).toBeNull();
  });

  it('忽略 /login 本身', () => {
    saveRedirectUrl('/login');
    expect(peekRedirectUrl()).toBeNull();
  });

  it('完整網址或 liff.line.me 深連結指向 /login 也要擋，不能蓋掉已存的深連結', () => {
    saveRedirectUrl('/join?code=abc');
    saveRedirectUrl(`${window.location.origin}/login`);
    saveRedirectUrl(`${window.location.origin}/login?redirect=%2Fjoin`);
    saveRedirectUrl('https://liff.line.me/2009177739-JJrPzjAn/login');
    expect(peekRedirectUrl()).toBe('/join?code=abc');
  });

  it('完整網址指向其他頁面照常保存', () => {
    saveRedirectUrl(`${window.location.origin}/settings`);
    expect(peekRedirectUrl()).toBe(`${window.location.origin}/settings`);
  });
});

describe('redirectFromSearch', () => {
  it('解析 redirect query', () => {
    expect(redirectFromSearch('?redirect=%2Fsettings')).toBe('/settings');
    expect(redirectFromSearch('?redirect=%2Ffamily')).toBe('/family');
    expect(redirectFromSearch('?foo=1')).toBeNull();
  });
});
