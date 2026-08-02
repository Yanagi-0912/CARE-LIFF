import { describe, it, expect, vi } from 'vitest';
import {
  pathFromLiffState,
  restorePathFromLiffStateSearch,
  stripLoginPrefixPath,
} from '../utils/liffState';

describe('stripLoginPrefixPath', () => {
  it('剝除 /login 誤拼接', () => {
    expect(stripLoginPrefixPath('/login/settings')).toBe('/settings');
    expect(stripLoginPrefixPath('/login/family')).toBe('/family');
    expect(stripLoginPrefixPath('/login')).toBeNull();
    expect(stripLoginPrefixPath('/settings')).toBeNull();
  });
});

describe('pathFromLiffState', () => {
  it('還原 /settings', () => {
    expect(pathFromLiffState('/settings')).toBe('/settings');
    expect(pathFromLiffState('%2Fsettings')).toBe('/settings');
    expect(pathFromLiffState('\\/settings')).toBe('/settings');
  });

  it('還原 /family 與 query', () => {
    expect(pathFromLiffState('/family?tab=1')).toBe('/family?tab=1');
  });

  it('處理 login/settings 形式的 liff.state', () => {
    expect(pathFromLiffState('/login/settings')).toBe('/settings');
  });

  it('空值回 null', () => {
    expect(pathFromLiffState(null)).toBeNull();
    expect(pathFromLiffState('')).toBeNull();
  });
});

describe('restorePathFromLiffStateSearch', () => {
  it('從 /login?liff.state=/settings 還原到 /settings', () => {
    const replaceState = vi.fn();
    const changed = restorePathFromLiffStateSearch(
      '?liff.state=%2Fsettings',
      '/login',
      replaceState,
    );
    expect(changed).toBe(true);
    expect(replaceState).toHaveBeenCalledWith('/settings');
  });

  it('從 /login/settings 剝成 /settings', () => {
    const replaceState = vi.fn();
    const changed = restorePathFromLiffStateSearch('', '/login/settings', replaceState);
    expect(changed).toBe(true);
    expect(replaceState).toHaveBeenCalledWith('/settings');
  });

  it('已在目標 path 時清掉 liff.state', () => {
    const replaceState = vi.fn();
    const changed = restorePathFromLiffStateSearch(
      '?liff.state=%2Ffamily&other=1',
      '/family',
      replaceState,
    );
    expect(changed).toBe(true);
    expect(replaceState).toHaveBeenCalledWith('/family?other=1');
  });

  it('沒有 liff.state 不改寫', () => {
    const replaceState = vi.fn();
    expect(
      restorePathFromLiffStateSearch('?foo=1', '/login', replaceState),
    ).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
