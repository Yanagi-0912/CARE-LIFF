import { getFreshIdToken, resetIdTokenRefreshForTest } from '../lib/liffClient';

// vi.mock 的 factory 會被提升到 import 之前，所以 mock 物件要用 vi.hoisted 建立
const liffMock = vi.hoisted(() => ({
  getDecodedIDToken: vi.fn<() => { exp?: number } | null>(() => null),
  getIDToken: vi.fn<() => string | null>(() => 'id-token'),
  isInClient: vi.fn(() => false),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@line/liff', () => ({ default: liffMock }));

const NOW = Date.UTC(2026, 8, 17, 6, 0, 0);
const secondsFromNow = (s: number) => Math.floor(NOW / 1000) + s;

describe('getFreshIdToken：LIFF 快取的 ID token 過期時要換新', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetIdTokenRefreshForTest();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.stubGlobal('location', { ...window.location, reload });
    liffMock.getIDToken.mockReturnValue('id-token');
    liffMock.isInClient.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('還沒過期就直接用快取的 token', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(30 * 60) });

    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'ready', idToken: 'id-token' });
    expect(liffMock.logout).not.toHaveBeenCalled();
  });

  it('外部瀏覽器：過期就登出再登入，不把舊 token 送給後端', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(-10) });

    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'refreshing' });
    expect(liffMock.logout).toHaveBeenCalledTimes(1);
    expect(liffMock.login).toHaveBeenCalledWith({ redirectUri: 'https://care/login' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('LINE 內建瀏覽器不能呼叫 liff.login()，改成重新整理', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(-10) });
    liffMock.isInClient.mockReturnValue(true);

    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'refreshing' });
    expect(liffMock.login).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('一分鐘內就要過期的也先換，免得送到 LINE 時已經過期', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(30) });

    expect(getFreshIdToken('https://care/login').status).toBe('refreshing');
  });

  it('同一次載入第二個呼叫者不再重複換新', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(-10) });

    getFreshIdToken('https://care/login');
    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'refreshing' });
    expect(liffMock.logout).toHaveBeenCalledTimes(1);
  });

  it('剛換過還是過期（手機時鐘不準）時不再換，避免無限重導', () => {
    liffMock.getDecodedIDToken.mockReturnValue({ exp: secondsFromNow(-10) });
    getFreshIdToken('https://care/login');
    // 模擬換新導回來的新頁面：模組狀態重來，sessionStorage 還在
    resetIdTokenRefreshForTest();
    vi.clearAllMocks();

    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'ready', idToken: 'id-token' });
    expect(liffMock.logout).not.toHaveBeenCalled();
  });

  it('沒有解碼後的 token（例如尚未登入）時不動作', () => {
    liffMock.getDecodedIDToken.mockReturnValue(null);
    liffMock.getIDToken.mockReturnValue(null);

    expect(getFreshIdToken('https://care/login')).toEqual({ status: 'ready', idToken: null });
    expect(liffMock.logout).not.toHaveBeenCalled();
  });
});
