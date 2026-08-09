import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LiffAuthProvider, useLiffAuth } from '../context/LiffAuthProvider';

// vi.mock 的 factory 會被提升到 import 之前，所以 mock 物件要用 vi.hoisted 建立
const liffMock = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  isLoggedIn: vi.fn(() => false),
  isInClient: vi.fn(() => false),
  getIDToken: vi.fn<() => string | null>(() => null),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@line/liff', () => ({ default: liffMock }));

function Probe() {
  const { isLoggedIn, logout } = useLiffAuth();
  return (
    <div>
      <span data-testid="state">{isLoggedIn ? 'in' : 'out'}</span>
      <button onClick={logout}>logout</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <LiffAuthProvider>
      <Probe />
    </LiffAuthProvider>,
  );

describe('LiffAuthProvider 登出行為', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    liffMock.isLoggedIn.mockReturnValue(false);
  });

  it('登出後應清空憑證、切為未登入，並寫入主動登出旗標', async () => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'dummy-token');
    localStorage.setItem('CARE_LINE_USER_ID', 'U123');

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(screen.getByTestId('state')).toHaveTextContent('out');
    expect(localStorage.getItem('CARE_AUTH_TOKEN')).toBeNull();
    expect(localStorage.getItem('CARE_LINE_USER_ID')).toBeNull();
    expect(sessionStorage.getItem('CARE_LOGGED_OUT')).toBe('1');
  });

  it('LINE 端仍在登入狀態時，登出要一併呼叫 liff.logout()', async () => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'dummy-token');
    liffMock.isLoggedIn.mockReturnValue(true);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(liffMock.logout).toHaveBeenCalledTimes(1);
  });

  it('liff 尚未初始化導致 isLoggedIn() 拋錯時，登出仍要成功', async () => {
    localStorage.setItem('CARE_AUTH_TOKEN', 'dummy-token');
    liffMock.isLoggedIn.mockImplementation(() => {
      throw new Error('LIFF is not initialized');
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(screen.getByTestId('state')).toHaveTextContent('out');
    expect(localStorage.getItem('CARE_AUTH_TOKEN')).toBeNull();
  });

  it('帶著主動登出旗標掛載時，不可用殘留的 token 自動登入回去', async () => {
    sessionStorage.setItem('CARE_LOGGED_OUT', '1');
    localStorage.setItem('CARE_AUTH_TOKEN', 'stale-token');

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(localStorage.getItem('CARE_AUTH_TOKEN')).toBeNull();
  });
});
